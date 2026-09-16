"""
Tests for agent.run()'s message-list construction, specifically the new
`history` parameter (multi-turn context, specs.md Phase 7).

Mocks agent._call_ollama directly rather than httpx -- _call_ollama's own
payload-building is untouched by this feature, so the seam belongs at its
input. Matches test_agent_tools.py's style of monkeypatching one level in
rather than mocking the network client.

Async agent.py functions are run via asyncio.run() inside plain `def` tests,
matching this project's minimal test dependencies (see requirements-dev.txt).
"""

import asyncio
from typing import Any

import pytest

import agent
import mcp_client


@pytest.fixture(autouse=True)
def no_real_mcp(monkeypatch: pytest.MonkeyPatch) -> None:
    """Phase 8: run() now asks mcp_client for tools before calling Ollama. These
    tests are about message-list construction, so short-circuit discovery to "no
    tools" rather than letting each one spend a real connection attempt on an MCP
    server that isn't running."""

    async def no_tools() -> list[dict[str, Any]]:
        return []

    monkeypatch.setattr(mcp_client, "ensure_tools", no_tools)


def test_run_inserts_history_between_system_and_current_message(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_call_ollama(
        messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
    ) -> dict[str, Any]:
        captured["messages"] = messages
        return {"message": {"content": "final reply"}}

    monkeypatch.setattr(agent, "_call_ollama", fake_call_ollama)

    history = [
        {"role": "user", "content": "earlier question"},
        {"role": "assistant", "content": "earlier answer"},
    ]

    result = asyncio.run(agent.run("current question", history=history))

    assert result == "final reply"
    messages = captured["messages"]
    assert len(messages) == 4
    assert messages[0]["role"] == "system"
    assert messages[1:3] == history
    assert messages[3] == {"role": "user", "content": "current question"}


def test_run_without_history_matches_pre_existing_two_message_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_call_ollama(
        messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
    ) -> dict[str, Any]:
        captured["messages"] = messages
        return {"message": {"content": "final reply"}}

    monkeypatch.setattr(agent, "_call_ollama", fake_call_ollama)

    asyncio.run(agent.run("current question"))

    assert [m["role"] for m in captured["messages"]] == ["system", "user"]
