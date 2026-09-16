"""
Tests for the backend's MCP client path (specs.md Phase 8) -- the three
behaviors that define whether the two-process split actually works:

  1. A discovered tool is invoked over MCP with the name/arguments the model
     chose, and its result reaches the model's final reply.
  2. An unreachable MCP server is a *tool-level* failure: HTTP 200 with the
     failure fed back as a tool result, deliberately distinct from the
     Ollama-unreachable 502 path (tests/test_chat.py).
  3. An unconfirmed `delete_conversation` sends zero invocations.

Hermetic: no Ollama, no MongoDB, no MCP server process. `agent._call_ollama` is
stubbed (as in test_agent_run.py), and the MCP client is stubbed at its own
client-function seam -- `mcp_client.call_tool` where the test is about routing,
and `mcp_client._call_tool_over_mcp` where the test is about failure handling,
so `call_tool`'s real error wrapping is the thing under test rather than mocked
away. Async code runs via asyncio.run() inside plain `def` tests.
"""

import asyncio
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

import agent
import db
import main
import mcp_client


def _ollama_schema(name: str) -> dict[str, Any]:
    """A minimal discovered-tool entry, in the Ollama shape mcp_client caches."""
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": f"{name} description",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    }


class _OllamaStub:
    """Two-call stub: first call requests `tool_name`, second returns `final_reply`."""

    def __init__(self, tool_name: str, arguments: dict[str, Any], final_reply: str) -> None:
        self.tool_name = tool_name
        self.arguments = arguments
        self.final_reply = final_reply
        self.calls: list[dict[str, Any]] = []

    async def __call__(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
    ) -> dict[str, Any]:
        self.calls.append({"messages": list(messages), "tools": tools})
        if len(self.calls) == 1:
            return {
                "message": {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [{"function": {"name": self.tool_name, "arguments": self.arguments}}],
                }
            }
        return {"message": {"role": "assistant", "content": self.final_reply}}

    @property
    def tool_message(self) -> dict[str, Any]:
        """The `role: "tool"` message handed to the second Ollama call."""
        second = self.calls[1]["messages"]
        return next(m for m in reversed(second) if m.get("role") == "tool")


@pytest.fixture(autouse=True)
def no_real_mongo(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_save_turn(*args: object, **kwargs: object) -> None:
        return None

    async def fake_get_recent_history(*args: object, **kwargs: object) -> list[dict[str, str]]:
        return []

    monkeypatch.setattr(db, "save_turn", fake_save_turn)
    monkeypatch.setattr(db, "get_recent_history", fake_get_recent_history)


def test_discovered_tool_is_invoked_over_mcp_and_shapes_the_reply(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(mcp_client, "_cached_tools", [_ollama_schema("get_spending_summary")])

    captured: dict[str, Any] = {}

    async def fake_call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        captured["name"] = name
        captured["arguments"] = arguments
        return {"total_spent": 42.0, "transaction_count": 3, "by_category": []}

    monkeypatch.setattr(mcp_client, "call_tool", fake_call_tool)

    ollama = _OllamaStub(
        "get_spending_summary", {"category": "Dining"}, "You spent $42.00 on dining across 3 purchases."
    )
    monkeypatch.setattr(agent, "_call_ollama", ollama)

    reply = asyncio.run(agent.run("how much did I spend on dining?"))

    # Invoked through MCP with exactly what the model asked for.
    assert captured["name"] == "get_spending_summary"
    assert captured["arguments"] == {"category": "Dining"}

    # The discovered schema (not a hardcoded one) is what was offered to the model,
    # and the second call drops tools entirely -- the one-round cap.
    assert ollama.calls[0]["tools"] == [_ollama_schema("get_spending_summary")]
    assert ollama.calls[1]["tools"] is None

    # The reply is non-empty and was built from the invocation result.
    assert reply == "You spent $42.00 on dining across 3 purchases."
    assert "42.0" in ollama.tool_message["content"]


def test_unreachable_mcp_server_returns_200_with_tool_error_not_502(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(mcp_client, "_cached_tools", [_ollama_schema("list_accounts")])

    async def unreachable(name: str, arguments: dict[str, Any]) -> Any:
        raise httpx.ConnectError("connection refused")

    # Stubbed one level below call_tool, so call_tool's real failure-to-error-result
    # translation is what's under test.
    monkeypatch.setattr(mcp_client, "_call_tool_over_mcp", unreachable)

    ollama = _OllamaStub("list_accounts", {}, "Sorry, I couldn't look up your balance right now.")
    monkeypatch.setattr(agent, "_call_ollama", ollama)

    client = TestClient(main.app)
    response = client.post("/api/chat", json={"message": "what's my balance?"})

    # Not the Ollama-unreachable path: that one is a 502 with an `error` key
    # (tests/test_chat.py::test_ollama_unavailable_returns_502). This one is a
    # normal 200 answer.
    assert response.status_code == 200
    body = response.json()
    assert "error" not in body
    assert body["response"] == "Sorry, I couldn't look up your balance right now."

    # The failure was fed back as a tool result rather than raised.
    assert "error" in ollama.tool_message["content"]
    assert "list_accounts" in ollama.tool_message["content"]


def test_unconfirmed_delete_sends_zero_mcp_invocations(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mcp_client, "_cached_tools", [_ollama_schema("delete_conversation")])

    invocations: list[str] = []

    async def fake_call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        invocations.append(name)
        return {"deleted": True}

    monkeypatch.setattr(mcp_client, "call_tool", fake_call_tool)

    ollama = _OllamaStub(
        "delete_conversation", {}, "Just to confirm — do you want me to delete your history?"
    )
    monkeypatch.setattr(agent, "_call_ollama", ollama)

    reply = asyncio.run(agent.run("can you clear my chat history?"))

    assert invocations == []
    assert reply == "Just to confirm — do you want me to delete your history?"
    assert agent.NOT_CONFIRMED_RESULT["reason"] in ollama.tool_message["content"]
