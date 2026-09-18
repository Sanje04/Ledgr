#!/usr/bin/env bash
# Deploys Tender to Azure Container Apps on the free Consumption plan.
#
# Bash equivalent of infra/deploy.ps1 -- same steps, same order, same
# idempotency. PowerShell is the primary version because this project is
# developed on Windows; this one exists so the deployment is not Windows-only
# (and so it can run from CI or WSL). Keep the two in sync when changing either.
#
# Configuration comes from infra/deploy.env (copy infra/deploy.env.example).
# Narrative, including the account setup assumed done, is in AZURE_DEPLOYMENT.md.
#
# Usage:
#   ./infra/deploy.sh
#   RECREATE=1 ./infra/deploy.sh   # delete the three apps first, then deploy

set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$INFRA_DIR/deploy.env"
YAML_TEMPLATE="$INFRA_DIR/backend-app.yaml.template"
RECREATE="${RECREATE:-0}"

step() { printf '\n==> %s\n' "$1"; }
fail() { printf 'error: %s\n' "$1" >&2; exit 1; }

[ -f "$ENV_FILE" ] || fail "Missing $ENV_FILE. Copy infra/deploy.env.example to infra/deploy.env and fill it in."

# `set -a` + source, rather than parsing by hand: deploy.env is plain KEY=VALUE
# and this preserves values containing '=' (an Atlas URI's query string does).
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

require() {
    local name="$1" value="${!1:-}"
    [ -n "$value" ] || fail "infra/deploy.env is missing a value for $name."
    # Fail here rather than letting a placeholder surface later as a Mongo auth
    # error on the first chat message.
    case "$value" in
        '<'*|*your-github-username*|*your-ollama-host*|*your-tailnet*)
            fail "infra/deploy.env still has the example placeholder for $name: $value" ;;
    esac
}

for key in RESOURCE_GROUP LOCATION ENVIRONMENT_NAME GHCR_OWNER IMAGE_TAG \
           MONGODB_URI MONGODB_DB_NAME OLLAMA_BASE_URL OLLAMA_MODEL \
           TS_CLIENT_ID TS_CLIENT_SECRET TS_HOSTNAME MAX_HISTORY_TURNS; do
    require "$key"
done

# GHCR paths reject uppercase.
GHCR_OWNER="$(printf '%s' "$GHCR_OWNER" | tr '[:upper:]' '[:lower:]')"
BACKEND_IMAGE="ghcr.io/$GHCR_OWNER/tender-backend:$IMAGE_TAG"
MCP_IMAGE="ghcr.io/$GHCR_OWNER/tender-mcp:$IMAGE_TAG"
FRONTEND_IMAGE="ghcr.io/$GHCR_OWNER/tender-frontend:$IMAGE_TAG"

exists() { az "$@" >/dev/null 2>&1; }

step "Checking the Azure CLI and sign-in state"
command -v az >/dev/null 2>&1 || fail "The Azure CLI is not on PATH. See https://aka.ms/installazurecli"
printf '    Subscription: %s\n' "$(az account show --query name -o tsv)"
az extension add --name containerapp --upgrade --only-show-errors >/dev/null

step "Registering resource providers (no-op if already registered)"
az provider register --namespace Microsoft.App --wait >/dev/null
az provider register --namespace Microsoft.OperationalInsights --wait >/dev/null

step "Resource group: $RESOURCE_GROUP"
if exists group show --name "$RESOURCE_GROUP"; then
    echo "    Already exists."
else
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null
    echo "    Created in $LOCATION."
fi

step "Container Apps environment: $ENVIRONMENT_NAME"
if exists containerapp env show --name "$ENVIRONMENT_NAME" --resource-group "$RESOURCE_GROUP"; then
    echo "    Already exists."
else
    # --logs-destination none keeps this genuinely free: an attached Log Analytics
    # workspace bills for ingestion beyond its allowance. `az containerapp logs
    # show` still streams live logs without one; only historical queries are lost.
    az containerapp env create \
        --name "$ENVIRONMENT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION" \
        --logs-destination none >/dev/null
    echo "    Created."
