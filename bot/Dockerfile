FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV SQLITE_PATH=/data/acopio.sqlite
COPY --from=deps /app/api/node_modules ./api/node_modules
COPY api/package.json ./api/
COPY api/src ./api/src
COPY api/sql ./api/sql
COPY bot/package.json ./bot/
COPY bot/src ./bot/src
WORKDIR /app/bot
CMD ["node", "src/server.js"]
