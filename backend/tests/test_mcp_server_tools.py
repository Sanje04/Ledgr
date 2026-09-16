"""
Tests for the MCP server's tool dispatch (mcp_server.dispatch_tool).

This file *is* the old tests/test_agent_tools.py, retargeted rather than
rewritten: Phase 8 moved tool execution out of agent._execute_tool into
mcp_server.py, so the same Phase 4 assertions (argument pass-through, the
limit default, the DB-error-becomes-an-error-result contract) now belong
against the new seam. Nothing was added speculatively -- see CLAUDE.md's
"extend tests for what you touch".

The two schema-validation cases at the end are new, and are here because
validation is new behavior this phase introduces: the tools' JSON Schemas are
now the wire contract, so an out-of-enum category is rejected before db.py is
touched instead of being passed through as a filter that matches nothing.

Run via asyncio.run() inside plain `def` tests, matching the rest of the suite
(no pytest-asyncio dependency).
"""

import asyncio

import pytest

import db
import mcp_server


def test_dispatch_list_accounts(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_list_accounts() -> list[dict[str, object]]:
        return [{"id": "checking", "name": "Checking", "type": "checking", "current_balance": 100.0}]

    monkeypatch.setattr(db, "list_accounts", fake_list_accounts)

    result = asyncio.run(mcp_server.dispatch_tool("list_accounts", {}))

    assert result == {
        "accounts": [{"id": "checking", "name": "Checking", "type": "checking", "current_balance": 100.0}]
    }


def test_dispatch_search_transactions_passes_arguments_through(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def fake_search_transactions(**kwargs: object) -> list[dict[str, object]]:
        captured.update(kwargs)
        return []

    monkeypatch.setattr(db, "search_transactions", fake_search_transactions)

    result = asyncio.run(
        mcp_server.dispatch_tool("search_transactions", {"merchant": "Amazon", "limit": 5})
    )

    assert result == {"transactions": []}
    assert captured["merchant"] == "Amazon"
    assert captured["limit"] == 5
    assert captured["account"] is None


def test_dispatch_search_transactions_defaults_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def fake_search_transactions(**kwargs: object) -> list[dict[str, object]]:
        captured.update(kwargs)
        return []

    monkeypatch.setattr(db, "search_transactions", fake_search_transactions)

    asyncio.run(mcp_server.dispatch_tool("search_transactions", {}))

    assert captured["limit"] == mcp_server.DEFAULT_TRANSACTION_LIMIT == 20


def test_dispatch_get_spending_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_get_spending_summary(**kwargs: object) -> dict[str, object]:
        return {"total_spent": 42.0, "transaction_count": 1, "by_category": []}

    monkeypatch.setattr(db, "get_spending_summary", fake_get_spending_summary)

    result = asyncio.run(mcp_server.dispatch_tool("get_spending_summary", {"category": "Dining"}))

    assert result == {"total_spent": 42.0, "transaction_count": 1, "by_category": []}


def test_dispatch_db_error_is_caught_and_returned(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing_list_accounts() -> list[dict[str, object]]:
        raise Exception("mongo unreachable")

    monkeypatch.setattr(db, "list_accounts", failing_list_accounts)

    result = asyncio.run(mcp_server.dispatch_tool("list_accounts", {}))

    assert "error" in result
    assert "list_accounts" in result["error"]


def test_dispatch_rejects_unknown_tool_without_touching_db() -> None:
    result = asyncio.run(mcp_server.dispatch_tool("drop_everything", {}))

    assert "error" in result
    assert "drop_everything" in result["error"]


def test_dispatch_rejects_out_of_enum_category_before_calling_db(monkeypatch: pytest.MonkeyPatch) -> None:
    """`category` declares db.CATEGORIES as its enum, so a value outside it is a
    schema violation -- rejected here rather than reaching Mongo as a filter that
    would silently match nothing."""
    called = False

    async def fake_search_transactions(**kwargs: object) -> list[dict[str, object]]:
        nonlocal called
        called = True
        return []

    monkeypatch.setattr(db, "search_transactions", fake_search_transactions)

    result = asyncio.run(mcp_server.dispatch_tool("search_transactions", {"category": "Crypto"}))

    assert "error" in result
    assert called is False


def test_declared_category_enums_track_db_categories() -> None:
    """Requirement: adding a value to db.CATEGORIES must change both declared
    enums with no other code change."""
    enums = [
        t["inputSchema"]["properties"]["category"]["enum"]
        for t in mcp_server.TOOL_DEFINITIONS
        if "category" in t["inputSchema"]["properties"]
    ]

    assert len(enums) == 2
    assert all(e == db.CATEGORIES for e in enums)
