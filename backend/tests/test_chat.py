"""
Tests for POST /api/chat (see plan.md at the repo root for the source test cases).

TestClient(main.app) is instantiated without `with`, so FastAPI's startup lifespan
(which would call db.ensure_indexes() against a real MongoDB) never runs. Every test
also monkeypatches db.save_turn to a no-op, so this suite needs no MongoDB instance.

The one live_llm-marked test calls this machine's own local Ollama (127.0.0.1:11434,
gemma4:latest) rather than the LAN host configured in backend/.env, and rather than a
mock — see plan.md / CLAUDE.md for why. Run with `pytest -m "not live_llm"` to skip it
if Ollama isn't running locally.
"""

import pytest
from fastapi.testclient import TestClient

import agent
import db
import main
import mcp_client

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def no_real_mongo(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_save_turn(*args: object, **kwargs: object) -> None:
        return None

    async def fake_get_recent_history(*args: object, **kwargs: object) -> list[dict[str, str]]:
        return []

    monkeypatch.setattr(db, "save_turn", fake_save_turn)
    monkeypatch.setattr(db, "get_recent_history", fake_get_recent_history)


@pytest.fixture(autouse=True)
def no_real_mcp(monkeypatch: pytest.MonkeyPatch) -> None:
    """Phase 8: agent.run() and main.py's startup both ask mcp_client for tools.
    Stub discovery to "no tools available" so this suite stays hermetic and
    doesn't spend a connection attempt per request on an MCP server that isn't
    running -- the tools themselves are covered in test_mcp_tool_calling.py."""

    async def no_tools() -> list[dict[str, object]]:
        return []

    monkeypatch.setattr(mcp_client, "_cached_tools", [])
    monkeypatch.setattr(mcp_client, "discover_tools", no_tools)
    monkeypatch.setattr(mcp_client, "ensure_tools", no_tools)


@pytest.mark.live_llm
def test_valid_message_returns_real_reply(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agent, "OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    monkeypatch.setattr(agent, "OLLAMA_MODEL", "gemma4:latest")

    response = client.post("/api/chat", json={"message": "Say hello in one short sentence."})

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["response"], str)
    assert body["response"].strip() != ""


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"message": ""},
        {"message": 12345},
        {"message": "x" * 4001},
    ],
    ids=["missing", "empty", "non-string", "too-long"],
)
def test_invalid_message_returns_400(payload: dict[str, object]) -> None:
    response = client.post("/api/chat", json=payload)

    assert response.status_code == 400
    assert isinstance(response.json()["error"], str)


def test_malformed_json_body_returns_400() -> None:
    response = client.post(
        "/api/chat",
        content=b"{not valid json",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 400
    assert isinstance(response.json()["error"], str)


def test_ollama_unavailable_returns_502(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agent, "OLLAMA_BASE_URL", "http://127.0.0.1:1")

    response = client.post("/api/chat", json={"message": "hello"})

    assert response.status_code == 502
    assert isinstance(response.json()["error"], str)


def test_startup_survives_mongo_outage(monkeypatch: pytest.MonkeyPatch) -> None:
    """A MongoDB outage at boot (ensure_indexes failing) must not crash the app --
    save_turn already tolerates Mongo being down, and startup should too."""

    async def failing_ensure_indexes() -> None:
        raise Exception("mongo unreachable")

    monkeypatch.setattr(db, "ensure_indexes", failing_ensure_indexes)
    monkeypatch.setattr(agent, "OLLAMA_BASE_URL", "http://127.0.0.1:1")

    with TestClient(main.app) as scoped_client:
        response = scoped_client.post("/api/chat", json={"message": "hello"})

    # A fast 502 from the deliberately-unreachable Ollama URL proves the app
    # came up and is serving requests despite ensure_indexes() having failed.
    assert response.status_code == 502


def test_history_is_fetched_and_passed_to_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    sentinel_history = [{"role": "user", "content": "earlier"}, {"role": "assistant", "content": "earlier reply"}]
    captured: dict[str, object] = {}

    async def fake_get_recent_history(*args: object, **kwargs: object) -> list[dict[str, str]]:
        return sentinel_history

    async def fake_run(message: str, history: list[dict[str, str]] | None = None) -> str:
        captured["history"] = history
        return "reply"

    monkeypatch.setattr(db, "get_recent_history", fake_get_recent_history)
    monkeypatch.setattr(agent, "run", fake_run)

    response = client.post("/api/chat", json={"message": "hello"})

    assert response.status_code == 200
    assert captured["history"] == sentinel_history


def test_history_fetch_failure_degrades_to_empty_history(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def failing_get_recent_history(*args: object, **kwargs: object) -> list[dict[str, str]]:
        raise Exception("mongo unreachable")

    async def fake_run(message: str, history: list[dict[str, str]] | None = None) -> str:
        captured["history"] = history
        return "reply"

    monkeypatch.setattr(db, "get_recent_history", failing_get_recent_history)
    monkeypatch.setattr(agent, "run", fake_run)

    response = client.post("/api/chat", json={"message": "hello"})

    assert response.status_code == 200
    assert captured["history"] == []
