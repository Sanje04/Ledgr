FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Same-origin as the frontend: nginx proxies /api/ to the backend service,
# so the built bundle just needs relative URLs, not a real domain baked in.
# Both must be set together (see CLAUDE.md) or the Transactions panel
# silently falls back to mock data while chat talks to the real backend.
ARG VITE_API_URL=/api/chat
ARG VITE_TRANSACTIONS_API_URL=/api/transactions
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_TRANSACTIONS_API_URL=$VITE_TRANSACTIONS_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# /etc/nginx/templates/, not conf.d/, so nginx:alpine's entrypoint renders it
# with envsubst at container start -- the backend's address differs per
# deployment target and cannot be baked in (see nginx.conf.template's header).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Opts into the base image's own /docker-entrypoint.d/15-local-resolvers.envsh,
# which is otherwise a no-op. It exports NGINX_LOCAL_RESOLVERS from
# /etc/resolv.conf, giving the template a correct `resolver` value on any
# platform -- Docker's embedded DNS locally, Azure's inside a Container App --
# without hardcoding either. It also brackets IPv6 addresses and handles
# multiple nameservers, which a hand-rolled version of this would get wrong.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

# Restrict substitution to these two names. Without a filter the entrypoint
# substitutes every variable present in the environment, so an unrelated env var
# that happens to share a name with an nginx runtime variable would be silently
# blanked out of the config.
ENV NGINX_ENVSUBST_FILTER="^(BACKEND_ORIGIN|NGINX_LOCAL_RESOLVERS)$"

# Compose-friendly default; overridden per environment (Azure sets the backend
# container app's internal FQDN, which listens on ingress port 80, not 8000).
ENV BACKEND_ORIGIN="http://backend:8000"

EXPOSE 80
