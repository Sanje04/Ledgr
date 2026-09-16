FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Same-origin as the frontend: nginx.conf proxies /api/ to the backend service,
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
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
