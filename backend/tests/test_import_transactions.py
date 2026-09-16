"""
Tests for db.py's CSV import (Phase 5) -- see test_db_transactions.py for the
FakeCursor/hermetic-async-via-asyncio.run() conventions this follows.

Fixtures below are synthetic (fake card digits/names), not copy-pasted from a
real statement export.

Kept deliberately lean: one test proves the balance math and sign-from-type
handling (the part most likely to be silently wrong on a new write path), one
proves fail-fast validation rejects a bad row before anything is written.
"""

import asyncio
from typing import Any

import pytest

import db


class FakeCursor:
    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self._docs = docs

    def __aiter__(self):
        return self._generator()

    async def _generator(self):
        for doc in self._docs:
            yield doc


class FakeWritableCollection:
    """Minimal stateful fake supporting the write ops import_transactions()
    uses (delete_many, insert_one, insert_many) plus find() for the
    list_accounts() call at the end of a successful import."""

    def __init__(self) -> None:
        self._docs: dict[Any, dict[str, Any]] = {}

    async def delete_many(self, _query: dict[str, Any]) -> None:
        self._docs.clear()

    async def insert_one(self, doc: dict[str, Any]) -> None:
        self._docs[doc["_id"]] = doc

    async def insert_many(self, docs: list[dict[str, Any]]) -> None:
        for doc in docs:
            self._docs[id(doc)] = doc

    def find(self, query: dict[str, Any] | None = None, sort: list[tuple[str, int]] | None = None, limit: int = 0):
        docs = list(self._docs.values())
        if sort:
            for field, direction in reversed(sort):
                docs.sort(key=lambda d: d[field], reverse=(direction == -1))
        return FakeCursor(docs)


STATEMENT_CSV = (
    "Following data is valid as of 20260101120000 (Year/Month/Day/Hour/Minute/Second)\n"
    "\n"
    "First Bank Card,Transaction Type,Date Posted, Transaction Amount,Description\n"
    "'1111222233334444',DEBIT,20260105,50.00,[PR]COFFEE SHOP          CITY      ON\n"
    "'1111222233334444',CREDIT,20260106,1000.00,[CW]INTERAC ETRNSFR AD RECVD JANE DOE\n"
    "'1111222233334444',DEBIT,20260107,200.00,[CW]INTERAC ETRNSFR SENT     JOHN SMITH\n"
)


def test_import_transactions_computes_balances_and_derives_sign_from_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(db, "accounts", FakeWritableCollection())
    monkeypatch.setattr(db, "transactions", FakeWritableCollection())

    result = asyncio.run(
        db.import_transactions(STATEMENT_CSV, account_name="My Card", account_type="checking", opening_balance=500.0)
    )

    assert result["imported_count"] == 3
    # 500 opening - 50 (debit, sign taken from type not the all-positive
    # amount column) + 1000 (credit) - 200 (debit) = 1250.
    assert result["accounts"] == [{"id": "my_card", "name": "My Card", "type": "checking", "current_balance": 1250.0}]


def test_parse_import_csv_rejects_unknown_transaction_type() -> None:
    csv_text = (
        "First Bank Card,Transaction Type,Date Posted, Transaction Amount,Description\n"
        "'1111222233334444',HOLD,20260105,50.00,[PR]COFFEE SHOP\n"
    )

    with pytest.raises(ValueError, match="Row 2.*transaction type"):
        db._parse_import_csv(csv_text)


def test_import_transactions_requires_account_name() -> None:
    with pytest.raises(ValueError, match="Account name"):
        asyncio.run(db.import_transactions(STATEMENT_CSV, account_name="  ", account_type="checking"))
