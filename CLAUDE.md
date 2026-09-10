# Ledgr — CLAUDE.md

Self-hosted AI chatbot: React/TS frontend + FastAPI backend + Ollama (LLM) + MongoDB (conversation store). Full narrative and rationale live in [README.md](README.md), [backend/specs.md](backend/specs.md), and [ui/specs.md](ui/specs.md) — this file is the condensed operating manual, not a replacement for them. Read the relevant specs.md before touching Phase 2/3 backend logic; it has the "why" behind decisions this file only states as rules.

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | React 18.3, TypeScript 5.6 (strict), Vite 5.4 | plain CSS, no UI library |
| Backend | Python 3.11+, FastAPI 0.115, Pydantic 2.9, Uvicorn 0.30 | |
| Agent | `httpx` 0.27 (async) → Ollama `/api/chat` | |
| Persistence | MongoDB (local), `motor` 3.7 (async driver) | |

## Architecture — do not conflate these two paths

1. **Auto-save (deterministic, `db.py`).** Every `/api/chat` turn is saved to MongoDB unconditionally in `main.py`, regardless of what the agent/model did. This is not model-controlled and must never become conditional on agent behavior.
2. **Agent tools (LLM-controlled, `agent.py`).** The model decides *whether* to call `list_conversations` / `search_history` / `delete_conversation` based on the user's message. These are separate from auto-save — a tool call is not how turns get persisted.

If you're touching persistence, know which of the two paths you're in before changing it.

## Hard constraints (verified design decisions — don't silently change)

- **API contract is fixed**: `POST /api/chat` — `{ "message": string }` → `{ "response": string }`, errors as `{ "error": string }`. The frontend requires zero changes as long as this holds. Changing it means updating both `ui/src/services/api.ts` and `backend/main.py` together.
- **No `conversation_id` in the contract.** There is exactly one continuously-growing conversation document. Don't add multi-conversation support piecemeal — it's an explicit future phase (see README roadmap) that needs the tool contracts, the frontend, and the data model updated together.
- **Tool-calling loop is capped at one round, non-recursive**: call Ollama with tools → if `tool_calls`, execute only the *first* one → feed result back → second call *without* `tools` for the final reply. Don't make this recursive without re-reading `backend/specs.md` Phase 3 (it's a deliberate bound, not an oversight).
- **`delete_conversation` requires explicit user confirmation**, checked by the backend itself (not left to the model's judgment) via a keyword check on the current message. Don't remove or weaken this check to make delete "more responsive."
- **Two distinct error paths, don't merge them**: `agent.AgentError` (Ollama unreachable/erroring) → HTTP 502. Tool-execution DB errors (Mongo unreachable mid-tool-call) → caught per-tool, fed back to the model as a normal tool result, request still returns 200.
- **CORS is wide open (`allow_origins=["*"]`)** — this is a local-dev-only project, not a security oversight to "fix" unprompted.

## Patterns to follow

- Backend: async all the way through (`httpx`, `motor`) — never introduce a blocking call (e.g. `pymongo` sync client) on a request path.
- Frontend: no `any`; explicit interfaces in `src/types/`; state typed via hooks per `ui/specs.md` §6.
- New backend config goes in `backend/.env` (gitignored) with a matching entry added to `.env.example` — never hardcode secrets/hosts.
- Ollama and MongoDB are both external local/LAN services, not mocked in dev — if either is down, reproduce against the real service rather than stubbing it, since the 502 / tool-error paths above are part of the contract.

## Coding practices going forward

- **Keep docs synchronized with cross-cutting changes.** `main.py` has grown a rate limiter, `HTTPSRedirectMiddleware`, and a message-length cap that aren't mentioned in `backend/specs.md`, README, or (until now) here — don't let that drift widen. When you add something like this, update the relevant spec/README in the same change, not as a follow-up.
- **Shared constants need one source of truth, not a synced comment.** `MAX_MESSAGE_LENGTH` is duplicated in `backend/main.py` and `ui/src/constants.ts`, linked only by a comment on each side. Don't add more of these; if you touch either value, check the other by hand until this is unified.
- **Extend tests when you touch their area, don't let coverage regress.** `backend/tests/test_chat.py` (pytest + FastAPI `TestClient`) covers `/api/chat`'s validation paths, the malformed-JSON path, and the 502-on-Ollama-down path — all mocked/hermetic except one `@pytest.mark.live_llm`-marked test that calls this machine's real local Ollama (see `backend/README.md`). `ui/src/**/*.test.{ts,tsx}` (vitest + RTL) covers `InputField`, `api.ts`, and `storage.ts`. Not yet covered: `agent.py`'s tool-calling loop, `db.py`'s Mongo operations, and `MessageList`/`ChatWindow`/`App.tsx` on the frontend — add tests for these as you touch them, don't add unrelated ones speculatively.
- **Commit in small, scoped units**, not large undifferentiated ones — makes `git blame`/bisect useful and matters for a portfolio piece where reviewers may read the history itself.
- **Secrets/config discipline**: new config always goes in `.env` (gitignored) with a matching placeholder in `.env.example`; never hardcode hosts/credentials. (Already followed — keep it that way.)
- **Security-relevant additions get a one-line rationale comment**, matching the existing `FORCE_HTTPS` comment in `main.py` explaining why it defaults off. Extend that standard to the rate limiter and any future middleware.

## Anti-patterns (seen in this repo's history, don't reintroduce)

- Don't add a REST CRUD API for conversation history (`GET /api/conversations`, etc.) as a shortcut — the deliberate design is agent tool-calling over the DB, not conventional CRUD. This may change only as part of the explicit "frontend loads history from backend" roadmap item, which is a scoped future phase, not an incidental fix.
- Don't pass full conversation history to the model yet — it's currently single-turn by design (see `agent.py` `SYSTEM_PROMPT` / roadmap item "multi-turn context").

## Where things are

```
backend/   main.py (route+validation), agent.py (Ollama calls, tool loop), db.py (Motor client, auto-save)
ui/src/    components/ (Chat*, Message*, InputField), services/api.ts, utils/ (localStorage), types/
```

Setup/run commands: see [README.md](README.md#getting-started). Tests exist (`backend/tests/` — pytest; `ui/src/**/*.test.{ts,tsx}` — vitest) but CI does not (see README "Path to portfolio-ready") — don't assume tests run automatically anywhere.
