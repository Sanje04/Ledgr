# Azure Deployment (Container Apps, free tier)

Puts Tender on a public HTTPS URL at zero cost, with the LLM still running on your
own machine. This is the third deployment topology in the repo, alongside
[DEPLOYMENT.md](DEPLOYMENT.md) (single-host `docker compose`) and
[KUBERNETES_DEPLOYMENT.md](KUBERNETES_DEPLOYMENT.md) (a k3s plan, unbuilt). Unlike
that one, everything here exists and runs.

The same three containers as compose — `backend`, `mcp`, `frontend` — become three
Azure Container Apps, plus a Tailscale sidecar that gives the backend a private
route to the Ollama instance on your home machine.

```
                    Internet (HTTPS, Container Apps managed certificate)
                                      │
        ┌─────────────────────────────▼──────────────────────────────┐
        │  Azure Container Apps environment (Consumption, free grant) │
        │                                                             │
        │   frontend (nginx)  ──/api/──▶  backend (FastAPI) ──▶ mcp   │
        │   external ingress             internal ingress   internal  │
        │                                     │                       │
        │                          ┌──────────┴──────────┐            │
        │                          │ tailscale sidecar    │           │
        │                          │ same replica,        │           │
        │                          │ HTTP proxy on :1055  │           │
        └──────────────────────────┴──────────┬───────────┴───────────┘
                                              │ tailnet (WireGuard)
                   ┌──────────────────────────┴────┐
                   │  Your machine: Ollama :11434   │
                   └────────────────────────────────┘
                              │
                   MongoDB Atlas M0 (free), reached by backend and mcp
```

## What it costs

Nothing, provided you stay inside these:

| Resource | Free allowance | How this deployment stays inside it |
|---|---|---|
| Container Apps (Consumption) | 180,000 vCPU-s + 360,000 GiB-s + 2M requests / month | All three apps run `minReplicas=0`, so an idle deployment consumes none of it |
| Log Analytics | billed per GB ingested | Not created at all: the environment uses `--logs-destination none` |
| Container registry | — | Public GHCR packages, not Azure Container Registry (whose cheapest tier is not free) |
| MongoDB | Atlas M0, free forever | One M0 cluster |
| Tailscale | free plan, 3 users / 100 devices | Two devices: your Ollama host and an ephemeral node per backend replica |
| TLS certificate | — | Container Apps' managed certificate on its own `*.azurecontainerapps.io` hostname, so no domain purchase |

The cost of `minReplicas=0` is a cold start on the first request after idle. Chat is
already a multi-second operation against a local LLM, so this is barely noticeable
in practice.

## Before you start

