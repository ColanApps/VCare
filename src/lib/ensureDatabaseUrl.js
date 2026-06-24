/**
 * Railway links MySQL as MYSQL_URL, not DATABASE_URL. Prisma requires DATABASE_URL.
 * Import this module before PrismaClient or `prisma` CLI child processes in Node.
 */
function buildMysqlUrlFromParts() {
  const user = process.env.MYSQLUSER || process.env.MYSQL_USER;
  const password = process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD;
  const host = process.env.MYSQLHOST || process.env.MYSQL_HOST;
  const port = process.env.MYSQLPORT || process.env.MYSQL_PORT || '3306';
  const database = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'railway';

  if (!user || !password || !host) return null;

  const userEnc = encodeURIComponent(user);
  const passEnc = encodeURIComponent(password);
  return `mysql://${userEnc}:${passEnc}@${host}:${port}/${database}`;
}

export function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const fallback =
    process.env.MYSQL_URL
    || process.env.MYSQL_PUBLIC_URL
    || process.env.DATABASE_PRIVATE_URL
    || buildMysqlUrlFromParts();

  if (fallback) {
    process.env.DATABASE_URL = fallback;
    return fallback;
  }

  console.error('');
  console.error('FATAL: No database URL found.');
  console.error('Set DATABASE_URL, or link Railway MySQL (MYSQL_URL / MYSQL* variables).');
  console.error('');
  process.exit(1);
}

ensureDatabaseUrl();
