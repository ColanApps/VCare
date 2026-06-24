#!/bin/sh
set -e

# Railway injects MYSQL_URL when MySQL is linked — Prisma needs DATABASE_URL
if [ -z "$DATABASE_URL" ] && [ -n "$MYSQL_URL" ]; then
  export DATABASE_URL="$MYSQL_URL"
  echo "Using MYSQL_URL as DATABASE_URL"
elif [ -z "$DATABASE_URL" ] && [ -n "$MYSQLUSER" ] && [ -n "$MYSQLPASSWORD" ] && [ -n "$MYSQLHOST" ]; then
  MYSQLPORT="${MYSQLPORT:-3306}"
  MYSQLDATABASE="${MYSQLDATABASE:-railway}"
  export DATABASE_URL="mysql://${MYSQLUSER}:${MYSQLPASSWORD}@${MYSQLHOST}:${MYSQLPORT}/${MYSQLDATABASE}"
  echo "Built DATABASE_URL from MYSQL* variables"
fi

if [ -z "$DATABASE_URL" ]; then
  echo ""
  echo "ERROR: No database URL on this Railway service."
  echo ""
  echo "Fix (pick one):"
  echo "  A) Link MySQL to this service (Railway adds MYSQL_URL automatically)"
  echo "  B) Variables → DATABASE_URL = \${{MySQL.MYSQL_URL}}"
  echo ""
  exit 1
fi

echo "Applying database schema..."
npx prisma db push

echo "Syncing RBAC permissions..."
node prisma/sync-permissions.js

echo "Starting VCare ERP..."
exec node src/server.js
