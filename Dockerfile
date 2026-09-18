# All-in-one image: the React frontend, the FastAPI backend, and the MCP tool
# server in a single container, for deploying to Azure as one unit.
#
# Build from the REPOSITORY ROOT, because it needs both ui/ and backend/:
#   docker build -t tender .
#
# This is a deliberate alternative to, not a replacement for, the three-image
# split (backend/Dockerfile, backend/Dockerfile.mcp, ui/Dockerfile) that
# docker-compose.yml and AZURE_DEPLOYMENT.md use. The tradeoff:
#
#   + One image, one deployment, one hostname, one thing to configure. On Azure
#     it drops in as a single Container App or App Service container.
#   + The three processes talk over loopback, so there is no cross-container DNS
#     to resolve, no internal ingress, and no service-discovery configuration.
#   - The processes scale together. The MCP tool server cannot idle at zero while
#     the API stays warm, and one busy component sizes the whole replica.
#   - It undoes the protocol boundary the MCP split exists to demonstrate
#     (backend/specs.md Phase 8). The boundary is still real -- the backend
#     speaks MCP over HTTP to a separate process, not to a function table -- but
#     they now share a lifecycle and a failure domain.
#
# Ollama and MongoDB stay external, exactly as in every other topology here.

# --- Stage 1: build the frontend ------------------------------------------
FROM node:20-slim AS ui-build

WORKDIR /ui

# Copied before the source so a source-only change does not reinstall
# dependencies. npm install rather than npm ci for the reason documented in
# .github/workflows/ci.yml: this lockfile was generated on Windows and omits
# other platforms' optional esbuild binaries, so npm ci fails on Linux.
COPY ui/package.json ui/package-lock.json ./
RUN npm install

COPY ui/ ./

# Relative, same-origin URLs: nginx in the final stage proxies /api/ to the
# backend on loopback, so no hostname can or should be baked into the bundle.
# Both must be set together (see CLAUDE.md) or the dashboard silently falls back
# to mock data while chat talks to the real backend.
ARG VITE_API_URL=/api/chat
ARG VITE_TRANSACTIONS_API_URL=/api/transactions
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_TRANSACTIONS_API_URL=$VITE_TRANSACTIONS_API_URL
RUN npm run build

# --- Stage 2: runtime -----------------------------------------------------
# Python base rather than an nginx base: the two Python processes need a full
# interpreter and pinned wheels, whereas nginx is one apt package away.
FROM python:3.11-slim

# nginx serves the frontend and proxies the API; supervisor owns the three
# processes; curl is only for the HEALTHCHECK below. --no-install-recommends and
# the rm keep this from roughly doubling the layer.
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx supervisor curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies before source, again for layer caching. requirements.txt is the
# backend's, and it is shared by both Python processes on purpose -- mcp_server.py
# and main.py import the same db.py and the same pinned mcp/starlette line (see
# the comment block in requirements.txt about why those pins move together).
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# All five backend modules, because this image runs BOTH Python processes:
#   main.py, agent.py, db.py, mcp_client.py  -- the API
#   mcp_server.py, db.py                     -- the tool server
# The split images each copy a subset; here the union is required. Keep this in
# sync when adding a backend module -- a missing one fails at import of
# main:app, not at first use.
COPY backend/main.py backend/agent.py backend/db.py backend/mcp_client.py backend/mcp_server.py ./

# Deliberately absent: backend/scripts/ and backend/data/ (demo-only, see
# backend/specs.md Phase 5) and backend/tests/. A deployment loads real data
# through the app's CSV import.

COPY --from=ui-build /ui/dist /usr/share/nginx/html

# Debian's nginx.conf includes both conf.d/ and sites-enabled/, and the packaged
# default site also listens on 80 -- leaving it in place makes which server block
# wins depend on include order.
COPY deploy/nginx.conf /etc/nginx/conf.d/tender.conf
RUN rm -f /etc/nginx/sites-enabled/default

COPY deploy/supervisord.conf /etc/supervisor/conf.d/tender.conf

# Defaults that describe this image's internal topology, so a deployment only has
# to supply real secrets (MONGODB_URI) and the Ollama address. All are
# overridable at run time.
#
# 127.0.0.1 for both halves of the MCP connection: the tool server and its client
# are in this container, so binding or dialling anything wider would expose a
# tool endpoint that must not be reachable -- it has no authentication of its own,
# by design (per-tool RBAC is an unbuilt roadmap item).
ENV MCP_HOST=127.0.0.1 \
    MCP_PORT=9000 \
    MCP_SERVER_URL=http://127.0.0.1:9000/mcp \
    MONGODB_DB_NAME=ag_ai \
    # Fail fast on an unreachable database instead of hanging for the driver's
    # 30s default, which reads as a hang rather than an error.
    MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000 \
    MAX_HISTORY_TURNS=5 \
    # False because TLS terminates at the platform's ingress and plain HTTP is
    # forwarded here; true would make the app redirect the platform's own traffic.
    FORCE_HTTPS=false \
    # Wide open by default so the image runs anywhere; a real deployment should
    # set this to its own public hostname. Browser traffic is same-origin through
    # nginx regardless, so this is defence in depth rather than load-bearing.
    ALLOWED_ORIGINS=* \
    PYTHONUNBUFFERED=1

# The only exposed port. uvicorn (8000) and the MCP server (9000) bind loopback
# and are unreachable from outside the container.
EXPOSE 80

# Hits the dependency-free endpoint on purpose: /api/health touches no MongoDB,
# Ollama, or MCP server, so this reports whether the container is serving rather
# than whether every external dependency is up. It does exercise the real path
# through nginx to uvicorn, so it catches either process being dead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1/api/health || exit 1

# Runs as root because nginx binds port 80. Switching to a non-root user means
# moving nginx to a port above 1024 and telling the platform about it; worth
# doing, not done here.
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