fi

ENVIRONMENT_ID="$(az containerapp env show --name "$ENVIRONMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" --query id -o tsv)"

if [ "$RECREATE" = "1" ]; then
    step "Deleting existing container apps (RECREATE=1)"
    for app in frontend backend mcp; do
        if exists containerapp show --name "$app" --resource-group "$RESOURCE_GROUP"; then
            az containerapp delete --name "$app" --resource-group "$RESOURCE_GROUP" --yes >/dev/null
            echo "    Deleted $app."
        fi
    done
fi

step "Container app 1/3: mcp"
if exists containerapp show --name mcp --resource-group "$RESOURCE_GROUP"; then
    az containerapp update --name mcp --resource-group "$RESOURCE_GROUP" \
        --image "$MCP_IMAGE" \
        --set-env-vars "MONGODB_URI=secretref:mongodb-uri" "MONGODB_DB_NAME=$MONGODB_DB_NAME" \
                       "MCP_HOST=0.0.0.0" "MCP_PORT=9000" >/dev/null
    echo "    Updated to $IMAGE_TAG."
else
    # MCP_HOST=0.0.0.0, not 127.0.0.1: the backend connects from another
    # container, so a loopback bind refuses every call. Ingress stays internal.
    az containerapp create --name mcp --resource-group "$RESOURCE_GROUP" \
        --environment "$ENVIRONMENT_NAME" \
        --image "$MCP_IMAGE" \
        --ingress internal --target-port 9000 --transport auto \
        --cpu 0.25 --memory 0.5Gi \
        --min-replicas 0 --max-replicas 1 \
        --secrets "mongodb-uri=$MONGODB_URI" \
        --env-vars "MONGODB_URI=secretref:mongodb-uri" "MONGODB_DB_NAME=$MONGODB_DB_NAME" \
                   "MCP_HOST=0.0.0.0" "MCP_PORT=9000" >/dev/null
    echo "    Created."
fi

MCP_FQDN="$(az containerapp show --name mcp --resource-group "$RESOURCE_GROUP" \
    --query 'properties.configuration.ingress.fqdn' -o tsv)"
# Port 80, not 9000: internal ingress listens on 80/443 and forwards to the
# target port.
MCP_SERVER_URL="http://$MCP_FQDN/mcp"
printf '    MCP_SERVER_URL = %s\n' "$MCP_SERVER_URL"

# Exported here, before the renderer below reads them from the environment. The
# values from deploy.env were exported by `set -a`; these three are computed.
export ENVIRONMENT_ID BACKEND_IMAGE MCP_SERVER_URL

step "Container app 2/3: backend (with Tailscale sidecar)"
# Rendered outside the repo and removed on exit: it inlines the Mongo connection
# string and the Tailscale OAuth secret.
RENDERED_YAML="$(mktemp "${TMPDIR:-/tmp}/tender-backend-XXXXXX.yaml")"
cleanup() { rm -f "$RENDERED_YAML"; }
trap cleanup EXIT

# python3 rather than sed: an Atlas password or OAuth secret can contain
# characters sed would treat as delimiters or backreferences, silently corrupting
# the credential instead of failing.
python3 - "$YAML_TEMPLATE" "$RENDERED_YAML" <<'PY'
import os, re, sys

