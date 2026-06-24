#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo ""
  echo "ERROR: DATABASE_URL is not set on this Railway service."
  echo ""
  echo "Fix: Web service → Variables → New Variable"
  echo "  Name:  DATABASE_URL"
  echo "  Value: \${{MySQL.MYSQL_URL}}   (use 'Add reference' to your MySQL service)"
  echo ""
  exit 1
fi

echo "Applying database schema..."
npx prisma db push

echo "Syncing RBAC permissions..."
node prisma/sync-permissions.js

echo "Starting VCare ERP..."
exec node src/server.js
