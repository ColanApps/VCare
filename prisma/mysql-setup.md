# MySQL setup (local + Render)

VCare uses **MySQL only** — Prisma for app data and `express_sessions` for login sessions.

## Local development

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```

2. Start MySQL:
   ```bash
   docker compose up -d mysql
   ```

3. Push schema, seed, sync permissions:
   ```bash
   npm install
   npm run db:setup
   ```

4. Run the app:
   ```bash
   npm run dev
   ```

## Render deployment

1. Create a **Web Service** from this repo (or use `render.yaml`).
2. Attach a **MySQL** database (Render MySQL, PlanetScale, Railway, Aiven, etc.) and set `DATABASE_URL` on the web service.
3. Set environment variables:
   - `DATABASE_URL` — `mysql://...` from your provider
   - `SESSION_SECRET` — long random string (Render can generate)
   - `NODE_ENV=production`
   - `SESSION_STORE=mysql` (default)
   - `UPLOAD_DIR=/var/data/uploads` if using a persistent disk (see `render.yaml`)
4. **Build command:** `npm install && npm run build`
5. **Release command** (first deploy and after schema changes):
   ```bash
   npm run db:push && npm run db:seed && npm run db:sync-permissions
   ```
   On subsequent deploys you can use `npm run db:push && npm run db:sync-permissions` only.

6. **Start command:** `npm start`

### SSL (managed MySQL hosts)

If your provider requires TLS, append to `DATABASE_URL`:

```
mysql://user:pass@host:3306/vcare_erp?sslaccept=strict
```

Or set `MYSQL_SSL=true` for the session store. Use `MYSQL_SSL_REJECT_UNAUTHORIZED=false` only if your host uses a self-signed cert.

### Notes for Render

- Render’s managed databases are often **PostgreSQL**; if you use Postgres you would need a different Prisma provider. This project is configured for **MySQL** as requested.
- Use an external MySQL host that allows connections from Render’s outbound IPs, or a Render-compatible MySQL add-on.
- File uploads use `UPLOAD_DIR`; mount a persistent disk on Render or move to S3 for multi-instance deploys.
- Sessions live in the `express_sessions` table in the same database — no separate session store.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run db:push` | Apply Prisma schema to MySQL |
| `npm run db:seed` | Demo users, branches, sample data |
| `npm run db:sync-permissions` | Sync RBAC permission codes |
| `npm run db:setup` | push + seed + sync-permissions |
| `npm run db:studio` | Prisma Studio GUI |
