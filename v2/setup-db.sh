#!/usr/bin/env bash
set -e
source .env
PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d "$PG_DATABASE" -f src/db/schema.sql
echo "Schema applied successfully."

# Insert a default data_mode row so the dashboard banner is meaningful before the first sync/seed
PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "${PG_PORT:-5432}" -U "$PG_USER" -d "$PG_DATABASE" -c \
  "INSERT INTO data_mode (mode, source_label) SELECT 'seed', 'No data loaded yet — run: npm run seed' WHERE NOT EXISTS (SELECT 1 FROM data_mode);"
echo "Default data mode banner set."
