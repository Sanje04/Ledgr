"""
Tests for the deployment-support additions to main.py: GET /api/health and the
ALLOWED_ORIGINS-driven CORS configuration (see AZURE_DEPLOYMENT.md).

Same TestClient posture as test_chat.py: instantiated without `with`, so the
startup lifespan (db.ensure_indexes + mcp_client.discover_tools) never runs and
this suite needs no MongoDB, Ollama, or MCP server.

CORS is asserted against _load_allowed_origins() rather than a response header
because app.add_middleware() runs once at import time -- re-reading the env would
mean reimporting main, which is a heavier and less direct test of the same logic.
"""

import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def test_health_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_ignores_broken_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    """The whole point of the endpoint: a dead Mongo/Ollama/MCP must not fail the
    probe, or the platform restarts containers that are serving fine."""
    import agent
    import db

    async def failing(*args: object, **kwargs: object) -> None:
        raise Exception("dependency unreachable")

    monkeypatch.setattr(db, "get_recent_history", failing)
    monkeypatch.setattr(db, "save_turn", failing)
    monkeypatch.setattr(agent, "OLLAMA_BASE_URL", "http://127.0.0.1:1")

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_allowed_origins_defaults_to_wildcard(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)

    assert main._load_allowed_origins() == ["*"]


def test_allowed_origins_parses_comma_separated_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "ALLOWED_ORIGINS", "https://tender.example.com, https://staging.example.com"
    )

    assert main._load_allowed_origins() == [
        "https://tender.example.com",
        "https://staging.example.com",
    ]


def test_allowed_origins_falls_back_when_effectively_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    """An empty or all-whitespace value is a misconfiguration, not an instruction to
    block every origin -- blocking silently breaks the frontend with no server error."""
    monkeypatch.setenv("ALLOWED_ORIGINS", " , ")

    assert main._load_allowed_origins() == ["*"]
