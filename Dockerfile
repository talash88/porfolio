# Alternative single-container deployment (Railway / Fly.io / any VPS).
# One process serves dist/ + API + WebSocket on PORT (default 3001).
FROM node:24-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Mount a volume at /app/data (or set DB_PATH) — without it community
# messages reset on every container restart.
ENV DB_PATH=/app/data/community.db
VOLUME /app/data

CMD ["node", "server/index.js"]
