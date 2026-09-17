# Frontend Design Spec

## Frameworks & Stack

- **Frontend**: React 18+ (latest stable) with **TypeScript**
- **Build Tool**: Vite
- **Node.js**: Any recent stable version (20+)
- **Language**: TypeScript (strict mode recommended)
- **Styling**: Plain HTML and CSS (no external UI library)
- **Storage**: LocalStorage (for chat history persistence)

---

## Project Overview

Build a **frontend-only** React chatbot application with:
- A chat interface (WhatsApp/Slack style layout)
- User input field for text prompts
- Display of chat messages (user and bot)
- Persistent chat history using browser LocalStorage
- Error handling with simple error messages
- No authentication required for MVP

---

## Project Structure

```
tender-ui/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── ChatWindow.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageItem.tsx
│   │   └── InputField.tsx
│   ├── services/
│   │   └── api.ts (handle API calls to backend)
│   ├── utils/
│   │   └── storage.ts (LocalStorage utilities for chat history)
│   ├── types/
│   │   └── index.ts (TypeScript interfaces and types)
│   ├── styles/
│   │   ├── index.css (global styles)
│   │   ├── ChatWindow.css
│   │   ├── MessageList.css
│   │   ├── MessageItem.css
│   │   └── InputField.css
│   ├── App.tsx
│   ├── main.tsx
│   └── App.css
├── tsconfig.json
├── vite.config.ts
├── package.json
└── README.md
```

---

## Detailed Requirements

### 1. **Main Layout (ChatWindow Component)**
- Full-screen container with flexbox layout
- Header section (title: "AI Chatbot")
- Message list area (scrollable, auto-scroll to bottom on new messages)
- Input field area at the bottom
- Responsive design (works on desktop, tablet, mobile)

### 2. **Message Display (MessageList & MessageItem Components)**
- Display all messages in chronological order
- **User messages**: Aligned to right, light gray background
- **Bot messages**: Aligned to left, darker background
- Show timestamps (optional but nice to have)
- Auto-scroll to latest message when new message arrives
- Show "Loading..." indicator while waiting for bot response

### 3. **Input Field Component**
- Text input with placeholder: "Type your message..."
- Send button (can be icon or text "Send")
- Button disabled while waiting for API response
- Clear input field after sending message
- Support Enter key to send (Shift+Enter for new line if needed)

### 4. **Chat History (LocalStorage)**
- Save all conversations to browser LocalStorage under key: `chatHistory`
- Load chat history on app startup
- Persist each new message immediately
- Button or feature to clear chat history (optional, can skip for MVP)
- TypeScript interface for message data:
  ```typescript
  interface Message {
    id: string;
    sender: "user" | "bot";
    message: string;
    timestamp: string;
  }
  
  type ChatHistory = Message[];
  ```
- LocalStorage data format:
  ```json
  [
    { "id": "uuid-or-timestamp", "sender": "user", "message": "Hello", "timestamp": "2026-09-03T10:30:00Z" },
    { "id": "uuid-or-timestamp", "sender": "bot", "message": "Hi there!", "timestamp": "2026-09-03T10:30:02Z" }
  ]
  ```

### 5. **API Integration (api.ts Service)**
- Create async function `sendMessageToAPI(message: string): Promise<string>` that:
  - Takes user message as input (TypeScript string type)
  - Makes POST request to backend (endpoint to be provided later)
  - Returns bot response (Promise<string>)
  - Handles errors gracefully
- **TypeScript Interfaces**:
  ```typescript
  interface ApiRequest {
    message: string;
  }
  
  interface ApiResponse {
    response: string;
  }
  
  interface ApiError {
    error: string;
  }
  ```
- **Error Handling**:
  - Catch network errors (with proper TypeScript error typing)
  - Catch API response errors
  - Display error message in chat: "Error: Unable to get response. Please try again."
  - Allow user to retry sending the message
