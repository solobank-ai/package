FROM node:22-slim

RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/mcp/package.json packages/mcp/
RUN pnpm install --frozen-lockfile

COPY packages/sdk packages/sdk/
COPY packages/mcp packages/mcp/
RUN pnpm --filter @solobank/sdk build && \
    pnpm --filter @solobank/mcp build

ENV SOLOBANK_CONFIG_DIR=/root/.config/solobank
RUN node packages/mcp/scripts/setup-test-wallet.mjs

ENTRYPOINT ["node", "packages/mcp/dist/bin.js"]
