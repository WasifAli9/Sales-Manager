#!/bin/sh
set -eu

POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-salesmanager}"

echo "Waiting for Postgres at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
i=0
until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "Postgres did not become ready in time"
    exit 1
  fi
  sleep 2
done

STORAGE_ROOT="${STORAGE_ROOT:-/data}"
mkdir -p \
  "${STORAGE_ROOT}/salesmanager/private" \
  "${STORAGE_ROOT}/salesmanager/public"

if [ "${SKIP_SCHEMA_PUSH:-false}" != "true" ]; then
  echo "Syncing database schema (drizzle-kit push)..."
  cd /app
  CI=true pnpm --filter @workspace/db run push:ci
fi

echo "Starting Sales Manager API..."
cd /app
exec node --enable-source-maps ./artifacts/api-server/dist/index.mjs