template_path, output_path = sys.argv[1], sys.argv[2]
replacements = {
    "__LOCATION__": os.environ["LOCATION"],
    "__ENVIRONMENT_ID__": os.environ["ENVIRONMENT_ID"],
    "__MONGODB_URI__": os.environ["MONGODB_URI"],
    "__MONGODB_DB_NAME__": os.environ["MONGODB_DB_NAME"],
    "__TS_CLIENT_ID__": os.environ["TS_CLIENT_ID"],
    "__TS_CLIENT_SECRET__": os.environ["TS_CLIENT_SECRET"],
    "__TS_HOSTNAME__": os.environ["TS_HOSTNAME"],
    "__BACKEND_IMAGE__": os.environ["BACKEND_IMAGE"],
    "__OLLAMA_BASE_URL__": os.environ["OLLAMA_BASE_URL"],
    "__OLLAMA_MODEL__": os.environ["OLLAMA_MODEL"],
    "__MAX_HISTORY_TURNS__": os.environ["MAX_HISTORY_TURNS"],
    "__MCP_SERVER_URL__": os.environ["MCP_SERVER_URL"],
    # Wide open for this pass only: the frontend hostname does not exist yet, and
    # CORS cannot name a host that has not been created. Narrowed at the end.
    "__ALLOWED_ORIGINS__": "*",
}

with open(template_path, encoding="utf-8") as fh:
    text = fh.read()
for token, value in replacements.items():
    text = text.replace(token, value)

leftover = re.search(r"__[A-Z_]+__", text)
if leftover:
    sys.exit(f"backend-app.yaml.template still has an unsubstituted placeholder: {leftover.group(0)}")

with open(output_path, "w", encoding="utf-8") as fh:
    fh.write(text)
PY

if exists containerapp show --name backend --resource-group "$RESOURCE_GROUP"; then
    az containerapp update --name backend --resource-group "$RESOURCE_GROUP" --yaml "$RENDERED_YAML" >/dev/null
    echo "    Updated."
else
    az containerapp create --name backend --resource-group "$RESOURCE_GROUP" --yaml "$RENDERED_YAML" >/dev/null
    echo "    Created."
fi
cleanup

BACKEND_FQDN="$(az containerapp show --name backend --resource-group "$RESOURCE_GROUP" \
    --query 'properties.configuration.ingress.fqdn' -o tsv)"
BACKEND_ORIGIN="http://$BACKEND_FQDN"
printf '    BACKEND_ORIGIN = %s\n' "$BACKEND_ORIGIN"

step "Container app 3/3: frontend"
if exists containerapp show --name frontend --resource-group "$RESOURCE_GROUP"; then
    az containerapp update --name frontend --resource-group "$RESOURCE_GROUP" \
        --image "$FRONTEND_IMAGE" \
        --set-env-vars "BACKEND_ORIGIN=$BACKEND_ORIGIN" >/dev/null
    echo "    Updated to $IMAGE_TAG."
else
    # External ingress on 80. Container Apps fronts this with a managed
    # certificate on its own *.azurecontainerapps.io hostname -- the free HTTPS.
    az containerapp create --name frontend --resource-group "$RESOURCE_GROUP" \
        --environment "$ENVIRONMENT_NAME" \
        --image "$FRONTEND_IMAGE" \
        --ingress external --target-port 80 \
        --cpu 0.25 --memory 0.5Gi \
        --min-replicas 0 --max-replicas 1 \
        --env-vars "BACKEND_ORIGIN=$BACKEND_ORIGIN" >/dev/null
    echo "    Created."
fi

FRONTEND_FQDN="$(az containerapp show --name frontend --resource-group "$RESOURCE_GROUP" \
    --query 'properties.configuration.ingress.fqdn' -o tsv)"
PUBLIC_URL="https://$FRONTEND_FQDN"

step "Narrowing the backend's CORS origins to $PUBLIC_URL"
az containerapp update --name backend --resource-group "$RESOURCE_GROUP" \
    --set-env-vars "ALLOWED_ORIGINS=$PUBLIC_URL" >/dev/null
echo "    Done."

cat <<EOF

Deployed.
  Public URL : $PUBLIC_URL
  Backend    : $BACKEND_FQDN (internal)
  MCP server : $MCP_FQDN (internal)

Ollama must be running on the tailnet host for chat to answer:
  $OLLAMA_BASE_URL
Live logs: az containerapp logs show -n backend -g $RESOURCE_GROUP --follow
EOF