You need free accounts on [Tailscale](https://tailscale.com),
[MongoDB Atlas](https://www.mongodb.com/atlas), and
[Azure](https://azure.microsoft.com/free/), plus the
[Azure CLI](https://aka.ms/installazurecli) and Docker locally. The Azure free
account asks for a card for identity verification; the Consumption-plan grant used
here is a permanent monthly allowance, not trial credit, so it does not lapse after
30 days.

---

## Step 1 — Tailscale: a private route to your Ollama host

The problem this solves: Ollama runs on your machine, which has no public address,
and exposing it to the internet would let anyone use your GPU. A tailnet gives the
Azure-side container a private path to it instead.

The mechanism is worth understanding because it needed no application code.
`agent.py` calls Ollama through a bare `httpx.AsyncClient()`, and httpx honours
proxy environment variables by default. So a `tailscaled` sidecar exposing an
outbound HTTP proxy, plus `HTTP_PROXY` on the backend container, is enough —
`agent.py` never learns a tunnel exists. `tailscaled` also resolves the MagicDNS
name itself, so the backend container never has to resolve a `.ts.net` address.

1. **Install Tailscale on the Ollama machine** and sign in. Note the machine name
   it appears under in the admin console.
2. **Enable MagicDNS** (admin console → DNS). This gives you a stable
   `<machine>.<tailnet>.ts.net` name instead of an IP that can change.
3. **Confirm Ollama is reachable on the tailnet, not just on loopback.** By default
   Ollama binds `127.0.0.1`, which no tunnel can reach. Set
   `OLLAMA_HOST=0.0.0.0` for the Ollama service and restart it.
4. **Add a tag owner.** In the admin console's ACL editor, add:
   ```jsonc
   "tagOwners": { "tag:tender-backend": ["autogroup:admin"] }
   ```
   Registration fails with a permissions error without this.
5. **Create an OAuth client** (Settings → OAuth clients) with the `auth_keys` write
   scope and the `tag:tender-backend` tag. Keep the client ID and secret.

   An OAuth client rather than a plain auth key for two reasons: auth keys expire
   within 90 days, which would take the deployment down silently months later; and
   nodes registered with an OAuth secret are ephemeral by default, so the routine
   scale-to-zero restarts do not accumulate dead nodes in your tailnet.

**Prove it locally before trusting it in the cloud.** `docker-compose.yml` carries
the same sidecar under an opt-in profile for exactly this:

```powershell
# in backend/.env.production, uncomment and fill in:
#   OLLAMA_BASE_URL=http://<your-ollama-host>.<your-tailnet>.ts.net:11434
#   HTTP_PROXY=http://tailscale:1055
#   NO_PROXY=mcp,localhost,127.0.0.1,.azurecontainerapps.io
#   TS_CLIENT_ID=...
#   TS_CLIENT_SECRET=...
docker compose --profile tailnet up -d --build
docker compose logs tailscale        # should report a successful login
Invoke-WebRequest http://localhost/api/chat -Method POST `
  -ContentType 'application/json' -Body '{"message":"hello"}'
```

A real reply means Ollama was reached over the tailnet rather than over the LAN.

`NO_PROXY` is not optional. Without it, the same `HTTP_PROXY` swallows the
backend's MCP calls — also plain HTTP — and sends them down the tunnel looking for
a tool server that is not there. Tool discovery fails soft (chat answers, minus
tools, see `backend/specs.md` Phase 8), so this misconfigures silently rather than
loudly. MongoDB is unaffected either way: Motor does not read proxy variables.

One difference between the two topologies, and it is the only one: under compose the
sidecar is a separate container reached by service name (`http://tailscale:1055`,
bound `0.0.0.0`), while on Container Apps it shares the replica's network namespace
and is reached on `http://localhost:1055` (bound `127.0.0.1`).

## Step 2 — MongoDB Atlas M0

1. Create a free **M0** cluster. Choose **Azure** as the provider and the same
   region you will use in step 4 — every chat turn makes several round trips to
   Mongo, so a mismatched pair is felt directly in response time.
2. Create a database user, and under Network Access allow the addresses the
   deployment will connect from.
3. Take the `mongodb+srv://...` connection string.

Atlas rather than Cosmos DB's Mongo API, despite Cosmos being the Azure-native
option: `db.ensure_indexes()` creates a text index on `messages.content`, which the
`search_history` tool depends on, and Cosmos' text-index support is partial. Atlas
M0 hosted in an Azure region is free too, and is known to support it.

Verify locally before deploying, by pointing `backend/.env` at the Atlas string and
asking the assistant something like "what did we talk about earlier?" — that
exercises the text index through the real tool path.

## Step 3 — Publish the images to GHCR

Push to `master`. `.github/workflows/ci.yml` runs both test suites, then builds and
pushes three images tagged with the commit SHA and `latest`:

```
ghcr.io/<you>/tender-backend
ghcr.io/<you>/tender-mcp
ghcr.io/<you>/tender-frontend
```

**Make all three packages public** (GitHub → your profile → Packages → each
package → Package settings → Change visibility). Container Apps then pulls with no
registry credential to store or rotate. Private packages would work but need a pull
secret on every app.

## Step 4 — Deploy

```powershell
cp infra/deploy.env.example infra/deploy.env
# fill in: resource group, region, GHCR owner, Atlas URI, Ollama tailnet URL,
#          Tailscale OAuth client id/secret
az login
.\infra\deploy.ps1
```

`infra/deploy.sh` is the bash equivalent. Both are idempotent — every step checks
for an existing resource first — so re-running to pick up a new image tag is
normal. `infra/deploy.env` holds real credentials and is gitignored.

The script creates a resource group, a Consumption-plan environment, and then the
three apps in dependency order, because each needs the previous one's hostname:

1. **`mcp`** — internal ingress, target port 9000, `MCP_HOST=0.0.0.0` (a loopback
   bind would refuse the backend's calls), Mongo URI as a secret.
2. **`backend`** — internal ingress, target port 8000, defined from
   `infra/backend-app.yaml.template` rather than CLI flags because it is the one app
   with two containers, which the flag interface cannot express. Carries the
   Tailscale sidecar, `HTTP_PROXY`/`NO_PROXY`, `FORCE_HTTPS=false`, and a liveness
   probe on `/api/health`.
3. **`frontend`** — external ingress on 80, with `BACKEND_ORIGIN` set to the
   backend's internal FQDN. This is the only publicly reachable app.

Then it narrows the backend's `ALLOWED_ORIGINS` from `*` to the frontend's public
URL. That has to happen last: CORS cannot name a hostname that does not exist yet.

It prints the public URL when it finishes. That is the resume link.

A few decisions embedded in the scripts, so they are not mysteries later:

- **`--logs-destination none`.** No Log Analytics workspace, so no ingestion bill.
  `az containerapp logs show -n backend -g <rg> --follow` still streams live logs;
  only historical queries are unavailable.
- **`maxReplicas=1` on the backend.** `main.py`'s rate limiter is a module-level
  dict, so it is per-replica state. A second replica would silently double the
  effective limit rather than sharing it.
- **Internal ingress listens on port 80**, not the target port. `MCP_SERVER_URL` is
  therefore `http://mcp.internal.<env-domain>/mcp` with no `:9000`.
- **`FORCE_HTTPS=false`.** Ingress terminates TLS and forwards plain HTTP inside the
  environment; redirecting would loop the platform's own traffic. Same reasoning as
  the compose deployment behind a tunnel.
- **`allowInsecure: true` on the internal apps** means plain HTTP *within* the
  environment only. Public traffic is HTTPS-only, terminated at the frontend's
  ingress.

## Step 5 — Get your data in

A fresh deployment has no accounts or transactions: the backend image deliberately
ships neither `scripts/seed_transactions.py` nor `backend/data/*.csv` (see
`backend/specs.md` Phase 5). Load data through the running app — open it and use
**Import CSV** with a bank-statement export. This is the reason that feature exists.

## Step 6 — Make merges deploy themselves

The `deploy` job in `ci.yml` rolls all three apps onto each new commit's images. It
authenticates with GitHub Actions OIDC, so no long-lived Azure credential is stored
in the repo. To enable it:

1. Register an Entra ID app registration and grant its service principal
   **Contributor** on the resource group.
2. Add a **federated credential** on that app registration for this repository and
   the `master` branch.
3. Add repository **secrets** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
   `AZURE_SUBSCRIPTION_ID`, and a repository **variable** `AZURE_RESOURCE_GROUP`.

The job's `if` tests the variable, not a secret, because secrets are not readable in
an `if` expression — so until you set it the job is skipped rather than failing every
push. It deploys the SHA tag, never `latest`: Container Apps creates a new revision
only when the image reference changes, so pushing `latest` would be a no-op that
looks like a successful deploy.

---

## Operating it

**Cold starts and the first message.** With `mcp` scaled to zero, the first chat
request after an idle period may find tool discovery still cold — `mcp_client`'s
discovery budget is 10s. That request answers without tools; the next one picks
them up, because discovery retries per request. This is the documented fail-soft
path, not a fault. If it bothers you, `minReplicas=1` on `mcp` fixes it and costs
roughly 650,000 vCPU-seconds a month against a 180,000 grant — i.e. it stops being
free.

**"The agent stopped using its tools."** Almost always `mcp` being unreachable
rather than a prompt regression, exactly as in local dev. Check
`az containerapp logs show -n mcp -g <rg>`.

**Chat returns 502.** Reserved for Ollama specifically (see CLAUDE.md's two-error-
paths constraint). Check your machine is awake, Ollama is running, it is bound
beyond loopback, and the tailnet node is online.

**Chat answers but nothing persists.** Atlas connectivity. Auto-save and history
fetch both fail soft by design, so this degrades quietly.

## Known tradeoffs

**The live URL is dark whenever your machine or Ollama is off.** This is the
accepted cost of keeping inference free and self-hosted. If a recruiter clicking a
dead link is unacceptable, the fix already has a spec:
[`docs/specs.md`](docs/specs.md) Phase 9 makes the provider pluggable, and pointing
it at Azure AI Foundry would remove the home-machine dependency entirely.

**`POST /api/transactions/import` is unauthenticated, on a public URL.** Anyone with
the link can wipe and replace the transaction data, because import is a full
replace (`backend/specs.md` Phase 5). This deployment was scoped to minimum
hardening — a health endpoint, narrowed CORS, the existing per-IP rate limiter — and
a shared-secret gate on that endpoint was consciously left out. Worth revisiting
before the link is shared widely.

**The rate limiter is per-replica and in-memory.** Fine at `maxReplicas=1`, and it
resets on every cold start. It is abuse mitigation, not a quota.

## Teardown

```powershell
az group delete --name <your-resource-group> --yes
```

Removes every Azure resource. The Atlas cluster and the Tailscale tag/OAuth client
are separate; delete those in their own consoles.
