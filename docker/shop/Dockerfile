# The shop of one git ref: the production build and the server that serves it.
# Build context: apps/shop of that ref, as scripts/build-shop.sh extracts it.
FROM node:22.23.4-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22.23.4-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production PORT=3000 THIRDPARTY_ORIGIN=http://thirdparty:4000
# The server has no dependencies; it imports the catalog from src/products.ts for the
# preload of the LCP image, and Node 22 runs TypeScript without a build step
COPY --from=build /app/package.json /app/server.mjs ./
COPY --from=build /app/src/products.ts ./src/products.ts
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=2s --timeout=2s --retries=15 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.mjs"]