- **Request Format** (flexible, will adapt when API spec is available):
  ```typescript
  POST /api/chat
  Content-Type: application/json
  
  { "message": "user's text" }
  ```
- **Expected Response**:
  ```typescript
  { "response": "bot's reply text" }
  ```

### 6. **State Management**
- Use React hooks (useState, useEffect) with TypeScript
- TypeScript type definitions for state:
  ```typescript
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  ```
- State variables:
  - `messages` - array of Message objects
  - `inputValue` - current text in input field (string)
  - `isLoading` - boolean for API call in progress
  - `error` - error message if any (string or null)

### 7. **User Flow**
1. User opens the app → loads saved chat history from LocalStorage
2. User types message → input field updates
3. User clicks Send or presses Enter → message added to chat, sent to API, input cleared
4. While waiting for response → show "Loading..." indicator, disable Send button
5. API responds → bot message added to chat, both messages saved to LocalStorage
6. If API errors → show error message, allow retry
7. On page refresh → all previous messages restored from LocalStorage

---

## 8. **TypeScript Configuration**

- **tsconfig.json settings** (recommended):
  - `strict: true` (enable all strict type checks)
  - `jsx: "react-jsx"` (for React 18+)
  - `target: "ES2020"` (modern browser support)
  - `module: "ESNext"` (modern module syntax)
  - `moduleResolution: "bundler"` (for Vite)
  - `resolveJsonModule: true` (for JSON imports if needed)
  
- **Code standards**:
  - Use explicit type annotations for function parameters and return types
  - Create reusable types in `src/types/index.ts`
  - Avoid using `any` type - use proper TypeScript typing
  - Use interfaces for component props (e.g., `interface ChatWindowProps { ... }`)
  - Export types from components for external usage

---

## Features to Implement

### Must Have (MVP)
- ✅ Chat interface layout
- ✅ Send and receive messages
- ✅ Display messages in order
- ✅ Basic API integration (POST endpoint)
- ✅ LocalStorage persistence
- ✅ Simple error messages
- ✅ Loading indicator during API call
- ✅ TypeScript strict type checking

### Nice to Have (Future)
- Clear chat history button
- Message copy to clipboard
- Dark/Light mode
- Timestamps on messages
- Typing indicators

---

## Development Steps

1. **Initialize project** with Vite + React
2. **Create folder structure** as specified above
3. **Build ChatWindow component** (main container)
4. **Build MessageList component** (display chat messages)
5. **Build MessageItem component** (individual message styling)
6. **Build InputField component** (input + send button)
7. **Create storage.js utility** (LocalStorage helpers)
8. **Create api.js service** (API call function)
9. **Integrate all components** in App.jsx
10. **Add CSS styling** (make it look clean and professional)
11. **Test chat flow** locally with mock API
12. **Connect to real backend** when API endpoint is ready

---

## Important Notes

