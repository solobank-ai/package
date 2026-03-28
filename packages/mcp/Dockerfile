FROM node:22-slim

RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/banka/package.json packages/banka/
COPY packages/sdk/package.json packages/sdk/
COPY packages/mcp/package.json packages/mcp/
RUN pnpm install --frozen-lockfile

COPY packages/banka packages/banka/
COPY packages/sdk packages/sdk/
COPY packages/mcp packages/mcp/
RUN pnpm --filter banka build && \
    pnpm --filter @banka/sdk build && \
    pnpm --filter @banka/mcp build

ENV BANKA_CONFIG_DIR=/root/.config/banka
RUN node packages/mcp/scripts/setup-test-wallet.mjs

ENTRYPOINT ["node", "packages/mcp/dist/bin.js"]
