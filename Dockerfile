# ── Build ──────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma

# Schema must exist before postinstall runs `prisma generate`
RUN npm ci

COPY src ./src
COPY tailwind.config.js ./

RUN npm run build

# ── Production ───────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma

# Prod deps + Prisma CLI for db push at container start
RUN npm ci --omit=dev --ignore-scripts \
  && npm install prisma@6.9.0 --no-save \
  && npx prisma generate

COPY --from=build /app/src ./src

EXPOSE 3000

# Seed once via Render release command — not on every container start
CMD ["sh", "-c", "npx prisma db push && node prisma/sync-permissions.js && node src/server.js"]
