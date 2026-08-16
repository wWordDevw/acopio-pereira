FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=/data/acopio.sqlite
RUN mkdir -p /data
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY sql ./sql
EXPOSE 3000
CMD ["node", "src/server.js"]
