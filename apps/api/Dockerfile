# pnpm workspace monorepo — build context MUST be the repo root:
#   docker build -f apps/api/Dockerfile -t siders-api .

FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.5.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
EXPOSE 4000

CMD ["pnpm", "--filter", "@siders/api", "start"]
