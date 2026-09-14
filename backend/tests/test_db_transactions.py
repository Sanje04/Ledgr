"""
Tests for db.py's transaction/account functions (Phase 4).

Hermetic, like test_chat.py: no real MongoDB needed. FakeCollection is a
minimal in-memory stand-in that understands only the query operators db.py
actually emits (equality, $lt, $gte, $lte, $nin, $regex/$options) against a
fixed list of canned documents -- it is not a general MongoDB emulator, just
enough to prove db.py's own filtering/serialization/aggregation logic is
correct given a query shape.

Async db.py functions are run via asyncio.run() inside plain `def` tests
rather than pulling in pytest-asyncio, matching this project's minimal test
dependencies (see requirements-dev.txt).
"""

import asyncio
import re
from datetime import datetime, timezone
from typing import Any

import pytest

import db

CHECKING = {"_id": "checking", "name": "Checking", "type": "checking", "current_balance": 1234.56}
SAVINGS = {"_id": "savings", "name": "Savings", "type": "savings", "current_balance": 9000.0}


def _txn(
    account_id: str,
    amount: float,
    category: str,
    date: str = "2026-08-15",
    merchant: str = "Test Merchant",
    description: str = "test transaction",
) -> dict[str, Any]:
    return {
        "_id": f"txn-{account_id}-{date}-{amount}",
        "account_id": account_id,
        "account_name": account_id.title(),
        "account_type": account_id,
        "date": datetime.fromisoformat(date).replace(tzinfo=timezone.utc),
        "amount": amount,
        "merchant": merchant,
        "description": description,
        "category": category,
        "running_balance": 0.0,
    }


class FakeCursor:
    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self._docs = docs

    def __aiter__(self):
        return self._generator()

    async def _generator(self):
        for doc in self._docs:
            yield doc


class FakeCollection:
    """Filters canned docs against the small operator set db.py emits -- see
    module docstring."""

    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self._docs = docs

    def find(
        self,
        query: dict[str, Any] | None = None,
        sort: list[tuple[str, int]] | None = None,
        limit: int = 0,
    ) -> FakeCursor:
        query = query or {}
        results = [doc for doc in self._docs if self._matches(doc, query)]
        if sort:
            for field, direction in reversed(sort):
                results.sort(key=lambda d: d[field], reverse=(direction == -1))
        if limit:
            results = results[:limit]
        return FakeCursor(results)

    @staticmethod
    def _matches(doc: dict[str, Any], query: dict[str, Any]) -> bool:
        for field, condition in query.items():
            value = doc.get(field)
            if isinstance(condition, dict):
                if "$regex" in condition:
                    flags = re.IGNORECASE if condition.get("$options") == "i" else 0
                    if not re.search(condition["$regex"], value or "", flags):
                        return False
                elif "$lt" in condition:
                    if not (value < condition["$lt"]):
                        return False
                elif "$nin" in condition:
                    if value in condition["$nin"]:
                        return False
                else:
                    if "$gte" in condition and not (value >= condition["$gte"]):
                        return False
                    if "$lte" in condition and not (value <= condition["$lte"]):
                        return False
            elif value != condition:
                return False
        return True


# --- _build_transaction_filter: pure function, no mocking needed ---


def test_build_transaction_filter_empty() -> None:
    assert db._build_transaction_filter() == {}


def test_build_transaction_filter_account_and_category() -> None:
    result = db._build_transaction_filter(account="checking", category="Groceries")
    assert result == {"account_id": "checking", "category": "Groceries"}


def test_build_transaction_filter_merchant_is_case_insensitive_regex() -> None:
    result = db._build_transaction_filter(merchant="Amazon")
    assert result == {"merchant": {"$regex": re.escape("Amazon"), "$options": "i"}}


def test_build_transaction_filter_date_range() -> None:
    result = db._build_transaction_filter(start_date="2026-08-01", end_date="2026-08-31")
    assert result["date"] == {
        "$gte": datetime(2026, 8, 1, tzinfo=timezone.utc),
        "$lte": datetime(2026, 8, 31, tzinfo=timezone.utc),
    }


def test_build_transaction_filter_amount_range() -> None:
    result = db._build_transaction_filter(min_amount=10, max_amount=100)
    assert result == {"amount": {"$gte": 10, "$lte": 100}}


# --- list_accounts / search_transactions / get_spending_summary ---


def test_list_accounts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(db, "accounts", FakeCollection([SAVINGS, CHECKING]))

    result = asyncio.run(db.list_accounts())

    assert result == [
        {"id": "checking", "name": "Checking", "type": "checking", "current_balance": 1234.56},
        {"id": "savings", "name": "Savings", "type": "savings", "current_balance": 9000.0},
    ]


def test_search_transactions_serializes_and_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    docs = [
        _txn("checking", -50.0, "Groceries", date="2026-08-01"),
        _txn("checking", -30.0, "Dining", date="2026-08-02"),
    ]
    monkeypatch.setattr(db, "transactions", FakeCollection(docs))

    result = asyncio.run(db.search_transactions(limit=1))

    assert len(result) == 1
    assert result[0]["category"] == "Dining"  # most recent first
    assert result[0]["date"] == "2026-08-02T00:00:00+00:00"
    assert "id" in result[0] and "_id" not in result[0]


def test_get_spending_summary_excludes_transfers_and_income_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    docs = [
        _txn("checking", -100.0, "Groceries"),
        _txn("checking", -50.0, "Dining"),
        _txn("checking", -500.0, "Transfer"),  # e.g. paying off the credit card
        _txn("checking", 2800.0, "Income"),
    ]
    monkeypatch.setattr(db, "transactions", FakeCollection(docs))

    result = asyncio.run(db.get_spending_summary())

    assert result["total_spent"] == 150.0
    assert result["transaction_count"] == 2
    assert {c["category"] for c in result["by_category"]} == {"Groceries", "Dining"}


def test_get_spending_summary_includes_transfer_when_explicitly_requested(monkeypatch: pytest.MonkeyPatch) -> None:
    docs = [
        _txn("checking", -500.0, "Transfer"),
        _txn("checking", -100.0, "Groceries"),
    ]
    monkeypatch.setattr(db, "transactions", FakeCollection(docs))

    result = asyncio.run(db.get_spending_summary(category="Transfer"))

    assert result["total_spent"] == 500.0
    assert result["transaction_count"] == 1
