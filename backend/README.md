# Tender Chatbot Backend

Simple FastAPI backend that echoes back whatever message the user sends. Matches the
frontend's expected contract exactly.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Run

Two processes. The API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

And, in a second terminal, the MCP tool server that hosts the agent's six tools
(see `specs.md` Phase 8):

```powershell
.\.venv\Scripts\python.exe mcp_server.py
```

The API will be available at `http://127.0.0.1:8000`, the tool server at
`http://127.0.0.1:9000/mcp` (`MCP_HOST`/`MCP_PORT`; the API finds it via
`MCP_SERVER_URL` — all three in `.env.example`).

Startup order doesn't matter. If the tool server isn't up, the API still serves;
it retries discovery on each `/api/chat` request and picks up the tools as soon
as the server appears. Until then the model is called with no tools and answers
directly, so chat works but can't look anything up.

To connect the frontend, set `VITE_API_URL=http://127.0.0.1:8000/api/chat` in
`ui/.env` (or `ui/.env.local`).

## API

### `POST /api/chat`

Request:

```json
{ "message": "Hello" }
```

Response (200):

```json
{ "response": "Hello" }
```

Error response (400) — returned when `message` is missing, not a string, or empty:

```json
{ "error": "Invalid request: 'message' must be a non-empty string." }
```

## Testing

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest
```

One test (`test_valid_message_returns_real_reply`, marked `live_llm`) calls this
machine's local Ollama directly (`127.0.0.1:11434`, model `gemma4:latest`) instead of
mocking it — make sure Ollama is running locally with that model pulled, or skip it:

```powershell
.\.venv\Scripts\python.exe -m pytest -m "not live_llm"
```

All other tests mock Ollama, MongoDB, and the MCP tool server, so they need none
of the three running.

## Notes

- CORS is enabled for all origins, for local dev convenience.
- Every `/api/chat` turn is persisted to MongoDB deterministically (see `db.save_turn`),
  and a bounded window of recent turns is replayed as context (`db.get_recent_history`).
- The agent's tools are not implemented here — they live in `mcp_server.py` and are
  reached over MCP. `agent.py` holds no tool schemas and makes no database calls.

> The first paragraph of this file (and this section, before the two bullets
> above) still describes the Phase 1 echo backend. It's stale; `specs.md` is the
> accurate account of what this backend does now.
