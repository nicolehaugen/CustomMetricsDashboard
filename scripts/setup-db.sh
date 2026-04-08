#!/bin/bash
# Creates the dora_metrics database and runs schema
set -e
DB_NAME="${PG_DATABASE:-dora_metrics}"
createdb "$DB_NAME" 2>/dev/null || echo "Database '$DB_NAME' already exists"
psql -d "$DB_NAME" -f src/db/schema.sql
echo "Schema applied successfully to '$DB_NAME'"
