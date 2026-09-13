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

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def no_real_mongo(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_save_turn(*args: object, **kwargs: object) -> None:
        return None

    monkeypatch.setattr(db, "save_turn", fake_save_turn)


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
