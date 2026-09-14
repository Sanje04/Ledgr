"""
Tests for GET /api/transactions (Phase 4) -- the read-only endpoint used by
the frontend's transactions panel display only (separate from the agent's
tool-calling path, tested in test_agent_tools.py). Hermetic like test_chat.py:
TestClient(main.app) is instantiated without `with`, so startup's
db.ensure_indexes() never runs against a real MongoDB, and db functions are
monkeypatched so no real MongoDB is needed.
"""

import pytest
from fastapi.testclient import TestClient

import db
import main

client = TestClient(main.app)


def test_get_transactions_returns_accounts_and_transactions(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_list_accounts() -> list[dict[str, object]]:
        return [{"id": "checking", "name": "Checking", "type": "checking", "current_balance": 100.0}]

    async def fake_search_transactions(**kwargs: object) -> list[dict[str, object]]:
        return [
            {
                "id": "1",
                "account_id": "checking",
                "account_name": "Checking",
                "account_type": "checking",
                "date": "2026-08-01T00:00:00+00:00",
                "amount": -50.0,
                "merchant": "Test Merchant",
                "description": "test transaction",
                "category": "Groceries",
                "running_balance": 50.0,
            }
        ]

    monkeypatch.setattr(db, "list_accounts", fake_list_accounts)
    monkeypatch.setattr(db, "search_transactions", fake_search_transactions)

    response = client.get("/api/transactions")

    assert response.status_code == 200
    body = response.json()
    assert len(body["accounts"]) == 1
    assert len(body["transactions"]) == 1
    assert body["transactions"][0]["merchant"] == "Test Merchant"


def test_get_transactions_returns_503_on_db_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing_list_accounts() -> list[dict[str, object]]:
        raise Exception("mongo unreachable")

    monkeypatch.setattr(db, "list_accounts", failing_list_accounts)

    response = client.get("/api/transactions")

    assert response.status_code == 503
    assert isinstance(response.json()["error"], str)
