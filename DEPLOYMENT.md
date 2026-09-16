# Deployment

This covers running Tender via `docker-compose.yml` on a self-hosted machine,
as opposed to the manual `.venv`/`npm run dev` setup in [README.md](README.md#getting-started).
It builds and runs two containers — the FastAPI backend and the built React
frontend served by nginx (which also reverse-proxies `/api/` to the backend,
see `ui/nginx.conf`) — and expects MongoDB and Ollama to keep running outside
Docker, the same external-service roles they already have in local dev (see
`CLAUDE.md`).

## 1. MongoDB: use Atlas, not a container

This compose file does not run MongoDB in a container. Create a free-tier
[MongoDB Atlas](https://www.mongodb.com/atlas) cluster and get its connection
string (`mongodb+srv://<user>:<password>@<cluster>.mongodb.net/...`).

If you'd rather test locally against the MongoDB already running on this
machine instead of setting up Atlas first, you can point `MONGODB_URI` at
`mongodb://host.docker.internal:27017` instead — but note `host.docker.internal`
only reaches services bound beyond `127.0.0.1`; if your local `mongod` only
binds to loopback, this will fail to connect from inside the container even
though it works fine from the host itself.

## 2. Configure the backend

```
cd backend
cp .env.production.example .env.production
```

Fill in `backend/.env.production`:
- `MONGODB_URI` — the Atlas connection string from step 1 (or the local
  fallback above).
- `OLLAMA_BASE_URL` / `OLLAMA_MODEL` — same LAN Ollama instance local dev
  already uses. `host.docker.internal` works out of the box under Docker
  Desktop; on Linux it requires the `extra_hosts: host.docker.internal:host-gateway`
  entry `docker-compose.yml` already has.
- `FORCE_HTTPS` — leave `false`. TLS is expected to terminate in front of
  this deployment (e.g. a Cloudflare Tunnel) and forward plain HTTP to the
  frontend container's port 80; setting this to `true` would make the
  backend redirect its own internal HTTP traffic and break that.
- `MAX_HISTORY_TURNS` — optional, defaults to 5 if left unset. Number of
  recent conversation turns replayed to the model as context on each chat
  call (see `backend/specs.md` Phase 7).

This file is gitignored — never commit it with real credentials.

## 3. Build and run

```
docker compose up -d --build
```

This builds `backend/Dockerfile` (installs `requirements.txt`, runs
`uvicorn` with `--proxy-headers` so the per-client-IP rate limiter in
`main.py` sees real client IPs through nginx rather than nginx's own
container IP) and `ui/Dockerfile` (multi-stage: `npm run build`, then
serves `dist/` from `nginx:alpine`). The frontend is published on host port
80; the backend is only reachable from within the compose network (nginx
proxies to it), not published directly.

## 4. Get your data in

The backend image deliberately does not ship `scripts/seed_transactions.py`
or `backend/data/*.csv` — those are dev/demo-only (see `backend/specs.md`
Phase 5). A fresh deployment starts with no accounts or transactions. Load
real data through the running app itself: open the Transactions panel and
use **Import CSV** to upload a bank-statement export — this is the actual
reason the CSV import feature (Phase 5) exists, not just a local-dev
convenience.

## 5. Put a reverse proxy in front

Point a TLS-terminating reverse proxy of your choice (Cloudflare Tunnel,
Caddy, nginx-with-certbot, etc.) at `http://localhost:80`. This repo doesn't
prescribe or script one — set up whichever you already use for other
self-hosted services on this machine.
