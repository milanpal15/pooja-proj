# Build context: the backend/ folder (docker compose does this). NOT verified: Docker is not installed on the author's machine.
# `npm ci` needs every workspace's package.json (the lockfile covers all of them), hence the COPY lines below.
FROM node:20.19.4-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/
COPY services/engagement/package.json services/engagement/
COPY services/identity/package.json services/identity/
COPY services/catalog/package.json services/catalog/
COPY services/wallet/package.json services/wallet/
COPY services/orders/package.json services/orders/
COPY services/calls/package.json services/calls/
COPY services/events/package.json services/events/
COPY bff/mobile/package.json bff/mobile/
COPY bff/admin/package.json bff/admin/
RUN npm ci --omit=dev --ignore-scripts
COPY packages/common packages/common
COPY services/calls services/calls
ENV NODE_ENV=production
WORKDIR /app/services/calls
CMD ["node", "src/server.js"]
