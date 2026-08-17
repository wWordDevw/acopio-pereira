FROM node:22-alpine
WORKDIR /app
COPY bot/package.json ./bot/
COPY bot/src ./bot/src
COPY api/src/parse-voz.js api/src/categorias.js ./api/src/
WORKDIR /app/bot
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "src/server.js"]