- **TypeScript required** - Use strict mode, proper typing throughout the project
- **No authentication needed** for this MVP
- **Backend API endpoint** to be provided later (I'll integrate it when ready)
- **LocalStorage** will handle chat history for now (no backend persistence)
- **Plain CSS only** - no frameworks like Tailwind or Material-UI
- **Responsive design** - should work on mobile and desktop
- **Error handling** - just display simple error messages, no complex retry logic
- **Type safety** - Avoid `any` types, use explicit interfaces and types

---

## TODO
- ✅ Clarify requirements (DONE)
- ⏳ **Write clear instructions** (THIS DOCUMENT)
- ⏳ Get approval to proceed with development
- ⏳ Build the frontend app
- ⏳ Connect to backend API (when endpoint is ready)

---

## Addendum: Transactions panel (backend/specs.md Phase 4)

Alongside the original chat-only layout above, the app now also renders a **read-only transactions panel** next to `ChatWindow` (a `.main-layout` flex row in `App.tsx`/`App.css`, stacking vertically under the existing 600px mobile breakpoint) — display only, backed by a new `GET /api/transactions` endpoint, independent of the chat agent's own tool-calling access to the same mock data.

- `src/components/TransactionsPanel.tsx` + `src/styles/TransactionsPanel.css` — self-contained (own state/effects, no props, same shape as `ChatWindow`): fetches on mount, renders the 3 mock accounts with balances and a scrollable transaction list (merchant, amount, date, category, account), with loading/error states styled consistently with `ChatWindow`'s existing error UI.
- `src/services/transactions.ts` — `fetchTransactions(): Promise<TransactionsResponse>`, mirroring `api.ts`'s mock-mode fallback: returns hardcoded mock data when `VITE_TRANSACTIONS_API_URL` is unset, otherwise fetches the real endpoint with the same error-handling shape as `sendMessageToRealApi`.
- `src/types/index.ts` gains `Account`, `Transaction`, `TransactionsResponse` — fields kept snake_case to match the wire JSON exactly, consistent with how `ApiRequest`/`ApiResponse` already pass backend JSON through untransformed.
- New env var `VITE_TRANSACTIONS_API_URL` (`ui/.env.example`), set alongside `VITE_API_URL` — leaving only one of the two set means chat and the panel disagree about whether a real backend is configured.

### Account filter + category spending chart

`TransactionsPanel` also renders an account filter (`All`/`Checking`/`Savings`/`Credit Card`) and a donut chart of spending by category over the trailing 30 days, both computed client-side from the already-fetched `GET /api/transactions` payload — no new backend endpoint.

- `src/utils/spending.ts` — pure `getCategorySpendingLastNDays(transactions, days, referenceDate?)`, unit-tested independent of any chart library. Excludes `Transfer`/`Income` (mirrors `backend/db.py`'s `get_spending_summary` exclusion), folds any category outside a fixed 8-category list into `Other`, and returns results in a **fixed category order — never sorted by amount**, so switching the account filter doesn't re-shuffle which color means what.
- `src/utils/categoryColors.ts` — a fixed category→hex mapping (the dataviz skill's validated default categorical palette) plus a muted gray reserved for `Other`, which is deliberately not a 9th categorical hue.
- `src/components/CategorySpendingChart.tsx` — a Recharts (`recharts`, new dependency) donut chart with a center total, a custom tooltip, and a plain-HTML legend that doubles as the required "relief" for palette slots below 3:1 contrast (every category is identified by text, never color alone).
- The account filter is **shared**: selecting an account filters both the transaction list and the chart to that account; `All` combines everything.

---

## Addendum: Design system pass (fintech dashboard visual redesign + dark mode)

The original chat UI (WhatsApp-style green header/bubbles, single light theme) was redesigned into a neutral "fintech dashboard" look with light/dark theme support, following `skills/emil-design-eng_SKILL.md` and `skills/animate_SKILL.md` (project-local design/animation philosophy docs, not part of the standard skill set) for polish and motion decisions.

**Design tokens (`src/styles/index.css`):** a full light/dark token system — surfaces (`--color-bg`, `--color-surface`, `--color-surface-secondary`), ink (`--color-text`, `--color-text-secondary`, `--color-muted`), one accent (`--color-accent` + hover/contrast/wash variants), semantic positive/negative colors, elevation (`--shadow-sm/md/lg`), radius (`--radius-sm/md/lg/pill`), and motion easings (`--ease-out`, `--ease-in-out` — the strong custom curves the animate skill calls for, not the weak CSS built-ins). Every component was migrated off hardcoded hex values onto these tokens so dark mode "just works" everywhere, including the category chart's colors (`--cat-*` custom properties, referenced via `var()` from `utils/categoryColors.ts` so the same `colorForCategory()` call resolves to the right hue in either theme with no theme-detection logic in JS).

**Theme mechanism:** `utils/theme.ts` (get/set stored theme in `localStorage` under `tender-theme`, resolve effective theme against `prefers-color-scheme` when nothing is stored) + `components/ThemeToggle.tsx` (sun/moon crossfade button, in `ChatWindow`'s header). An inline script in `index.html`'s `<head>` applies a stored theme before first paint to avoid a flash of the wrong theme. CSS follows the standard dual-scope pattern: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }` for the OS-level default, plus `:root[data-theme="dark"] {...}` so an explicit toggle wins either direction.

**Chat modernized** (`MessageItem.tsx`/`.css`, `MessageList.tsx`): moved off WhatsApp-style bubbles to a minimal AI-chat layout — a bot avatar badge, assistant replies in a bordered `--color-surface-secondary` card, user messages right-aligned in an accent-wash tint, no speech-bubble tails. Messages animate in with `@starting-style` (opacity + `translateY(6px)` → identity, `ease-out`, 220ms) per the animate skill's preferred tool for "entry animation on mount, no JS state" — reduced-motion keeps the opacity fade and drops the translate.

**Transactions panel restyled** (`TransactionsPanel.tsx`/`.css`): accounts as bordered/shadowed cards with a per-type icon (bank/trending-up/card), section headings as small uppercase muted labels (dashboard-style, not large headings), transaction rows get a hover tint and a category-color dot (reusing the chart's `colorForCategory`) tying the list back to the chart. Mobile's `.transactions-panel` height cap was raised from 40vh to 65vh in the same pass — the account filter + chart + legend had made the previous cap too cramped to reach the transaction list without excessive scrolling (a gap flagged during the Phase 4 mobile check, fixed here rather than deferred).

**Motion rules applied throughout** (per both skill docs): `transform`/`opacity` only, never `scale(0)` (start at `scale(0.9)`+ or higher), `ease-out` on entrances, custom cubic-bezier curves not builtin `ease`, durations under 300ms for UI (buttons 160ms, toggles/tooltips ~200ms, modal 200ms), `:active { transform: scale(0.93–0.97) }` press feedback on every button (send, filter pills, theme toggle, cookie-consent accept, modal close, retry), `@media (prefers-reduced-motion: reduce)` shipped alongside every new animation rather than as a follow-up, and CSS transitions/`@starting-style` (not keyframes) for anything that can be interrupted or retriggered.

---

## Addendum: single dynamic account replaces the account filter (Phase 5 rewrite)

`backend/specs.md` Phase 5 was rewritten so an import creates exactly one user-named account instead of always producing the fixed 3 (`checking`/`savings`/`credit_card`). Since there is now never more than one account to filter, the account filter bar this doc originally described (`All`/`Checking`/`Savings`/`Credit Card`, "Account filter + category spending chart" section above) was removed from `TransactionsPanel.tsx` rather than kept as a single-item no-op — both `CategorySpendingChart` and the transaction list now always render the full (single-account) `transactions` array with no client-side filtering step. `AccountType` (`checking`/`savings`/`credit_card`) survives in `types/index.ts` unchanged — it's still used for the account icon, just chosen by the user in the import dialog instead of being tied to a fixed account identity.

**Import dialog** (`TransactionsPanel.tsx`/`.css`): clicking "Import CSV" and picking a file no longer goes straight to a `window.confirm()` — it opens a small modal (same overlay/scale-from-center/`@starting-style` pattern as `LegalModal.tsx`, see its CSS for the shared convention) asking for the account's name (free text, required), type (select, for the icon), and an optional opening balance, with the "this replaces all existing data" warning as static copy in the dialog instead of a native confirm. Submitting calls `importTransactionsCsv(file, accountName, accountType, openingBalance)`, which now sends `account_name`/`account_type`/`opening_balance` as additional multipart form fields alongside the file.

`src/utils/categoryColors.ts` and `src/utils/spending.ts` had comments referencing "the account filter" as the reason category colors stay fixed across re-renders — updated to reference importing a new dataset instead, since that's the only thing that still changes the visible transaction set now that there's no filter.
---

## Addendum: Tender design system + dashboard-first layout

The app was re-laid-out around the dashboard and re-skinned onto the **Tender design
system**. Two inputs, both in the supplied design bundle: `_ds/tender-design-system-*/`
(the token set and its written rules — its component layer is 375×812 mobile furniture and
is *not* used), and `Ledgr Analyzer.dc.html` (a design canvas built from this repo, which
supplied the layout and the Tender→Ledgr token mapping). The canvas ships its own
client-side engine (sample transactions, in-browser CSV parsing, localStorage persistence);
**none of that was carried over** — every screen is wired to the real
`GET /api/transactions`, `POST /api/transactions/import` and `POST /api/chat`.

### Layout inversion

`App.tsx` was chat-primary (`ChatWindow` at 60% beside a 360px read-only
`TransactionsPanel`). It is now dashboard-primary: a full-bleed brand-gradient `AppHeader`,
then a sheet (`margin-top:-18px`, `24px` top corners, `--gradient-sheet`) holding the active
screen plus a 380px/56px collapsible `AssistantRail`. The header renders outside the screen
switch so the app never flashes a bare page.

`ChatWindow.tsx` → `AssistantRail.tsx` is a `git mv` plus `{isOpen, onToggle, scopeLabel}` —
its five state variables and send/retry logic are unchanged. `TransactionsPanel.tsx` was
deleted: its fetch went to `useTransactions`, its import dialog became `PreviewScreen`, and
its lists became dashboard cards.

### Screens (derived from data state — there is no router)

`App.tsx` branches in this order, and the order is load-bearing:

1. `!hasLoadedOnce` → `AppLoading`
2. `pendingImport !== null` → `PreviewScreen` — **above** the error check, so a failed
   reload doesn't trap a user with a file waiting to confirm
3. `status === "error"` → `AppError` with retry. Required because `fetchTransactions`
   collapses every failure into one string: without it an unreachable backend renders the
   *upload* screen and invites the user to drop a file into nothing
4. `transactions.length === 0` → `UploadScreen`
5. otherwise → `DashboardScreen`

`useTransactions` separates `status` (last completed outcome) from `isFetching` (request in
flight) so a retry doesn't briefly leave the error state and flash a different screen, and
gates the spinner on `hasLoadedOnce` so a post-import reload doesn't blank the dashboard.
It also **sorts ascending by date once**, centrally — the endpoint returns newest-first, and
every aggregate downstream wants the opposite.

### Preview import is display-only

`utils/csvPreview.ts` mirrors the backend's column *detection* (`db._find_statement_header`
/ `_find_column`) so the screen can report which columns it found, and nothing else. It does
not reproduce `_parse_import_csv`'s validation, the DEBIT/CREDIT sign flip,
`_derive_merchant` or `_classify_import_category`; the table shows the file's **raw cells**,
and the raw unmodified file is POSTed. The backend stays the single authority on whether an
import is valid — an unreadable header is reported but still submittable. Server rejections
(including the row-numbered ones) render on the preview screen with the form intact, rather
than bouncing back to upload and discarding what the user typed.

### Dashboard state

Filters (`range`, `category`, `merchant`) and `railOpen` live in `DashboardScreen`, not
`App` — the only way off the dashboard is an import that replaces all data, where resetting
filters is correct and unmount gives it for free. `mode`/`granularity` belong to the trend
card and `merchantSort` to the merchants card. Granularity is **derived at render**
(`clampGranularity(preference, range)`), never synced into state, so widening the range
restores the user's choice.

**The self-exclusion rule** — the bug most likely to reappear: a card is fed the slice with
every filter applied *except its own dimension*. Give the donut the category-filtered array
and clicking a slice collapses it to one slice with no way back. The trend chart is the
exception: its dimension is time, which the range pills already own separately.
`detectRecurring`/`detectAnomalies` run over the **full unfiltered history**, not the
range-scoped rows — a 30-day window can't distinguish a cadence from a coincidence.

### Deliberate deviations from the canvas

- **recharts, not hand-rolled SVG**, for both the donut and the new trend chart.
- **No account filter** — one account by design (Phase 5 rewrite); replaced by a static
  `AccountSummary`.
- **No chat-driven dashboard filtering and no per-row recategorization.** `/api/chat` is
  frozen at `{message} → {response}` with no structured action channel, and there is no
  PATCH endpoint. User-driven click-to-filter (donut slice, legend row, merchant row,
  anomaly card) *is* implemented — it's pure client state.
- **Omitted for want of endpoints**: "Delete all data", "Load sample data", multi-CSV
  merge/de-dup.
- **No net-worth line**: `running_balance` is per-account and not summable across the
  response.

### Known limitations recorded, not fixed

- **Imported rows are almost all `Other`.** `db._classify_import_category` only
  distinguishes two transfer markers and never assigns the `Income` *category*, so on a real
  imported statement the **category breakdown degenerates** — the donut is one slice, the
  legend one row, and the category filter a no-op. Verified against a 220-row statement; the
  card says so on screen rather than just looking broken. Fixing it client-side was
  rejected: the assistant reads the same stored field via MCP, so chat and dashboard would
  visibly disagree.

  The rest of the dashboard holds up better than that implies, which was confirmed on the
  same import rather than assumed. The income and net KPIs are **not** affected — `isIncome`
  keys off a positive amount rather than the category, so CREDIT rows still count
  (that import reported $8,177.24 in, correctly). Top merchants, the trend chart and
  recurring detection all work on real merchant strings. `detectAnomalies` found outliers
  only because of its global-baseline fallback for thin categories — with everything filed
  under one category, that fallback is what keeps the card alive, not a defensive extra.
- **"All" is really "the 500 most recent."** `GET /api/transactions` takes no query params
  and caps at 500, newest-first, with no total count. The table shows a notice when exactly
  500 rows come back.
- **Mock mode can't reach Upload or Preview** (the mock returns 3 transactions and
  `importTransactionsCsv` throws without `VITE_TRANSACTIONS_API_URL`). Not worked around
  with a third env var; exercise those screens against a real backend.

---

## Addendum: assistant replies render as Markdown

Assistant text was rendered literally in a `<p>`, so the model's `**bold**` and
`- ` bullets reached the user as raw syntax. `utils/markdown.ts` (pure tokenizer,
tested) + `components/Markdown.tsx` (React elements, no `dangerouslySetInnerHTML`)
now parse a deliberately small subset: paragraphs, `**bold**`, `*italic*`,
`inline code`, fenced code, `-`/`1.` lists, `#`-`###` headings, `>` quotes, and
links restricted to `http`/`https`/`mailto`. Tables and nested lists are out of
scope — the rail is too narrow and a hand-rolled parser gets brittle there.

Three things that constrain edits here:

- **Only the assistant branch of `MessageItem` is parsed.** What the user typed is
  echoed back verbatim in the existing `<p>`, not round-tripped through Markdown.
- **`white-space: pre-wrap` is now scoped to `p.message-item__text`.** On the
  parsed container it would double every paragraph gap, since block structure
  comes from the parser. `pre-wrap` survives only inside `<pre>`.
- **Build React elements, never an HTML string.** Assistant replies quote
  user-imported CSV descriptions, so the text is not content we control; React's
  text-node escaping is what makes this safe, and the link-scheme allowlist in
  `markdown.ts` covers the one case escaping doesn't.

`backend/agent.py`'s `SYSTEM_PROMPT` gained one matching clause asking for
Markdown with bold figures and short bullet lists, and explicitly *not* headings
or tables. The renderer is the fix; the prompt is the nudge — the UI handles
whatever the model emits either way.
