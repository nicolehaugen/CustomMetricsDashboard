---
name: drift-to-metric-plan
description: "**WORKFLOW SKILL** — Read-only proposer that turns auto-discovered drift columns into a reviewable Markdown panel proposal for a Grafana dashboard. Profiles the column in the live DB, classifies it by name/type, picks a target dashboard, and prints draft SQL plus the standard four-panel section. NEVER edits dashboard JSON. WHEN: \"propose metric for new column\", \"plan dashboard panel for drift\", \"how should I visualize this new field\", \"draft SQL for drift column\", \"new field added to schema, what now\". INVOKES: psql via docker exec, file read of schema.sql + dashboard JSON. FOR SINGLE OPERATIONS: write the SQL by hand if you already know the panel shape."
---

# Drift to Metric Plan

Take one or more API drift columns that have already been committed to `v3/src/db/schema.sql` and produce a **Markdown proposal** for a new Grafana panel covering them. The proposal is for human review; this skill never edits dashboard JSON.

## Prerequisites

- The columns must exist in the **live database** (auto-applied by `applyDrift()` on a previous sync).
- The columns must exist in **`v3/src/db/schema.sql`** (committed via the `schema-drift-apply` skill). If they are not yet in `schema.sql`, stop and instruct the user to run `schema-drift-apply` first.

## Inputs

1. **`table`** — the table containing the drift column(s) (e.g., `copilot_enterprise_daily`).
2. **`fields`** — one or more new column names (e.g., `daily_active_copilot_cloud_agent_users`).
3. **`sync_jobs.id`** *(optional)* — a specific sync job to read the originating drift entry from.

If any input is missing, ask the user with `vscode_askQuestions`. Default to the most recent drift entry if no `sync_jobs.id` is supplied.

## Step 1 — Confirm columns are in `schema.sql`

```bash
grep -nE "<field1>|<field2>" v3/src/db/schema.sql
```

If any field is missing, stop. Tell the user:

> Column `<field>` is not in `v3/src/db/schema.sql` yet. Run the `schema-drift-apply` skill first, then re-invoke this one.

## Step 2 — Profile the column in the live DB

For each field, run a one-liner via `docker exec` (PowerShell-friendly — see user memory note about multi-line PS):

**Numeric / BIGINT / NUMERIC:**

```bash
docker exec v3-postgres-1 psql -U postgres -d metrics -c "SELECT COUNT(*) AS rows, COUNT(\"<field>\") AS non_null, COUNT(DISTINCT \"<field>\") AS distinct_, MIN(\"<field>\") AS min_, MAX(\"<field>\") AS max_, ROUND(AVG(\"<field>\")::numeric, 2) AS avg_, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY \"<field>\") AS median_ FROM <table>;"
```

**Boolean (`used_*`):**

```bash
docker exec v3-postgres-1 psql -U postgres -d metrics -c "SELECT COUNT(*) FILTER (WHERE \"<field>\") AS true_count, COUNT(*) FILTER (WHERE NOT \"<field>\") AS false_count, COUNT(*) AS total FROM <table>;"
```

**JSONB (`totals_by_*`, `pull_requests`, etc.):**

```bash
docker exec v3-postgres-1 psql -U postgres -d metrics -c "SELECT DISTINCT key FROM <table>, jsonb_object_keys(\"<field>\") AS key WHERE \"<field>\" IS NOT NULL LIMIT 50;"
```

**Text / timestamp:**

```bash
docker exec v3-postgres-1 psql -U postgres -d metrics -c "SELECT \"<field>\", COUNT(*) FROM <table> WHERE \"<field>\" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 5;"
```

Capture: row count, non-null count, distinct count, min/max/median (numeric), true ratio (boolean), top-level keys (JSONB), 5 sample values. If `non_null = 0`, note the field is empty in current data and recommend deferring panel creation until data populates.

## Step 3 — Classify the field

Mirror `inferType()` in [v3/src/db/insert.ts](v3/src/db/insert.ts) plus name-based heuristics:

