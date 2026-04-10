#!/usr/bin/env bash
set -e
source .env
PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d "$PG_DATABASE" -f src/db/schema.sql
echo "Schema applied successfully."
