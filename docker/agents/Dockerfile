# Orchestrator and subagents, with the Chromium of Playwright that serves
# Chrome DevTools MCP, WebPerf Snippets and trace-engine-cli.
# Build context: the root of the repo.
FROM node:22.23.4-bookworm-slim

WORKDIR /app

COPY agents/package.json agents/package-lock.json ./
# git reads the diff of the branch in the ci service, from the repo mounted in /repo
RUN npm ci --omit=dev \
 && npx playwright install-deps chromium \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/* /root/.npm

# Chromium goes to the default path, /home/node/.cache/ms-playwright. The stdio client
# of the MCP SDK does not pass PLAYWRIGHT_BROWSERS_PATH to the servers, so a custom
# path would leave them without a browser.
USER node
# Only the full Chromium, without the headless shell: Chrome DevTools MCP runs it by its path,
# and WebPerf Snippets launches it when it is installed, so both measure with the same binary.
RUN npx playwright install --no-shell chromium

COPY --chown=node:node agents/ ./

CMD ["npm", "test"]
