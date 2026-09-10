# Ledgr Chatbot Backend

Simple FastAPI backend that echoes back whatever message the user sends. Matches the
frontend's expected contract exactly.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Run

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

The API will be available at `http://127.0.0.1:8000`.

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

All other tests mock both Ollama and MongoDB, so they need neither service running.

## Notes

- CORS is enabled for all origins, for local dev convenience.
- No persistence — each request is handled statelessly, nothing is stored.
- Currently just echoes the input message back; no real chatbot logic yet.
