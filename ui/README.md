# AI Chatbot UI

A frontend-only React + TypeScript chatbot interface, built with Vite. Chat history persists to `localStorage`.

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL in your browser.

## Connecting a backend

The app ships with a built-in mock bot so the full chat flow works with no backend at all.

To connect a real backend, copy `.env.example` to `.env` and set `VITE_API_URL` to your chat endpoint:

```bash
VITE_API_URL=https://your-backend.example.com/api/chat
```

The endpoint is expected to accept:

```json
POST <VITE_API_URL>
Content-Type: application/json

{ "message": "user's text" }
```

and respond with:

```json
{ "response": "bot's reply text" }
```

Restart the dev server after changing `.env`. With `VITE_API_URL` unset, `src/services/api.ts` returns mock replies instead of calling the network.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check and build for production
- `npm run preview` — preview the production build locally
- `npm run lint` — type-check only (`tsc --noEmit`)
- `npm test` — run the vitest suite (`InputField`, `api.ts`, `storage.ts`)

## Testing

```bash
npm install
npm test
```

Uses vitest + React Testing Library with a jsdom environment. No backend or network
access is required — `api.ts` tests stub `fetch` directly.

## Project structure

See [specs.md](specs.md) for the original requirements this app was built from.
