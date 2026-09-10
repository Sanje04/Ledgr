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

## Notes

- CORS is enabled for all origins, for local dev convenience.
- No persistence — each request is handled statelessly, nothing is stored.
- Currently just echoes the input message back; no real chatbot logic yet.
