# Copilot Instructions — CustomMetricsDashboard

## Setup Checks

At the start of any session, verify these tools are available and install if missing:

```powershell
# TypeScript language server (required for LSP diagnostics)
npm list -g typescript-language-server --depth=0 || npm install -g typescript-language-server typescript

# ESLint (installed as a local dev dependency)
cd v2 && npm list eslint --depth=0 || npm install
```

Run `npm run lint` and `npm run build` from `v2/` to confirm the environment is healthy before making changes.



GitHub data → PostgreSQL → Grafana. Measures the four DORA pillars plus Copilot adoption and code impact. The **active version is `v2/`**; `v1/` is legacy and should not be extended.

## Commands (run from inside `v2/`)

```bash
npm run dev          # Start sync server (tsx, port 3001)
npm test             # Unit tests (Vitest)
npx vitest run tests/bridge-resolver.test.ts   # Single unit test file
npm run test:e2e     # Playwright E2E (requires docker-compose stack running)
npm run build        # TypeScript compile check (tsc)
npm run seed         # Load synthetic data (offline, no PAT needed)
npm run sync         # Trigger a live sync via the API
```

Grafana runs at **http://localhost:3004** (admin/admin). Sync API at **http://localhost:3003**.

## Architecture

**ELT, not ETL.** The sync service is a pure data courier — it fetches raw GitHub API responses, saves them to `data/raw/`, and loads them verbatim into PostgreSQL. **All transformation happens in Grafana SQL panels.** There are no views, stored procedures, or application-layer transforms.

```
GitHub API → src/sync/orchestrator.ts → PostgreSQL → grafana/dashboards/*.json
```

Key components:
- **`src/github/`** — One file per GitHub API endpoint group. Each fetcher also writes a raw JSON dump to `data/raw/<resource>/`.
- **`src/sync/orchestrator.ts`** — Runs the full sync sequence: create a `sync_jobs` row, call each fetcher, UPSERT into tables, run the bridge resolver, finalize the job record.
- **`src/sync/bridge-resolver.ts`** — Links deployments to PRs by SHA. Two strategies: `direct_sha` (deployment.sha = PR.merge_commit_sha) and `squash_fallback` (deployment.sha = PR.head_sha). Results stored in `deployment_pull_requests`.
- **`src/sync/schema-check.ts`** — `assertSchemaMatch()` is called before inserting Copilot data to verify API keys match DB columns. Throws `SchemaMismatchError` if the schema is stale.
- **`src/sync/state.ts`** — `sync_state` table tracks `last_synced_at` per resource for incremental fetches (PRs, issues, deployments, workflow runs use this; Copilot tables are always TRUNCATE + INSERT).
- **`seed/`** — Synthetic data generator. `SEED_CONFIG` in `seed/config.ts` controls volumes. Uses `DATA_MODE=seed` so dashboards show the amber banner.
- **`grafana/dashboards/`** — Eight numbered JSON files (00–07). Edit dashboard JSON directly; Grafana auto-provisions them on startup.

## Key Conventions

### GitHub API Client Rules

**Always use the Octokit SDK — never call GitHub REST API URLs directly with `fetch()` or `axios`.**
- Use `octokit.rest.*` for endpoints covered by the TypeScript types.
- Use `octokit.request('GET /path', { params })` for endpoints not yet in the type definitions (e.g. the 2026-03-10 Copilot metrics endpoints). `octokit.request` is still the Octokit SDK — it is not a raw HTTP call.
- Exception: `fetch()` **is** acceptable for signed S3/CDN download URLs returned inside a GitHub API response's `download_links` field. Those URLs are not GitHub API endpoints.

**Never use the deprecated Copilot metrics endpoints** (`GET /orgs/{org}/copilot/metrics`, `GET /enterprises/{enterprise}/copilot/metrics`, etc.). These were shut down on **April 2, 2026**. See: https://docs.github.com/en/enterprise-cloud@latest/rest/copilot/copilot-metrics?apiVersion=2022-11-28

### Copilot Usage Metrics API
Use the **2026-03-10 API version** via `octokit.request`. It returns a `download_links` envelope (not inline JSON). Fetch each URL with `fetch()` and parse NDJSON line-by-line. Both fetchers use `(octokit as any).request(...)` because Octokit TypeScript types don't yet cover these endpoints; **the `as any` casts are intentional, do not remove them**.

Correct endpoints:
- Org metrics: `GET /orgs/{org}/copilot/metrics/reports/organization-28-day/latest`
- User metrics: `GET /orgs/{org}/copilot/metrics/reports/users-28-day/latest`

### Copilot PR Attribution
A PR is "Copilot-attributed" when the PR author has an active seat (`last_activity_at` within 28 days). The GitHub API provides no per-PR Copilot telemetry — this is a proxy. Every panel using this attribution shows a ⚠️ caveat.

### DORA Label Dependencies
- **Change Failure Rate** requires issues labeled `incident`
- **Rework Rate** requires PRs labeled `hotfix`, `bugfix`, or `rollback`
- Missing labels cause those metrics to show 0% (not an error).

### JSONB fields
Array-valued fields (`labels`, `assignees`, `requested_reviewers`, `payload`, all `totals_by_*` columns) are stored with `JSON.stringify()` and mapped to `JSONB` columns. When writing Grafana SQL against these, use PostgreSQL JSONB operators (`->`, `->>`, `@>`, `jsonb_array_elements`).

