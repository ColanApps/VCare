#!/bin/sh
set -e

echo "=== VCare Railway startup ==="

# Railway provides MYSQL_URL; Prisma CLI only reads DATABASE_URL
if [ -n "$DATABASE_URL" ]; then
  echo "DATABASE_URL is set"
elif [ -n "$MYSQL_URL" ]; then
  export DATABASE_URL="$MYSQL_URL"
  echo "Copied MYSQL_URL → DATABASE_URL"
elif [ -n "$MYSQLUSER" ] && [ -n "$MYSQLPASSWORD" ] && [ -n "$MYSQLHOST" ]; then
  MYSQLPORT="${MYSQLPORT:-3306}"
  MYSQLDATABASE="${MYSQLDATABASE:-railway}"
  export DATABASE_URL="mysql://${MYSQLUSER}:${MYSQLPASSWORD}@${MYSQLHOST}:${MYSQLPORT}/${MYSQLDATABASE}"
  echo "Built DATABASE_URL from MYSQL* variables"
else
  echo ""
  echo "ERROR: No database URL found on this service."
  echo "On vcare-erp → Variables, add DATABASE_URL with your full mysql://... string"
  echo "(copy the same value you used for MYSQL_URL)"
  echo ""
  exit 1
fi

# Prisma CLI loads .env from cwd — write it so db push always sees DATABASE_URL
printf 'DATABASE_URL=%s\n' "$DATABASE_URL" > .env

echo "Applying database schema..."
npx prisma db push

echo "Seeding demo users and base data..."
node prisma/seed.js

echo "Syncing RBAC permissions..."
node prisma/sync-permissions.js

echo "Starting VCare ERP..."
exec node src/server.js
