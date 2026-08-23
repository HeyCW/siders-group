# npm workspace monorepo — build context MUST be the repo root:
#   docker build -f apps/api/Dockerfile -t siders-api .

FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm ci

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "start", "-w", "@siders/api"]
