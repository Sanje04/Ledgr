"""
Tests for agent.py's tool dispatch for the Phase 4 transaction tools
(list_accounts, search_transactions, get_spending_summary) added to
_execute_tool(). The pre-existing conversation-history tool branches
(list_conversations/search_history/delete_conversation) aren't touched by
this change and aren't retested here -- see CLAUDE.md's "extend tests for
what you touch, don't add unrelated ones speculatively".

Run via asyncio.run() inside plain `def` tests, matching
test_db_transactions.py (no pytest-asyncio dependency).
"""

import asyncio

import pytest

import agent
import db


def test_execute_list_accounts(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_list_accounts() -> list[dict[str, object]]:
        return [{"id": "checking", "name": "Checking", "type": "checking", "current_balance": 100.0}]

    monkeypatch.setattr(db, "list_accounts", fake_list_accounts)

    result = asyncio.run(agent._execute_tool("list_accounts", {}, "what's my balance?"))

    assert result == {
        "accounts": [{"id": "checking", "name": "Checking", "type": "checking", "current_balance": 100.0}]
    }


def test_execute_search_transactions_passes_arguments_through(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def fake_search_transactions(**kwargs: object) -> list[dict[str, object]]:
        captured.update(kwargs)
        return []

    monkeypatch.setattr(db, "search_transactions", fake_search_transactions)

    result = asyncio.run(
        agent._execute_tool(
            "search_transactions",
            {"merchant": "Amazon", "limit": 5},
            "show me my amazon purchases",
        )
    )

    assert result == {"transactions": []}
    assert captured["merchant"] == "Amazon"
    assert captured["limit"] == 5
    assert captured["account"] is None


def test_execute_search_transactions_defaults_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def fake_search_transactions(**kwargs: object) -> list[dict[str, object]]:
        captured.update(kwargs)
        return []

    monkeypatch.setattr(db, "search_transactions", fake_search_transactions)

    asyncio.run(agent._execute_tool("search_transactions", {}, "show me transactions"))

    assert captured["limit"] == 20


def test_execute_get_spending_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_get_spending_summary(**kwargs: object) -> dict[str, object]:
        return {"total_spent": 42.0, "transaction_count": 1, "by_category": []}

    monkeypatch.setattr(db, "get_spending_summary", fake_get_spending_summary)

    result = asyncio.run(
        agent._execute_tool("get_spending_summary", {"category": "Dining"}, "how much on dining?")
    )

    assert result == {"total_spent": 42.0, "transaction_count": 1, "by_category": []}


def test_execute_tool_db_error_is_caught_and_returned(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing_list_accounts() -> list[dict[str, object]]:
        raise Exception("mongo unreachable")

    monkeypatch.setattr(db, "list_accounts", failing_list_accounts)

    result = asyncio.run(agent._execute_tool("list_accounts", {}, "what's my balance?"))

    assert "error" in result
