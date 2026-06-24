# VCare ERP

Clinic Process Enterprise — server-rendered ERP for clinic operations (appointments, clinical workflow, billing, inventory, finance, and role-based portals).

## Stack

- Node.js, Express 5, Nunjucks
- Prisma + **MySQL**
- Tailwind CSS

## Quick start

```bash
cp .env.example .env
docker compose up -d mysql
npm install
npm run db:setup
npm run dev
```

Open http://localhost:3000 — demo login: `admin@vcare.com` / `VCare@123`

## Deploy (Render)

See [prisma/mysql-setup.md](prisma/mysql-setup.md) and [render.yaml](render.yaml).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm start` | Production server |
| `npm run build` | Build CSS + Prisma client |
| `npm run db:setup` | Push schema, seed, sync permissions |
| `npm run smoke` | HTTP workflow smoke test |
