---
name: schema-drift-apply
description: "**WORKFLOW SKILL** — Apply discovered API drift columns to src/db/schema.sql, rebuild, and relaunch the app. User provides the table name and new field names; skill infers PostgreSQL types from naming conventions, patches schema.sql, rebuilds Docker, and verifies columns exist. WHEN: \"update schema for drift\", \"add drift columns\", \"schema has new fields\", \"API added new columns\", \"apply drift to schema\", \"new API fields discovered\", \"sync found new columns\". INVOKES: file editing, docker-compose, psql. FOR SINGLE OPERATIONS: manually add columns to schema.sql."
---

# Schema Drift Apply

Commit discovered API drift columns into `src/db/schema.sql` so fresh deployments include them without waiting for the first sync's `applyDrift()` call.

## Inputs (from user prompt)

1. **Table name** — which table has drift (e.g., `copilot_enterprise_daily`, `copilot_user_daily`)
2. **Field names** — the new columns discovered by `applyDrift()` or observed in API responses
3. **Sample values** (optional) — helps confirm type inference when naming convention is ambiguous

## Step 1 — Infer PostgreSQL column types

Use naming conventions matching the patterns in `src/db/insert.ts inferType()`:

| Field name pattern | PostgreSQL type | Examples |
|---|---|---|
| `*_users`, `*_count`, `*_sum`, `*_id` (numeric) | `BIGINT` | `daily_active_users`, `code_generation_activity_count` |
| `used_*` | `BOOLEAN` | `used_agent`, `used_cli` |
| `*_at` | `TIMESTAMPTZ` | `created_at`, `last_activity_at` |
| `*_date` | `DATE` | `pending_cancellation_date` |
| `totals_by_*`, known nested objects | `JSONB` | `totals_by_feature`, `pull_requests` |
| Everything else (names, labels, states) | `TEXT` | `plan_type`, `environment` |

If the user provides sample values, use runtime type:
- `boolean` → `BOOLEAN`
- integer → `BIGINT`
- float → `NUMERIC`
- `string` → `TEXT`
- `object` or `array` → `JSONB`

If ambiguous, ask the user.

## Step 2 — Read current schema.sql

Read `src/db/schema.sql` and locate the `CREATE TABLE IF NOT EXISTS <table>` block. Confirm the fields do not already exist (idempotent — skip any that are already defined).

## Step 3 — Patch schema.sql

Insert new columns into the `CREATE TABLE` block:
- Place them **after** the last existing column of the same type/category
- Match the existing alignment style (column name padded to ~40 chars, then type)
- Add a date comment above the group:

```sql
  monthly_active_users             BIGINT,
  -- drift: added YYYY-MM-DD
  daily_active_copilot_cloud_agent_users   BIGINT,
  weekly_active_copilot_cloud_agent_users  BIGINT,
  monthly_active_copilot_cloud_agent_users BIGINT,
```

## Step 4 — Rebuild and relaunch (REQUIRED)

`schema.sql` is **baked into the sync-server Docker image** via `COPY . .` in `Dockerfile`. A plain `docker-compose restart` reuses the old image and your edits will not take effect — both the database init script and the runtime `schema_columns` indexer will still see the old file. Always use `--build`:

```bash
docker-compose up -d --build sync-server
```

If the postgres volume is fresh (no existing data), bring the whole stack down and back up so the init script reruns with the new schema:

```bash
docker-compose down
docker-compose up -d --build
```

Wait for all containers to be healthy.

## Step 5 — Verify columns exist

```bash
docker exec postgres-1 psql -U postgres -d metrics \
  -c "\d <table>" | Select-String "<new_column_name>"
```

Run this for each new column. All must appear in the output.

Then confirm the runtime `schema_columns` index picked up the edit (this is what the **Drift columns not yet in schema.sql** panel on the Overview dashboard reads from):

```bash
docker exec postgres-1 psql -U postgres -d metrics \
  -c "SELECT column_name FROM schema_columns WHERE table_name = '<table>' AND column_name = '<new_column_name>';"
```

If the row is missing, the sync-server was not rebuilt — repeat Step 4.

## Step 6 — Run validation

```bash
npm test && npm run lint && npm run build
```

All three must pass before committing. Schema.sql changes are SQL-only and don't affect TypeScript compilation, but this confirms nothing else broke.

## Step 7 — Hand off (optional)

If the user wants the new columns surfaced in a dashboard, the next step is the [`drift-to-metric-plan`](../drift-to-metric-plan/SKILL.md) skill, which profiles the column and drafts a panel proposal. This skill does **not** auto-invoke it.

## Rules

- **Additive only** — never remove or rename columns. Drift is always forward.
- **Column names = API field names** — the project uses source-faithful naming. Do not rename, alias, or transform field names.
- **Skip duplicates** — if a field is already in schema.sql, skip it silently.
- **No seed generator** — this project does not have a separate seed generator file. Seed data comes from the sync pipeline or manual SQL inserts. Do not look for or create seed generator changes.
- **Default to `src/db/schema.sql`** — apply drift columns here unless the user explicitly specifies otherwise.
