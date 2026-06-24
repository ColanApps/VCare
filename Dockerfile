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

# Prod deps + Prisma CLI (used by Render pre-deploy, not container start)
RUN npm ci --omit=dev --ignore-scripts \
  && npm install prisma@6.9.0 --no-save \
  && npx prisma generate

COPY --from=build /app/src ./src
COPY scripts ./scripts
RUN chmod +x scripts/railway-start.sh

EXPOSE 3000

# Migrations: run via Render pre-deploy command (needs DATABASE_URL there).
# Do not run prisma here — env vars may be missing and it blocks every boot.
CMD ["node", "src/server.js"]
