## Role

You are an expert UI developer building a simple chatbot interface which reads user prompts and connects to a backend API.

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