## Role

You are an expert backend developer building a simple chatbot interface which reads user prompts and connects to a backend API.

## Frameworks & Stack

- **Language**: Python 3
- **Framework**: FastAPI (lightweight, built-in request validation via Pydantic, easy CORS setup)
- **Server**: uvicorn
- **Validation**: Pydantic

---

## Project Overview

Build a **backend-only** API that:
- Exposes a single chat endpoint matching the frontend's existing contract
- Echoes back whatever message the user sends (no real chatbot logic yet)
- Runs locally for development only
- Has no persistence (nothing is stored anywhere)
- Has no authentication (MVP)

---

## Project Structure

```
backend/
├── main.py            (FastAPI app + /api/chat route)
├── requirements.txt   (pinned dependencies)
├── README.md          (setup/run instructions)
└── specs.md           (this document)
```

---

## API Contract

### `POST /api/chat`

Matches the frontend's `src/services/api.ts` contract exactly.

**Request:**

```json
{ "message": "user's text" }
```

**Response (200):**

```json
{ "response": "user's text" }
```

Behavior: the backend currently just echoes the `message` field back as `response`.

**Error response (400):**

Returned when `message` is missing, not a string, empty, or when the request body isn't valid JSON.

```json
{ "error": "Invalid request: 'message' must be a non-empty string." }
```

---

## Detailed Requirements

### 1. **Endpoint behavior**
- Single route: `POST /api/chat`
- Echoes the incoming `message` back unchanged as `response`
- No chatbot/LLM logic yet — this is a placeholder for wiring up the frontend end-to-end

### 2. **Validation & Error Handling**
- `message` must be present and a non-empty string
- Malformed JSON bodies are rejected
- All validation failures return HTTP 400 with `{ "error": "<message>" }`
- No retry logic on the backend — retries are handled client-side

### 3. **CORS**
- Enabled for all origins (`allow_origins=["*"]`), all methods, all headers
- Needed because the Vite frontend dev server runs on a different port than the backend

### 4. **Persistence**
- None. Every request is handled statelessly.
- No database, file, or in-memory store of messages (may be added later)

### 5. **Runtime**
- Local development only, no specific port required
- Run with `uvicorn main:app --reload --port 8000` (or any free port)
- No deployment/Docker/cloud setup at this stage

---

## Development Steps

1. ✅ Set up Python virtual environment and install FastAPI, uvicorn, pydantic
2. ✅ Build `POST /api/chat` route with request/response models matching frontend contract
3. ✅ Add validation for missing/empty/non-string `message`, returning 400 + error body
4. ✅ Enable CORS for local dev
5. ✅ Verify manually: valid message echoes correctly, empty message and missing field return 400
6. ⏳ Connect frontend by setting `VITE_API_URL=http://127.0.0.1:8000/api/chat` in `ui/.env`
7. ⏳ Replace echo logic with real chatbot/backend logic (future)
8. ⏳ Add persistence if/when needed (future)

---

## Important Notes

- **No authentication** for this MVP
- **No persistence** — nothing is stored yet
- **Echo-only logic** — this backend does not yet do any real processing of the message
- **Contract is fixed** to match the existing frontend (`{ "message": string }` → `{ "response": string }`), so the frontend requires no changes to connect
- **Local dev only** — no production/deployment concerns addressed yet

---

## TODO
- ✅ Clarify requirements (DONE)
- ✅ Scaffold FastAPI backend with `/api/chat` endpoint
- ✅ Verify echo behavior and error handling locally
- ✅ Connect frontend to backend via `VITE_API_URL`
- ✅ Replace echo with real logic (see Phase 2 below)

---

## Phase 2: LLM Agent Integration (implemented)

### Overview
Replaced the echo logic with a real agent that forwards the user's message to a local LLM served by [Ollama](https://ollama.com), which may run on a different machine on the network.

### Stack additions
- `httpx` — async HTTP client used to call Ollama's API
- `python-dotenv` — loads `backend/.env` at startup

### Config (`backend/.env`, gitignored — see `.env.example`)
- `OLLAMA_BASE_URL` — e.g. `http://10.0.0.68:11434`
- `OLLAMA_MODEL` — e.g. `llama3.1:8b`

