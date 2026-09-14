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
- A second, independent domain the same agent reasons about: mock bank accounts/transactions, queried and summed the same tool-calling way — see [Mock bank transactions](#mock-bank-transactions) below

The centerpiece is that last point: not a chatbot with a database bolted on, but an agent that reasons about *when* to act on one.

## Architecture

```
┌─────────────────────┐        POST /api/chat        ┌──────────────────────┐        HTTP        ┌───────────────────────┐
│   React + TS UI      │ ─────────────────────────────▶│  FastAPI Backend      │ ──────────────────▶│  Ollama (remote host) │
│   (Vite, localStorage)│◀───────────────────────────── │  (validation, agent)  │◀────────────────────│  local LLM inference   │
│   + TransactionsPanel │        GET /api/transactions  │                       │   model output      └───────────────────────┘
└─────────────────────┘◀───────────────────────────── └──────────┬───────────┘
                            { accounts, transactions }             │
                                                         auto-save every turn (deterministic)
                                                                   ▼
                                                        ┌──────────────────────┐
                                                        │   MongoDB (local)     │◀──── tool-calling access (agent-driven)
                                                        │  conversations,        │
                                                        │  accounts, transactions│
                                                        └──────────────────────┘
```

- **Frontend and backend communicate over one fixed JSON contract**, so either side can be rebuilt independently.
- **The backend talks to Ollama over the network**, not in-process — the model can run on a separate, more powerful machine (e.g. one with a GPU) while the backend and UI run anywhere.
- **Every turn is auto-saved to MongoDB** by the backend, deterministically, regardless of what the model does — this always happens and doesn't depend on the LLM.
- **The agent has tool-calling access** to that same MongoDB store (list/search/delete history, plus mock account/transaction lookups) so the model itself decides when to act on it — see [Agent tool-calling over conversation history](#agent-tool-calling-over-conversation-history) and [Mock bank transactions](#mock-bank-transactions).
- **`GET /api/transactions`** is a separate, read-only path used only by the frontend's transactions panel for display — the agent never calls it; the agent's own access to the same data is tool-calling only.

## Tech stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | React 18, TypeScript (strict mode), Vite, plain CSS |
| Backend   | Python 3, FastAPI, Pydantic, Uvicorn |
| Agent     | Python, `httpx` async client calling Ollama's `/api/chat` |
| LLM       | Ollama, running locally/on a LAN host — no cloud API costs |
| Persistence (client) | Browser `localStorage` — what the UI reads from today |
| Persistence (server, current) | MongoDB (local instance), via Motor — conversations auto-saved on every turn and readable/searchable/deletable by the agent's tools (not yet read back by the UI); a separate seeded `accounts`/`transactions` mock dataset readable by the agent's tools and, read-only, by the UI's transactions panel |
| Agent tool-calling | Ollama `tools` field, two-call loop in `agent.py` — see [Agent tool-calling over conversation history](#agent-tool-calling-over-conversation-history) |

## Features

- Chat interface with message history, loading states, and error handling — a neutral fintech-dashboard visual design with light/dark theme support (system-aware, manually toggleable)
- Chat history persisted client-side in `localStorage` and restored on page load
- Backend agent that forwards messages to a local LLM (Ollama) and returns real model-generated replies, with a `502` returned if Ollama is unreachable
- Every `/api/chat` turn durably auto-saved to MongoDB by the backend (async, via Motor), independent of `localStorage` and independent of the model
- Agent tool-calling over that same MongoDB store — the model can list, full-text search, and (with explicit confirmation) delete conversation history in natural language, via `list_conversations`/`search_history`/`delete_conversation`
- A second, mock bank accounts/transactions domain the same agent can reason about — `list_accounts`/`search_transactions`/`get_spending_summary`, the last of which computes real totals server-side rather than letting the model guess — plus a read-only `GET /api/transactions` endpoint powering a transactions panel in the UI, alongside chat, with an account filter (Checking/Savings/Credit Card/All) and a category-spending donut chart for the trailing 30 days
- Strictly-typed API contract shared between frontend and backend
- Backend request validation with descriptive 400 errors on malformed input
- Frontend works standalone with a built-in mock bot when no backend is configured
- CORS-enabled FastAPI backend for local cross-port development

## Project structure

```
ledgr/
├── ui/                    React + TypeScript frontend (Vite)
│   ├── src/
│   │   ├── components/    ChatWindow, MessageList, MessageItem, InputField, TransactionsPanel
│   │   ├── services/      api.ts (chat), transactions.ts (transactions) — HTTP clients with mock fallbacks
│   │   ├── utils/         localStorage helpers
│   │   └── types/         shared TypeScript interfaces
│   └── README.md
└── backend/               FastAPI backend
    ├── main.py            POST /api/chat + GET /api/transactions routes, request validation
    ├── agent.py           Calls the local LLM (Ollama), tool-calling loop, returns its reply
    ├── db.py              Motor client + auto-save of each turn + mock account/transaction queries
    ├── data/               accounts.csv, transactions.csv — checked-in, human-editable mock data source
    ├── scripts/           seed_transactions.py — loads data/*.csv into MongoDB (not run by the app itself)
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

## Mock bank transactions

A second, independent domain the same agent reasons about, in the same tool-calling style as conversation history above — no real bank integration yet, but a seeded mock dataset (3 accounts: Checking, Savings, Credit Card; ~100+ transactions over 6 months) so the pattern can be built and demoed now:

- **Agent tools (LLM-driven):** `list_accounts` (balances), `search_transactions` (filtered lookups by account/category/merchant/date/amount), and `get_spending_summary`, which **computes** totals and a category breakdown server-side rather than handing the model raw rows to add up — and excludes transfers between the user's own accounts and income from spending totals by default, so paying off a credit card doesn't get counted as "spending."
- **Storage:** two new MongoDB collections, `accounts` (3 fixed documents) and `transactions` (~100+ documents), loaded by a one-off, idempotent script (`backend/scripts/seed_transactions.py`) from two checked-in, human-editable CSV fixtures (`backend/data/accounts.csv`, `backend/data/transactions.csv`) — not part of the running app. Transaction dates in the CSV are relative (`days_ago`), so the data always reads as "the last ~6 months" no matter when you seed.
- **`GET /api/transactions`:** a read-only endpoint, separate from the tool-calling path above, used only by the frontend's transactions panel to display the same data alongside chat. The agent itself never calls this endpoint — its access is tool-calling only, matching the philosophy above.
- Both domains share one `SYSTEM_PROMPT` and one tool-calling loop (still capped at one tool call per turn — see `backend/specs.md` Phase 4): the same assistant handles "what did we talk about yesterday?" and "how much did I spend on groceries?" in one chat.

See [`backend/specs.md`](backend/specs.md) (Phase 4) for the data model, tool contracts, and verification notes.

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
- [x] Mock bank accounts/transactions domain with agent tool-calling (list/search/summarize) and a read-only transactions panel in the UI
- [ ] Frontend updated to load history from the backend instead of `localStorage`
- [ ] Multi-turn conversation context passed to the model

See [`backend/specs.md`](backend/specs.md) and [`ui/specs.md`](ui/specs.md) for the original design specs each side was built from.

## Path to portfolio-ready

The features above are the technical core; these are what's missing before this reads as a finished, resume-linkable project rather than a local prototype:

- [ ] **Push to a public GitHub repo.** Nothing here is version-controlled yet — no repo, no commit history, no link to put on a resume. This is the highest-priority gap.
- [x] **Automated tests.** `backend/tests/` (pytest) covers `/api/chat`'s validation paths, the malformed-JSON path, the `502`-on-Ollama-down path, and one real-inference smoke test against a local Ollama model. `ui/src/**/*.test.{ts,tsx}` (vitest + React Testing Library) covers `InputField`, `api.ts`'s error handling, and `storage.ts`. Still missing: CI to run any of this automatically (see below), and frontend coverage beyond these three modules (e.g. `ChatWindow`/`MessageList` integration, `App.tsx`).
- [ ] **One-command local run.** Three moving parts (UI, FastAPI, MongoDB) currently need to be started separately by hand; a `docker-compose.yml` would let a reviewer clone and run it without installing Python/Node/Mongo themselves.
- [ ] **CI.** A GitHub Actions workflow running lint + the test suite on every push/PR.
- [ ] **Screenshot or short demo GIF** in this README — the single highest-leverage addition for anyone skimming the repo rather than cloning it.
- [ ] **A measured number, not a claimed one.** E.g. observed p50 latency for a `llama3.1:8b` reply on your hardware. Worth including in a resume bullet only once actually measured.
- [ ] Multi-turn conversation context and streaming responses (both currently absent from `agent.py`, which sends only the latest message with a fixed system prompt).
