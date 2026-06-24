import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import { config } from '../config/index.js';

const MySQLStore = MySQLStoreFactory(session);

/** Parse mysql://user:pass@host:port/db for express-mysql-session */
export function parseMysqlUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'mysql:') {
    throw new Error(`Expected mysql:// DATABASE_URL, got ${url.protocol}`);
  }

  const options = {
    host: url.hostname,
    port: parseInt(url.port || '3306', 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: parseInt(process.env.SESSION_MAX_AGE_MS || String(24 * 60 * 60 * 1000), 10),
    createDatabaseTable: true,
    schema: {
      tableName: 'express_sessions',
      columnNames: {
        session_id: 'session_id',
        expires: 'expires',
        data: 'data',
      },
    },
  };

  const sslMode = url.searchParams.get('sslmode')
    || url.searchParams.get('sslaccept')
    || url.searchParams.get('ssl');
  if (sslMode === 'require' || sslMode === 'strict' || sslMode === 'true' || process.env.MYSQL_SSL === 'true') {
    options.ssl = {
      rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false',
    };
  }

  return options;
}

export function createSessionStore() {
  const storeType = process.env.SESSION_STORE || 'mysql';

  if (storeType === 'memory') {
    return new session.MemoryStore();
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith('mysql://')) {
    throw new Error('SESSION_STORE=mysql requires DATABASE_URL=mysql://...');
  }

  return new MySQLStore(parseMysqlUrl(databaseUrl));
}

export function getSessionCookieOptions() {
  return {
    maxAge: parseInt(process.env.SESSION_MAX_AGE_MS || String(24 * 60 * 60 * 1000), 10),
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'lax',
  };
}
