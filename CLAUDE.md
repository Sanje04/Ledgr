# Ledgr — CLAUDE.md

Self-hosted AI chatbot: React/TS frontend + FastAPI backend + Ollama (LLM) + MongoDB (conversation store + mock bank accounts/transactions). Full narrative and rationale live in [README.md](README.md), [backend/specs.md](backend/specs.md), and [ui/specs.md](ui/specs.md) — this file is the condensed operating manual, not a replacement for them. Read the relevant specs.md before touching Phase 2/3/4 backend logic; it has the "why" behind decisions this file only states as rules.

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | React 18.3, TypeScript 5.6 (strict), Vite 5.4 | plain CSS, no UI library; `recharts` for the one chart (`CategorySpendingChart`) — a charting library, not a UI component library, so it doesn't violate "no UI library" |
| Backend | Python 3.11+, FastAPI 0.115, Pydantic 2.9, Uvicorn 0.30 | |
| Agent | `httpx` 0.27 (async) → Ollama `/api/chat` | |
| Persistence | MongoDB (local), `motor` 3.7 (async driver) | |

## Architecture — do not conflate these three paths

1. **Auto-save (deterministic, `db.py`).** Every `/api/chat` turn is saved to MongoDB unconditionally in `main.py`, regardless of what the agent/model did. This is not model-controlled and must never become conditional on agent behavior.
2. **Agent tools (LLM-controlled, `agent.py`).** The model decides *whether* to call a tool based on the user's message — `list_conversations` / `search_history` / `delete_conversation` for conversation history, and `list_accounts` / `search_transactions` / `get_spending_summary` for the mock bank data (Phase 4) — sharing one `TOOLS` list, one `SYSTEM_PROMPT`, and one tool-calling loop. These are separate from auto-save — a tool call is not how turns get persisted.
3. **Read-only display endpoint (`GET /api/transactions`, `main.py`).** Used only by the frontend's `TransactionsPanel` to show the mock data; not called by the agent and not tool-calling. Don't route the agent's own reads through this endpoint, and don't add a symmetric endpoint for conversation history (see anti-patterns below) — this one is a scoped, deliberate exception for transactions display, not a precedent.

If you're touching persistence, know which of the three paths you're in before changing it.

## Hard constraints (verified design decisions — don't silently change)

