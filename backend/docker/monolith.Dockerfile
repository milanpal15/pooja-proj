# The existing pooja-api, unchanged. Build context: the repo root. NOT verified (no Docker on the author's machine).
FROM node:20.19.4-alpine
WORKDIR /app
COPY pooja-api/package.json pooja-api/package-lock.json ./
RUN npm ci --omit=dev
COPY pooja-api/ ./
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
