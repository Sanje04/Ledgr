# Ledgr — Self-Hosted AI Chatbot

A full-stack chat application with a React/TypeScript frontend and a Python/FastAPI backend, designed to connect to a **locally-hosted LLM (via Ollama)** instead of a paid third-party API. Built as a hands-on exercise in full-stack integration, API contract design, and running open-weight models on your own hardware.

## Why this project

Most chatbot demos wire a frontend straight to a hosted API (OpenAI, Anthropic, etc.) and call it done. This project is deliberately built the other way: a clean frontend/backend split with a fixed API contract between them, so the backend's internals can change — echo logic → LLM-backed agent → agent with persistent memory and tool-calling — without touching the UI at all. It's a small, concrete demonstration of:

- Designing a stable API contract and building both sides of it independently
- Structuring a React + TypeScript app with typed state, persistence, and error handling
- Building a FastAPI backend with request validation and clear error responses
- Integrating a self-hosted LLM (Ollama) running on separate hardware from the app server
- Durable, deterministic persistence of every conversation turn to MongoDB, independent of the LLM
- Giving the agent tool-calling access to that database, so *it* decides when to query/search/delete history rather than the backend exposing a conventional REST CRUD API for it — see [Agent tool-calling over conversation history](#agent-tool-calling-over-conversation-history) below

The centerpiece is that last point: not a chatbot with a database bolted on, but an agent that reasons about *when* to act on one.

## Architecture

```
┌─────────────────────┐        POST /api/chat        ┌──────────────────────┐        HTTP        ┌───────────────────────┐
│   React + TS UI      │ ─────────────────────────────▶│  FastAPI Backend      │ ──────────────────▶│  Ollama (remote host) │
│   (Vite, localStorage)│◀───────────────────────────── │  (validation, agent)  │◀────────────────────│  local LLM inference   │
└─────────────────────┘   { response: "..." }         └──────────┬───────────┘   model output      └───────────────────────┘
                                                                   │
                                                         auto-save every turn (deterministic)
                                                                   ▼
                                                        ┌──────────────────────┐
                                                        │   MongoDB (local)     │◀──── tool-calling access (agent-driven)
                                                        │  conversation store   │
                                                        └──────────────────────┘
```

- **Frontend and backend communicate over one fixed JSON contract**, so either side can be rebuilt independently.
- **The backend talks to Ollama over the network**, not in-process — the model can run on a separate, more powerful machine (e.g. one with a GPU) while the backend and UI run anywhere.
- **Every turn is auto-saved to MongoDB** by the backend, deterministically, regardless of what the model does — this always happens and doesn't depend on the LLM.
- **The agent has tool-calling access** to that same MongoDB store (list/search/delete history) so the model itself decides when to act on it — see [Agent tool-calling over conversation history](#agent-tool-calling-over-conversation-history).

## Tech stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | React 18, TypeScript (strict mode), Vite, plain CSS |
| Backend   | Python 3, FastAPI, Pydantic, Uvicorn |
| Agent     | Python, `httpx` async client calling Ollama's `/api/chat` |
| LLM       | Ollama, running locally/on a LAN host — no cloud API costs |
| Persistence (client) | Browser `localStorage` — what the UI reads from today |
| Persistence (server, current) | MongoDB (local instance), via Motor — auto-saved on every turn; also readable/searchable/deletable by the agent's tools, but not yet read back by the UI |
| Agent tool-calling | Ollama `tools` field, two-call loop in `agent.py` — see [Agent tool-calling over conversation history](#agent-tool-calling-over-conversation-history) |

## Features

- Chat interface with message history, loading states, and error handling
- Chat history persisted client-side in `localStorage` and restored on page load
- Backend agent that forwards messages to a local LLM (Ollama) and returns real model-generated replies, with a `502` returned if Ollama is unreachable
- Every `/api/chat` turn durably auto-saved to MongoDB by the backend (async, via Motor), independent of `localStorage` and independent of the model
- Agent tool-calling over that same MongoDB store — the model can list, full-text search, and (with explicit confirmation) delete conversation history in natural language, via `list_conversations`/`search_history`/`delete_conversation`
- Strictly-typed API contract shared between frontend and backend
- Backend request validation with descriptive 400 errors on malformed input
- Frontend works standalone with a built-in mock bot when no backend is configured
- CORS-enabled FastAPI backend for local cross-port development

## Project structure

```
ledgr/
├── ui/                    React + TypeScript frontend (Vite)
│   ├── src/
│   │   ├── components/    ChatWindow, MessageList, MessageItem, InputField
│   │   ├── services/      api.ts — backend HTTP client (with mock-bot fallback)
│   │   ├── utils/         localStorage helpers
│   │   └── types/         shared TypeScript interfaces
│   └── README.md
└── backend/               FastAPI backend
    ├── main.py            POST /api/chat route + request validation
    ├── agent.py           Calls the local LLM (Ollama) and returns its reply
    ├── db.py              Motor client + auto-save of each turn to MongoDB
    ├── requirements.txt
    └── README.md
```

## Getting started

### Prerequisites
- Node.js 20+
- Python 3.11+
- [Ollama](https://ollama.com) installed somewhere on your network (can be the same machine)

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

The API is now available at `http://127.0.0.1:8000`.

### 2. Frontend

```powershell
cd ui
npm install
copy .env.example .env
npm run dev
```

By default `.env` points `VITE_API_URL` at the local backend above. Open the printed local URL in your browser.

> Without a backend running, the UI still works end-to-end using a built-in mock bot — see [`ui/README.md`](ui/README.md).

## API contract

```
POST /api/chat
Content-Type: application/json

{ "message": "user's text" }
```

```json
{ "response": "bot's reply text" }
```

```json
{ "error": "Invalid request: 'message' must be a non-empty string." }
```

## Agent tool-calling over conversation history

MongoDB persistence is live and, as of this pass, the **agent itself** has tool-calling access to that same store, instead of a conventional REST CRUD API bolted onto it:

- **Auto-save (deterministic):** every user/assistant message pair is written to MongoDB by the backend as part of handling `/api/chat`, unconditionally — independent of whatever the model does.
- **Agent tools (LLM-driven, implemented):** the model is given three callable tools — `list_conversations`, `search_history`, `delete_conversation` — so it can act on history when the user asks for it in natural language ("what did we talk about yesterday?", "delete this conversation"). The LLM decides which tool to call and with what arguments; the agent executes the actual MongoDB operation and feeds the result back to the model in a second call so *it* composes the final natural-language reply (a two-call loop, capped at one tool round-trip per turn). `delete_conversation` additionally requires the backend to detect an explicit confirmation phrase in the user's message before it will actually execute, independent of the model's own judgment.
- **Storage:** a local MongoDB Community Server instance, with a `conversations` collection (currently one continuously-growing document, messages embedded as an array) accessed via Motor, plus a text index on `messages.content` for `search_history`.

This is a deliberate choice over a plain REST CRUD API: it demonstrates the agentic tool-use pattern (model reasoning about *when* to query/mutate a database) rather than just wiring a database behind a fixed set of endpoints. See [`backend/specs.md`](backend/specs.md) (Phase 3) for the detailed design, verification notes, and known behavior quirks (e.g. the model is occasionally tool-happy on messages that don't need a tool).

## What this project demonstrates

- End-to-end ownership of a stable API contract across an independently-typed frontend and backend
- Integrating a self-hosted LLM (Ollama) as a network dependency, not an in-process library call — including handling its failure modes (`502` on unreachable/erroring model)
- Separating deterministic persistence (every turn auto-saved) from model-driven behavior (planned tool-calling), instead of conflating "the backend stores things" with "the model decides to store things"
- Async Python I/O throughout the backend (`httpx` to Ollama, Motor to MongoDB) so one slow dependency doesn't block the event loop
- Designing for the agentic tool-use pattern specifically — a model that chooses *when* to invoke a capability — as distinct from a standard CRUD API

## Status & roadmap

- [x] Frontend chat UI with localStorage persistence
- [x] FastAPI backend with validated `/api/chat` contract
- [x] Backend agent layer that calls a local LLM served by Ollama on a separate machine
- [x] MongoDB-backed conversation storage (auto-save every turn)
- [x] Agent tool-calling for history operations (list/search/delete conversations)
- [ ] Frontend updated to load history from the backend instead of `localStorage`
- [ ] Multi-turn conversation context passed to the model

See [`backend/specs.md`](backend/specs.md) and [`ui/specs.md`](ui/specs.md) for the original design specs each side was built from.

## Path to portfolio-ready

The features above are the technical core; these are what's missing before this reads as a finished, resume-linkable project rather than a local prototype:

- [ ] **Push to a public GitHub repo.** Nothing here is version-controlled yet — no repo, no commit history, no link to put on a resume. This is the highest-priority gap.
- [ ] **Automated tests.** Zero tests currently exist. Cheapest high-value target: pytest coverage of `/api/chat`'s validation paths (missing/empty/non-string `message`, malformed JSON) and the `502` path when Ollama is down — all deterministic, no LLM call required.
- [ ] **One-command local run.** Three moving parts (UI, FastAPI, MongoDB) currently need to be started separately by hand; a `docker-compose.yml` would let a reviewer clone and run it without installing Python/Node/Mongo themselves.
- [ ] **CI.** A GitHub Actions workflow running lint + the test suite on every push/PR.
- [ ] **Screenshot or short demo GIF** in this README — the single highest-leverage addition for anyone skimming the repo rather than cloning it.
- [ ] **A measured number, not a claimed one.** E.g. observed p50 latency for a `llama3.1:8b` reply on your hardware. Worth including in a resume bullet only once actually measured.
- [ ] Multi-turn conversation context and streaming responses (both currently absent from `agent.py`, which sends only the latest message with a fixed system prompt).