- **API contract is fixed**: `POST /api/chat` — `{ "message": string }` → `{ "response": string }`, errors as `{ "error": string }`. The frontend requires zero changes as long as this holds. Changing it means updating both `ui/src/services/api.ts` and `backend/main.py` together.
- **No `conversation_id` in the contract.** There is exactly one continuously-growing conversation document. Don't add multi-conversation support piecemeal — it's an explicit future phase (see README roadmap) that needs the tool contracts, the frontend, and the data model updated together.
- **Tool-calling loop is capped at one round, non-recursive**: call Ollama with tools → if `tool_calls`, execute only the *first* one → feed result back → second call *without* `tools` for the final reply. Don't make this recursive without re-reading `backend/specs.md` Phase 3 (it's a deliberate bound, not an oversight).
- **`delete_conversation` requires explicit user confirmation**, checked by the backend itself (not left to the model's judgment) via a keyword check on the current message. Don't remove or weaken this check to make delete "more responsive."
- **Two distinct error paths, don't merge them**: `agent.AgentError` (Ollama unreachable/erroring) → HTTP 502. Tool-execution DB errors (Mongo unreachable mid-tool-call) → caught per-tool, fed back to the model as a normal tool result, request still returns 200. `GET /api/transactions` has its own, independent third shape (503 with `{error}` on a DB error) — don't conflate it with either of the above.
- **CORS is wide open (`allow_origins=["*"]`)** — this is a local-dev-only project, not a security oversight to "fix" unprompted.
- **`GET /api/transactions` is a deliberate, scoped exception to the "no REST CRUD" anti-pattern below** — read-only, transactions-display-only, not used by the agent. Don't treat it as license to add a symmetric `GET /api/conversations`; that anti-pattern still stands.
- **`agent.run()`'s system message is built per-call, not sent as the raw `SYSTEM_PROMPT` constant** — it interpolates today's UTC date (`f"{SYSTEM_PROMPT}\n\nToday's date is {today}..."`) so relative-date questions ("this month", "last week") resolve against something. `SYSTEM_PROMPT` itself stays the stable persona/tool-description text; only the date suffix is computed at call time. Keep this shape if you touch `run()`.

## Patterns to follow

- Backend: async all the way through (`httpx`, `motor`) — never introduce a blocking call (e.g. `pymongo` sync client) on a request path.
- Frontend: no `any`; explicit interfaces in `src/types/`; state typed via hooks per `ui/specs.md` §6.
- New backend config goes in `backend/.env` (gitignored) with a matching entry added to `.env.example` — never hardcode secrets/hosts.
- Ollama and MongoDB are both external local/LAN services, not mocked in dev — if either is down, reproduce against the real service rather than stubbing it, since the 502 / tool-error paths above are part of the contract.
- **Category → color assignment is fixed, not rank-based.** `ui/src/utils/categoryColors.ts` maps each spending category to the same hue everywhere, permanently — don't reassign colors by sort order or by which categories happen to be present in a given filter/time window. This is what lets `CategorySpendingChart` change the account filter without repainting a category that's still on screen. `Other` is deliberately gray, not a 9th categorical hue — keep it that way if you add a category.
- **The frontend has a real light/dark theme system now** (`ui/src/styles/index.css` tokens, `ui/src/utils/theme.ts`, `ui/src/components/ThemeToggle.tsx`) — this superseded the earlier single-light-theme design. New UI must use the CSS custom properties (`--color-*`, `--cat-*`, `--shadow-*`, `--radius-*`) rather than hardcoded hex, or it'll look broken in dark mode. Don't hardcode a color "just this once."
- **Animation choices follow `skills/emil-design-eng_SKILL.md` and `skills/animate_SKILL.md`** (project-local design/motion philosophy docs, not standard Claude Code skills — read directly, not invoked via the Skill tool). In short: `transform`/`opacity` only, never `scale(0)`, custom `ease-out` curves not builtin ones, sub-300ms UI durations, `:active` press feedback on every button, and `prefers-reduced-motion` shipped with every animation, not after.

## Coding practices going forward

- **Keep docs synchronized with cross-cutting changes.** `main.py` has grown a rate limiter, `HTTPSRedirectMiddleware`, and a message-length cap that aren't mentioned in `backend/specs.md`, README, or (until now) here — don't let that drift widen. When you add something like this, update the relevant spec/README in the same change, not as a follow-up.
- **Shared constants need one source of truth, not a synced comment.** `MAX_MESSAGE_LENGTH` is duplicated in `backend/main.py` and `ui/src/constants.ts`, linked only by a comment on each side. `VITE_API_URL`/`VITE_TRANSACTIONS_API_URL` (`ui/.env.example`) are a second instance of the same problem — they're meant to be set together, but nothing enforces it, so leaving one unset silently mismatches chat and the transactions panel on whether a real backend is configured. Don't add more of these; if you touch either half of either pair, check the other by hand until this is unified.
- **Extend tests when you touch their area, don't let coverage regress.** `backend/tests/test_chat.py` covers `/api/chat`'s validation/malformed-JSON/502 paths (mocked/hermetic except one `@pytest.mark.live_llm` test — see `backend/README.md`). `backend/tests/test_db_transactions.py`, `test_agent_tools.py`, and `test_transactions_endpoint.py` (Phase 4) cover the new transaction/account `db.py` functions, their `agent.py` tool dispatch, and `GET /api/transactions` — all hermetic via monkeypatching (`asyncio.run()` inside plain `def` tests, no `pytest-asyncio` dependency added). `ui/src/**/*.test.{ts,tsx}` covers `InputField`, `api.ts`, `storage.ts`, `transactions.ts`, `TransactionsPanel` (including its account filter), `spending.ts`, and `CategorySpendingChart`. Still not covered: the pre-existing `list_conversations`/`search_history`/`delete_conversation` tool dispatch and `db.py` functions, and `MessageList`/`ChatWindow`/`App.tsx` — add tests for these as you touch them, don't add unrelated ones speculatively.
- **Commit in small, scoped units**, not large undifferentiated ones — makes `git blame`/bisect useful and matters for a portfolio piece where reviewers may read the history itself.
- **Secrets/config discipline**: new config always goes in `.env` (gitignored) with a matching placeholder in `.env.example`; never hardcode hosts/credentials. (Already followed — keep it that way.)
- **Security-relevant additions get a one-line rationale comment**, matching the existing `FORCE_HTTPS` comment in `main.py` explaining why it defaults off. Extend that standard to the rate limiter and any future middleware.

## Anti-patterns (seen in this repo's history, don't reintroduce)

- Don't add a REST CRUD API for conversation history (`GET /api/conversations`, etc.) as a shortcut — the deliberate design is agent tool-calling over the DB, not conventional CRUD. This may change only as part of the explicit "frontend loads history from backend" roadmap item, which is a scoped future phase, not an incidental fix.
- Don't pass full conversation history to the model yet — it's currently single-turn by design (see `agent.py` `SYSTEM_PROMPT` / roadmap item "multi-turn context").

## Where things are

```
backend/   main.py (routes+validation), agent.py (Ollama calls, tool loop), db.py (Motor client, auto-save, account/transaction queries)
           data/accounts.csv, data/transactions.csv (checked-in mock data source, hand-editable)
           scripts/seed_transactions.py (loads data/*.csv into MongoDB, not run by the app)
ui/src/    components/ (Chat*, Message*, InputField, TransactionsPanel, CategorySpendingChart, ThemeToggle),
           services/ (api.ts, transactions.ts), utils/ (localStorage, theme, categoryColors, spending), types/
           styles/index.css (design tokens, light+dark)
```

**Mock transaction data lives in `backend/data/*.csv`, checked into git — MongoDB is still the only runtime store the agent/endpoint read from.** To change the mock data, edit the CSVs and re-run the seed script; don't hand-edit MongoDB directly or regenerate the CSVs from a random draw (there's no RNG here — see `backend/specs.md` Phase 4 for why `transactions.csv` stores `days_ago` instead of absolute dates).

Setup/run commands: see [README.md](README.md#getting-started). Seed the mock transaction data once (`cd backend && .\.venv\Scripts\python.exe scripts\seed_transactions.py`) before the transaction tools/panel have anything to show — safe to re-run. Tests exist (`backend/tests/` — pytest; `ui/src/**/*.test.{ts,tsx}` — vitest) but CI does not (see README "Path to portfolio-ready") — don't assume tests run automatically anywhere.
