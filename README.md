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

## Deploy (Railway) — recommended

1. **New Project** → deploy from GitHub → `ColanApps/VCare`.
2. **Add MySQL** in the same project (Database → MySQL).
3. On the **web service** → link the MySQL service (Railway injects `MYSQL_URL`).
   Optional: `DATABASE_URL` = **`${{MySQL.MYSQL_URL}}`** — the app auto-uses `MYSQL_URL` if `DATABASE_URL` is unset.
   - `SESSION_SECRET` = long random string
   - `NODE_ENV` = `production`
   - `SESSION_STORE` = `mysql`
4. Deploy — [`railway.toml`](railway.toml) runs schema push then starts the server.
5. **First deploy only** — Railway shell: `node prisma/seed.js`  
   Demo login: `admin@vcare.com` / `VCare@123`

Do **not** put database passwords in the repo. Use Railway variable references.

## Deploy (Render)

1. Create a **Web Service** → **Docker** → repo [ColanApps/VCare](https://github.com/ColanApps/VCare).
2. Create or link a **MySQL** database and add **`DATABASE_URL`** to the web service environment (required).
3. Set **Pre-Deploy Command**:
   ```bash
   npx prisma db push && node prisma/seed.js && node prisma/sync-permissions.js
   ```
   On later deploys you can drop `node prisma/seed.js` if data already exists.
4. Set `SESSION_SECRET` (long random string) and `NODE_ENV=production`.
5. Deploy — the Docker image only starts the Node server; schema runs in pre-deploy when `DATABASE_URL` is available.

Or use the included [`render.yaml`](render.yaml) blueprint.

See [prisma/mysql-setup.md](prisma/mysql-setup.md) for more detail.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm start` | Production server |
| `npm run build` | Build CSS + Prisma client |
| `npm run db:setup` | Push schema, seed, sync permissions |
| `npm run smoke` | HTTP workflow smoke test |