### Design
- `agent.py` exposes a single async function, `run(message: str) -> str`, which POSTs to `{OLLAMA_BASE_URL}/api/chat` (non-streaming) and returns the model's reply text.
- `main.py` calls `agent.run()` inside the `/api/chat` route; if the agent raises `AgentError` (Ollama unreachable or returns an error status), the route responds `502` with `{ "error": "<reason>" }` instead of crashing.
- The `/api/chat` request/response contract is unchanged — the frontend needed no changes.
- Conversation is currently single-turn: only the latest user message is sent, with a fixed system prompt. No history is passed to the model yet (see Phase 3).

---

## Phase 3: MongoDB Persistence & Tool-Calling Agent (in progress)

### Overview
Move conversation storage from the frontend's `localStorage` into a local MongoDB instance, and give the agent **tool-calling** access to it — the model decides when to query or mutate conversation history, rather than the backend exposing a conventional REST CRUD API for it. This is the resume-facing centerpiece of the project: it demonstrates an agent that reasons about *when* to act on a database, not just a chatbot wired to one.

### Stack additions
- MongoDB Community Server, installed locally on the backend machine, default port `27017`
- `motor` — async MongoDB driver (matches FastAPI's async style; avoids blocking the event loop the way sync `pymongo` calls would)

### Config (`backend/.env`)
- `MONGODB_URI` — e.g. `mongodb://localhost:27017`
- `MONGODB_DB_NAME` — e.g. `ag_ai`

### Data model
One collection, `conversations`, with messages embedded as an array (idiomatic MongoDB — avoids a join for the common case of "load one conversation"):

```json
{
  "_id": "ObjectId(...)",
  "title": "optional, derived from first message",
  "created_at": "2026-09-04T18:00:00Z",
  "updated_at": "2026-09-04T18:05:00Z",
  "messages": [
    { "role": "user", "content": "...", "timestamp": "2026-09-04T18:00:00Z" },
    { "role": "assistant", "content": "...", "timestamp": "2026-09-04T18:00:02Z" }
  ]
}
```

### Two separate persistence paths — do not conflate them
1. **Auto-save (deterministic, not model-controlled).** Every request to `/api/chat` appends the user message and the assistant's reply to the relevant conversation document. This always happens; the LLM has no say in it. This is what makes history durable across page reloads.
2. **Agent tools (LLM-controlled).** The model is given a set of callable tools it may invoke when the user's message calls for it in natural language:
   - `list_conversations()` — return recent conversation summaries
   - `search_history(query: str)` — full-text search across past messages
   - `delete_conversation(conversation_id: str)` — delete a conversation
   
   The model decides *whether* and *which* tool to call based on the user's message (e.g. "what did we talk about yesterday?" → `search_history`); the agent executes the actual MongoDB operation via a Motor query and feeds the result back to the model to compose a natural-language reply. Ollama's `/api/chat` supports a `tools` field (function-calling) for tool-capable models, which `llama3.1` supports.

### Open questions — resolved during implementation (2026-09-06)

- ~~Whether `/api/chat` needs a `conversation_id` in the request/response contract~~ **Resolved:** no `conversation_id` in the API contract. There is exactly one continuously-growing conversation document (see below); `list_conversations`/`search_history`/`delete_conversation` all operate on it without the model or frontend needing to track an ID. Revisit once the frontend supports multiple/separate conversations (step 7).
- ~~Whether the frontend needs new REST endpoints (e.g. `GET /api/conversations`)~~ **Deferred, not part of this pass.** This pass is backend/agent-only — the frontend still reads from `localStorage`. Step 7 below remains its own future phase.
- ~~Tool-call error handling~~ **Resolved, see "Tool contracts" below.**

**Single-conversation model, confirmed:** the project keeps exactly one conversation document (matching the existing `save_turn` behavior). `delete_conversation` deletes that one document outright — no `conversation_id` argument. `list_conversations` returns at most one summary today; it takes an unused `limit` argument now only so its shape doesn't need to change if/when multi-conversation support (step 7) lands.

**Tool-loop design:** two-call loop, capped at one round (no recursive/chained tool calls):
1. Call Ollama's `/api/chat` with the user's message, the fixed system prompt, and the three tool schemas (`tools` field).
2. If the model's response includes `message.tool_calls`, execute **the first** requested tool call against MongoDB via the corresponding `db.py` function (a model could technically request more than one; only the first is executed to keep this bounded).
3. Append the assistant's tool-call message and a `role: "tool"` message (containing the JSON-serialized result) to the conversation sent to Ollama, and make a second `/api/chat` call (no `tools` field this time) so the model composes the final natural-language reply.
4. If the model's first response has no `tool_calls`, its `content` is returned directly — no second call.

This mirrors Ollama/OpenAI-style function calling and keeps the interesting behavior (deciding *whether* and *which* tool to call) with the model, while the final reply's phrasing also comes from the model rather than a backend template.

**Tool contracts:**
- `list_conversations(limit: int = 10)` → JSON array of `{id, title, created_at, updated_at, message_count}` for the current conversation (0 or 1 entries today). No DB error path beyond the shared one below.
- `search_history(query: str)` → uses a MongoDB **text index** on `messages.content` (created once at startup — see step 5) to find matching conversations via `$text`, then filters that conversation's `messages` array in Python for entries containing the query (case-insensitive substring) to build `{role, content, timestamp}` snippets, capped at 10 results. Empty result set is a normal (non-error) `[]`, not an error.
- `delete_conversation()` → **guarded by an explicit-confirmation check the backend performs itself, independent of what the model decides to call.** Before executing, the backend checks the *current* user message (case-insensitive) for a confirmation signal — the word `"confirm"`, or a `"yes"`/`"sure"`/`"please"` token combined with a delete-intent word (`"delete"`/`"remove"`/`"clear"`/`"wipe"`) in the same message. If absent, the tool is **not executed**; its result to the model is a JSON object explaining that confirmation is required, so the model asks the user to confirm explicitly in its reply. If present, it deletes the single conversation document and returns a success result. If no conversation exists yet, returns a "nothing to delete" result rather than an error. Because the agent is currently single-turn (no conversation history sent to the model — see step 7 in the roadmap), a genuine two-step confirmation requires the user's *follow-up* message to itself restate both the delete intent and a confirmation word (e.g. "yes, please delete it") — the model has no memory of having asked.
- **Tool-execution DB errors** (MongoDB unreachable mid-tool-call, distinct from the deterministic auto-save path): caught per-tool and fed back to the model *as the tool result* (e.g. `{"error": "database unavailable"}`), not surfaced as an HTTP 502 — the request still completes with 200 and the model explains the failure in natural language. This is different from `agent.AgentError`, which is reserved for Ollama itself being unreachable/erroring and still produces a 502.

**Verified behavior (2026-09-07):** `list_conversations`, `search_history`, and the two-step delete-confirmation flow were all exercised live against MongoDB and the configured Ollama model (`llama3.1:8b`) — see verification log below. One consequence of the two independent persistence paths worth calling out: because `save_turn` (deterministic auto-save) always runs *after* `agent.run()` regardless of what the agent did, the very message that confirms a deletion is itself auto-saved as a brand-new single-turn conversation immediately after the old one is deleted. This is expected given the design (auto-save doesn't know or care that a delete just happened), not a bug — flagging it so it isn't mistaken for the delete having silently failed. Also observed: `llama3.1:8b` is somewhat tool-happy — it called a history tool even for at least one message that didn't warrant one (a plain factual statement with no history-related intent). The tool execution and results were still correct; this is a prompt-tuning opportunity for `SYSTEM_PROMPT` in `agent.py`, not a functional bug, and is left as-is for now.

**Environment note (2026-09-06):** MongoDB Community Server is confirmed installed and already running as a Windows service (`Get-Service MongoDB` → `Running`), reachable on `localhost:27017` — no install/start action was needed this pass despite this doc's step 1 note below having gone unverified for a while. Ollama at the configured `OLLAMA_BASE_URL` (`10.0.0.68:11434`) was confirmed reachable and `llama3.1:8b` confirmed to report `"capabilities": ["completion", "tools"]` via `GET /api/tags`, so tool-calling is actually supported by the configured model, not just assumed.

### Development steps
1. ✅ Install MongoDB Community Server locally; confirm it's reachable on `localhost:27017` (confirmed running as a Windows service — see environment note above)
2. ✅ Add `motor` to `requirements.txt`; add `db.py` with a Motor client reading `MONGODB_URI`
3. ✅ Add `MONGODB_URI` / `MONGODB_DB_NAME` to `.env.example` — dedicated `ag_ai` database, isolated from other local databases on this machine
4. ✅ Implement auto-save of every `/api/chat` turn to the `conversations` collection
5. ✅ Define the tool schemas and wire them into the Ollama request in `agent.py`; create the `messages.content` text index at FastAPI startup
6. ✅ Implement the tool-execution loop (model requests a tool call → agent runs it against MongoDB → result fed back to the model) — capped at one tool call per turn, confirmation-gated delete, DB errors surfaced as tool results rather than 502s
7. ⏳ Update the frontend to load conversation history from the backend instead of `localStorage` (may require new REST endpoints, see open questions) — **not part of this pass**

---

## Phase 4: Mock Bank Transactions & Financial Tool-Calling (implemented)

### Overview
Second, independent domain added to the same agent alongside conversation history: mock bank accounts/transactions, reasoned over via tool-calling in the same style as Phase 3 (`list_accounts`/`search_transactions`/`get_spending_summary` joining `list_conversations`/`search_history`/`delete_conversation` in one `TOOLS` list and one `SYSTEM_PROMPT`). No real bank integration exists yet — data is a deterministic, seeded mock dataset, chosen so the tool-calling pattern and aggregation logic can be built and demoed now, with real bank data able to slot in later behind the same `db.py` function signatures.

### Data model
Two new collections, following the same "denormalize to avoid a join" idiom `conversations.messages` already uses:

- **`accounts`** — exactly 3 fixed documents (`_id` ∈ `checking`/`savings`/`credit_card`, doubling as the tool-arg enum value): `{_id, name, type, current_balance}`.
- **`transactions`** — ~100+ documents: `{_id, account_id, account_name, account_type, date, amount, merchant, description, category, running_balance}`. Account name/type are denormalized onto each transaction for the common read path (list/filter transactions without a join back to `accounts`).

**Sign convention:** `amount`/`running_balance` mean "this account's balance moved by this much." For Checking/Savings that's literal cash; for Credit Card, positive reduces debt owed and negative increases it, so its balance trends *negative* as debt grows (e.g. `-450.00` = "you owe $450"). A card payment from Checking is a symmetric `Transfer` pair: `-300` on Checking, `+300` on Credit Card.

**Fixed categories (11):** `Groceries, Rent, Dining, Transport, Entertainment, Utilities, Income, Shopping, Healthcare, Transfer, Other` — see `db.CATEGORIES`.

### Mock data generation
The mock dataset's source of truth is two checked-in, human-editable CSV fixtures, not code:

- `backend/data/accounts.csv` — `account_id, name, type, opening_balance` (one row per account, 3 rows).
- `backend/data/transactions.csv` — `account_id, days_ago, category, merchant, description, amount` (~107 rows). Dates are stored as **`days_ago`, not absolute dates**, specifically so the checked-in file doesn't go stale: every time the seed script runs, `days_ago` is resolved against *that run's* "today," so the ledger always reads as "the last ~6 months up to now" — relative spacing between transactions (biweekly paychecks, monthly rent, etc.) is preserved, only the anchor moves. Editing either CSV by hand (e.g. adding a row, tweaking an amount) and re-seeding is the intended way to change the mock data now — there's no RNG to reason about.

`backend/scripts/seed_transactions.py` loads both CSVs, resolves `days_ago` to absolute dates against the run's current date, sorts each account's transactions chronologically, walks them forward from `opening_balance` to compute `running_balance` per transaction and `current_balance` per account (same calculation as before — only the data's origin changed, not this logic), then loads the result into MongoDB. Idempotent (clears both collections before inserting, so re-running is always safe). Run manually (`cd backend && .\.venv\Scripts\python.exe scripts\seed_transactions.py`) — **not** copied into `backend/Dockerfile`, which deliberately only ships `main.py agent.py db.py`; this is a one-off dev/demo step, not a runtime dependency (the CSVs in `backend/data/` aren't shipped either, for the same reason). `db.ensure_indexes()` (already called at FastAPI startup) additionally creates `transactions` indexes on `(account_id, date)` and `category`.

MongoDB remains the only store the agent's tools and `GET /api/transactions` read from — the CSVs are a seed-time input, not a runtime data path. Re-verified after this change: reseeding from the CSVs reproduced the exact same balances as the original RNG-generated data (Checking $24,960.16, Credit Card -$1,920.54, Savings $15,057.34), since the CSVs were themselves exported from that already-seeded, already-verified dataset rather than redrawn from scratch.

### Tool contracts
- `list_accounts()` → all 3 accounts with `current_balance`. Answers balance questions directly — no separate balance tool.
- `search_transactions(account?, category?, merchant?, start_date?, end_date?, min_amount?, max_amount?, limit=20)` → raw matching transactions, most recent first. For lookups only ("show me my Amazon purchases") — its description explicitly tells the model not to use it for totals.
- `get_spending_summary(category?, account?, start_date?, end_date?)` → **computes** total spend and a per-category breakdown in Python over Mongo-filtered outflow (`amount < 0`) transactions — never hands raw rows to the model to add up. **Excludes `Transfer` and `Income` by default** (unless a specific category is requested) so moving money between your own accounts, or receiving it, isn't counted as spending — verified live: a "how much have I spent in total" query returned exactly the DB-computed total ($13,860.38 in one verification run), matching `get_spending_summary()` called directly and excluding the Transfer/Income legs of the ledger.

Aggregation is done Python-side rather than via a Mongo `$group` pipeline: at this data volume there's no performance case for it, it mirrors `search_history`'s existing "Mongo narrows, Python finishes" style, and it's far easier to test hermetically (see `tests/test_db_transactions.py`'s `FakeCollection`, which understands only the small operator set `db.py` actually emits — not a general MongoDB emulator).

### Agent changes
- `SYSTEM_PROMPT` now covers both domains (conversation history and the 3 accounts/categories) in one string, and `run()` interpolates the current UTC date into the system message **at call time** (`f"{SYSTEM_PROMPT}\n\nToday's date is {today}..."`) so relative-date questions ("this month", "last week") resolve correctly — previously nothing told the model what day it was. `SYSTEM_PROMPT` itself stays the stable, docs-referenced persona constant; only the date suffix is computed per-call.
- **One-tool-per-turn cap is unchanged, explicitly accepted for this domain too.** A compound question ("what's my balance and how much did I spend on dining") only gets one half answered per turn, identical to today's behavior with the conversation-history tools — not something this phase fixes.

### New read-only endpoint: `GET /api/transactions`
Added to `main.py` for the frontend's transactions panel **display only** — a deliberate, scoped exception to the "no REST CRUD" stance, which is specific to conversation history (see CLAUDE.md); it is unrelated to that anti-pattern and doesn't reopen it. The agent itself still only reads this data via tool-calling, never via this endpoint. No request body/query params — the ~100+ row volume is small enough to return in one shot (internally calls `search_transactions(limit=500)`, a display cap comfortably above the seed's ~107 rows, not pagination — see the comment at that call site if the seed volume grows). Returns `{accounts, transactions}`; a Mongo error returns `503` with the existing `{error: string}` shape rather than an unhandled 500. Not covered by the `/api/chat`-only rate limiter (cheap read, no LLM cost).

### Verified behavior (2026-09-13)
Exercised live end-to-end against local MongoDB and the configured Ollama model (`gemma4:latest`): a balance question ("what's my checking balance?") correctly called `list_accounts` and returned the exact seeded balance; a category-spending question ("how much have I spent on groceries in total?") correctly called `get_spending_summary` and returned the exact computed figure ($448.51, 5 transactions) rather than a model-estimated one; a whole-ledger spending question correctly excluded all `Transfer`/`Income` legs, matching `get_spending_summary()` called directly; the pre-existing `list_conversations` tool still worked in the same session, confirming the dual-domain system prompt didn't regress Phase 3. `GET /api/transactions` and the frontend `TransactionsPanel` were verified in a real (headless) browser: 3 accounts and all ~107 transactions rendered, and the panel correctly stacks below chat instead of beside it under the existing 600px mobile breakpoint, with no console errors.