### Grafana SQL macros
`$__timeTo()` and `$__timeFrom()` resolve to untyped string literals in the PostgreSQL datasource. For timestamp arithmetic, always cast explicitly:
```sql
EXTRACT(DAY FROM ($__timeTo()::timestamptz - $__timeFrom()::timestamptz))
```

### Syncing data
Use the **`sync-verifier` agent** whenever you need to trigger a sync or diagnose missing data. It covers: starting the docker-compose stack, triggering the sync, reading `records_synced`, inspecting raw dump files, and prescribing fixes for silent 403/404 failures.

Key points to remember without the agent:
- A sync job can report `status: completed` while Copilot data was never fetched (errors are swallowed per-fetcher). **Always check `records_synced`** — if any `copilot_*` count is 0, check server logs for `WARN`/`ERROR`.
  - Via API: `GET http://localhost:3003/api/sync/jobs/{jobId}`
  - Via DB: `docker exec v2-postgres-1 psql -U postgres -d dora_metrics -c "SELECT id, status, records_synced FROM sync_jobs ORDER BY id DESC LIMIT 3;"`
- Raw dump files at `data/raw/<resource>/<YYYY-MM-DDTHH-MM-SS>.json` contain only the **incremental delta** since `last_synced_at`. An empty `[]` file on a second same-day sync is normal, not an error.
- The sync server must run **inside docker-compose** (`docker-compose up -d` from `v2/`). Running `npm run dev` locally fails with a `PG_HOST` DNS error.
- After changing `.env` (especially `GITHUB_TOKEN`), restart the server to pick up new values: `docker-compose restart sync-server` or `docker-compose up -d`.
- After editing TypeScript source files, rebuild the image before syncing: `docker-compose up -d --build`. A plain restart uses the old compiled image.

### Dashboard validation (Playwright)

> **⚠️ This section applies only to GitHub cloud agent sessions.**

**Playwright MCP is configured** — use it directly for any dashboard validation. Do NOT write Node.js scripts or install `@playwright/cli` separately. Grafana runs at **http://localhost:3004** (admin/admin).

When making changes to dashboard JSON, Grafana SQL, or seed data, run the dashboard and use Playwright to take screenshots of both the **before** and **after** states, then commit them to the PR. Specifically:

1. **Before** making changes — navigate to the affected Grafana dashboard URL, wait for panels to load, and take a screenshot of the current state.
2. **Make** the dashboard/SQL/seed changes.
3. **After** applying changes — reload the dashboard and take a new screenshot showing the updated state.
4. **Commit** both the before and after screenshots to the PR so reviewers can visually verify the impact.

**Grafana 11 table selectors:** Table cells render as `role="cell"` (not `role="gridcell"`). Use `[role="row"]:has([role="cell"])` for data row selectors. Do not use `waitForLoadState('networkidle')` — the WebSocket connection keeps it from resolving. Use `waitForLoadState('load')` + `waitForTimeout(3000)` instead.

### Dashboard "No data" triage
Check in this order:
1. `docker ps` — confirm `v2-postgres-1`, `v2-sync-server-1`, and `v2-grafana-1` are all running
2. `docker exec v2-postgres-1 psql -U postgres -d dora_metrics -c "SELECT COUNT(*) FROM pull_requests;"` — if 0, run `npm run seed` from `v2/`
3. For Copilot panels: check `copilot_seats` count — if 0, a silent 403/404 occurred (see sync-and-verify skill)
4. Verify Grafana datasource type at http://localhost:3004/connections/datasources — Grafana 12 renamed it from `postgres` to `grafana-postgresql-datasource`; a mismatch silently breaks all panels

### TypeScript edit workflow
After editing any `.ts` file, call `ide-get_diagnostics` before running a Docker build or `npm run build`. A language server provides instant feedback — use it to catch type and syntax errors before the slow rebuild cycle. When running as a cloud agent (no LSP available), run `npm run build` from `v2/` after TypeScript edits to catch errors before proceeding.

**Before committing or considering any task done**, run from `v2/`:
```bash
npm test && npm run lint && npm run build
```
All three must pass. Fix any failures before proceeding.

### PR testing requirements
Every pull request must pass **both** test suites before merge. Run from `v2/`.

1. **Unit tests** (`npm test`) — run after every code change. Fast, offline, no Docker needed. Tests live in `tests/**/*.test.ts`.
2. **E2E tests** (`npm run test:e2e`) — run when changes affect dashboard JSON, Grafana SQL, seed data, or the sync pipeline. Requires the docker-compose stack running and the database seeded. Tests live in `tests/e2e/*.spec.ts`.

Unit tests mock `../src/db/connection` by defining `mockPool` before the `vi.mock(...)` call:
```ts
const mockPool = { query: vi.fn() };
vi.mock('../src/db/connection', () => ({ getPool: vi.fn(() => mockPool) }));
```
The mock must be defined before the mock factory to satisfy Vitest hoisting.

### Data mode banner
Every dashboard reads from the `data_mode` table to display a colored banner (🟢 live / 🟠 seed / 🎮 demo). Set `DATA_MODE`, `DATA_SOURCE_LABEL`, and `DATA_SOURCE_URL` in `.env` to control it.

### Required env vars
`GITHUB_TOKEN`, `GITHUB_ORG`, `GITHUB_REPO`, `PG_HOST`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`. Use a **Classic PAT** (not fine-grained) — Copilot org endpoints may not support fine-grained tokens. Required scopes: `repo`, `read:org`, `admin:org`, `actions`.
