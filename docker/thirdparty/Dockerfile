# Local mocks of third-party scripts, with configurable latency and CPU cost.
# Build context: apps/thirdparty.
FROM node:22.23.4-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production PORT=4000
COPY package.json server.mjs scripts.mjs ./

USER node
EXPOSE 4000
HEALTHCHECK --interval=2s --timeout=2s --retries=15 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/ab.js').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.mjs"]