| Field name pattern | Suggested visualization | Aggregation |
|---|---|---|
| `*_users`, `*_count`, `*_sum` | Stat (current) **and** timeseries (trend) | `SUM` per day; for users prefer `MAX` (avoid double-counting) |
| `used_*` (boolean) | Stat showing adoption % | `COUNT(*) FILTER (WHERE used_x)::float / NULLIF(COUNT(*),0) * 100` |
| `totals_by_*` (JSONB object) | Bar chart by key | `jsonb_each_text` with `SUM(value::bigint)` grouped by `key` |
| `*_at` (timestamp) | Stat showing recency | `MAX(<field>)` and `NOW() - MAX(<field>)` |
| `*_id`, `*_url`, free text | Table panel — distinct values + counts | `GROUP BY <field>` |

If ambiguous (e.g., a numeric field with very low distinct count), present 2 candidate visualizations and ask the user.

## Step 4 — Pick a target dashboard

| Table | Default target dashboard |
|---|---|
| `copilot_enterprise_daily`, `copilot_enterprise_*` | [v3/grafana/dashboards/10-enterprise-copilot-leading.json](v3/grafana/dashboards/10-enterprise-copilot-leading.json) or [12-enterprise-lagging.json](v3/grafana/dashboards/12-enterprise-lagging.json) |
| `copilot_organization_*` | [v3/grafana/dashboards/11-organization-copilot-leading.json](v3/grafana/dashboards/11-organization-copilot-leading.json) |
| `copilot_user_daily`, `copilot_user_*` | [v3/grafana/dashboards/09-per-user-copilot.json](v3/grafana/dashboards/09-per-user-copilot.json) |
| `copilot_seats`, generic Copilot | [v3/grafana/dashboards/06-copilot-adoption.json](v3/grafana/dashboards/06-copilot-adoption.json) |
| `pull_requests`, `deployments`, `workflow_runs`, `issues` | Ask the user — there is no single default. |

When two candidates look equally valid (e.g., leading vs lagging for an enterprise metric), ask via `vscode_askQuestions`.

## Step 5 — Render the proposal (Markdown, chat only)

Print to chat. Do **not** write a file to disk unless the user asks.

Required sections:

1. **Summary** — one sentence per field describing what it appears to measure (based on name + profile).
2. **Profile data** — the numbers from Step 2 in a small table.
3. **Classification** — the row from Step 3 that applied.
4. **Target dashboard** — the file from Step 4 plus suggested section name and `gridPos`.
5. **Panel proposal(s)** — one or more candidate panels. For each:
   - Title, viz type, `gridPos { x, y, w, h }` suggestion (use a `y` larger than the current max in the file).
   - Draft Grafana SQL — must use PostgreSQL JSONB operators where applicable and cast macros explicitly:
     ```sql
     EXTRACT(DAY FROM ($__timeTo()::timestamptz - $__timeFrom()::timestamptz))
     ```
   - The standard **four-panel section pattern** (spacer + row + viz + Learning Guide) per [.github/copilot-instructions.md](.github/copilot-instructions.md).
   - A Learning Guide markdown block (`h: 7` short, `h: 14` standard, `h: 18` long).
6. **Caveats** — list any indirect attribution or label dependencies. Example: "GitHub provides no per-PR Copilot telemetry — proxy required". Every Copilot-attribution panel needs a ⚠️ caveat.
7. **Next steps** — explicit list:
   - "Approve which panel(s) to ship (option A / B / none)."
   - "If approved, the standard dashboard-edit workflow plus the `playwright-screenshots` skill captures before/after PNGs."
   - "Run `npm test && npm run lint && npm run build` from `v3/` before committing."

## Step 6 — Stop and wait for approval

End with:

> Approve, modify, or discard? I will not edit any dashboard JSON until you say so.

Implementation, screenshots, and tests run only after the user explicitly chooses a panel to ship.

## Rules

- **Never edit dashboard JSON.** This skill is read-only and proposal-only.
- **Never invent column names.** Use the exact API field names. The repo uses source-faithful naming.
- **Default scope is `v3/`.** Only target `v2/` if the user explicitly asks.
- **Every proposed panel must include a Learning Guide** in the four-panel pattern.
- **Add a ⚠️ caveat** when the metric is a proxy (e.g., Copilot author attribution) or label-dependent (`incident`, `hotfix`, `bugfix`, `rollback`).
- **Use one-liner shell commands.** Multi-line PowerShell may execute only the first line in this environment (see user memory).
- **Database name is `metrics`.** All `psql` commands must use `-d metrics`.
- **Do not chain into other skills.** If `schema-drift-apply` is needed, instruct the user to run it; do not auto-invoke.
- **Do not open PRs or push.** Implementation and shipping are the user's call.
