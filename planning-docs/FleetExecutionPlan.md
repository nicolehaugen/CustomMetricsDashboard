# DORA Metrics Dashboard — Fleet Execution Plan

> Extracted from the full Implementation Plan for use with /fleet mode.
> Each phase can be assigned to a separate agent. Phases at the same level (2A, 2B, 2C) run in parallel.

---
## Fleet Execution Plan (Agent-Assignable Phases)

> This plan is structured for `/fleet` mode — multiple agents working in parallel
> on independent workstreams. Phases are numbered to show dependencies.
> Phases at the same level (2A, 2B, 2C) can run in parallel.

```
                    ┌──────────────────┐
                    │  PHASE 1         │
                    │  Foundation      │
                    │  (sequential)    │
                    └────────┬─────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  PHASE 2A  │  │  PHASE 2B  │  │  PHASE 2C  │
     │  Fetchers  │  │  Seed Data │  │  Grafana   │
     │  (parallel)│  │  (parallel)│  │  (parallel)│
     └──────┬─────┘  └──────┬─────┘  └──────┬─────┘
            ▼               │               │
     ┌────────────┐         │               │
     │  PHASE 3   │         │               │
     │  Sync      │         │               │
     │  Engine    │         │               │
     └──────┬─────┘         │               │
            ▼               │               │
     ┌────────────┐         │               │
     │  PHASE 4   │         │               │
     │  Polish    │         │               │
     └──────┬─────┘         │               │
            │               │               │
            └───────────────┼───────────────┘
                            ▼
                   ┌────────────────┐
                   │   PHASE 5      │
                   │   E2E Testing  │
                   │   (Playwright) │
                   └────────────────┘
```

---

### PHASE 1: Foundation (Agent: `foundation`)

**Goal**: Establish the project scaffold so all other agents can work against shared types, config, and database schema.

**Depends on**: Nothing (runs first)

**Files to create**:
```
CustomMetricsDashboard/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── src/
│   ├── index.ts              # Express server (port 3001), health check at GET /health
│   ├── config.ts             # Load + validate env vars (GITHUB_TOKEN, PG_*, GITHUB_ORG, GITHUB_REPO)
│   ├── types.ts              # Shared TypeScript interfaces for all DB entities + API responses
│   ├── github/
│   │   └── client.ts         # Octokit instance factory (auth via GITHUB_TOKEN)
│   └── db/
│       ├── connection.ts     # pg Pool singleton, connect/disconnect helpers
│       └── schema.sql        # Full DDL: all tables, indexes, constraints (from plan above)
```

**Key decisions this agent makes**:
- `package.json` dependencies: `express`, `@octokit/rest`, `pg`, `dotenv`, `typescript`, `tsx`, `@types/*`
- `tsconfig.json`: target ES2022, moduleResolution node16, strict mode, outDir `dist/`
- `types.ts` must export interfaces for: `User`, `CopilotUserActivity`, `PullRequest`, `Deployment`, `DeploymentStatus`, `WorkflowRun`, `Issue`, `CodeScanningAlert`, `DeploymentPullRequest`, `SyncState`, `SyncJob`
- `config.ts` must throw on missing required env vars
- `schema.sql` must match the DDL exactly as specified in the "PostgreSQL Schema" section of this plan
- Express server must listen on `process.env.PORT || 3001`

**Validation criteria** (how to know this phase is done):
1. `npm install` succeeds with zero errors
2. `npx tsc --noEmit` compiles with zero errors
3. `npx tsx src/index.ts` starts the Express server and responds to `GET /health` with `200 OK`
4. `schema.sql` can be reviewed and contains all 10 tables + indexes from the plan
5. `config.ts` throws if `GITHUB_TOKEN` is missing from env
6. `types.ts` exports at least 11 interfaces (one per DB table entity + SyncJob)

---

### PHASE 2A: GitHub API Fetchers (Agent: `fetchers`)

**Goal**: Build all GitHub API data fetchers using Octokit. Each fetcher handles pagination, rate limiting, and returns typed arrays ready for DB insertion.

**Depends on**: Phase 1 (needs `types.ts`, `client.ts`, `config.ts`)

**Files to create**:
```
src/github/
├── pagination.ts           # Generic paginated fetch helper wrapping Octokit's paginate()
├── deployments.ts          # Fetch deployments + deployment statuses for a repo
├── pull-requests.ts        # Fetch merged PRs (with labels, additions, deletions)
├── workflow-runs.ts        # Fetch workflow runs
├── issues.ts               # Fetch issues (especially incident-labeled)
├── code-scanning.ts        # Fetch code scanning alerts
└── copilot-users.ts        # Fetch Copilot user activity per day
```

**Key requirements per fetcher**:
- Each fetcher exports an async function like `fetchDeployments(octokit, owner, repo, since?: Date): Promise<DeploymentRow[]>`
- Use `octokit.paginate()` for auto-pagination
- Support incremental fetch via `since` parameter (filter by date)
- Handle rate limit errors with exponential backoff (detect `X-RateLimit-Remaining` header)
- `deployments.ts` must also fetch deployment statuses for each deployment (nested API call)
- `pull-requests.ts` must request `additions`/`deletions` fields and `labels` array
- `copilot-users.ts` calls `GET /orgs/{org}/copilot/metrics/reports/users-1-day?day={date}` for a range of dates
- `pagination.ts` should provide a reusable wrapper that logs page count and handles rate limits

**Validation criteria**:
1. `npx tsc --noEmit` compiles with zero errors (all fetchers import types from `types.ts`)
2. Each fetcher file exports at least one async function
3. Each fetcher handles the `since` parameter for incremental sync
4. Rate limit handling exists (search for `X-RateLimit` or `retry` or `backoff` in the code)
5. `copilot-users.ts` iterates over a date range, not a single day
6. `deployments.ts` fetches both deployments AND their statuses (two API call patterns)

---

### PHASE 2B: Seed Data Generator (Agent: `seeder`)

**Goal**: Build the seed data system that populates PostgreSQL with realistic test data, plus a verifier that checks the seeded data produces valid DORA metrics.

**Depends on**: Phase 1 (needs `types.ts`, `db/connection.ts`, `schema.sql`)

**Files to create**:
```
seed/
├── config.ts               # SEED_CONFIG object (counts, ratios, time ranges)
├── generator.ts            # Generates all entity records with realistic distributions
└── README.md               # Usage docs for seed commands
scripts/
└── seed.ts                 # CLI entry: truncate → generate → insert → verify
```

**`package.json` scripts to add** (coordinate with Phase 1 agent or add yourself):
```json
{
  "seed": "tsx scripts/seed.ts",
  "seed:verify": "tsx scripts/seed.ts --verify-only"
}
```

**Key requirements**:
- `seed/config.ts` must export `SEED_CONFIG` matching the shape in the plan (users: 18, PRs: 120, deploys 2-8/wk, 15% incidents, 12% rework, 70% Copilot active)
- `seed/generator.ts` generates data that matches the exact column shapes in `schema.sql`
- Records must cover a 90-day window ending at `now()`
- PRs must have varying cycle times (1h to 5 days, skewed short)
- Some PRs must carry `hotfix`/`bugfix`/`rollback` labels (for rework rate)
- Deployments must have SHA values that match linked PRs' `merge_commit_sha`
- The `deployment_pull_requests` bridge table must be populated
- Failed deployments (~15%) must have follow-up recovery deployments
- Copilot activity records: 70% of users active on any given day
- `scripts/seed.ts` must: (1) connect to PG, (2) TRUNCATE all data tables, (3) INSERT generated data, (4) optionally run verification queries
- `seed:verify` runs the same SQL as Grafana panels and prints a summary table like the one in the plan

**Validation criteria**:
1. `npx tsc --noEmit` compiles with zero errors
2. `npm run seed` can be run (assuming a PG instance exists) — it truncates + inserts
3. `npm run seed:verify` prints DORA metric summaries that fall within expected ranges:
   - Change Lead Time: 2–24 hours median
   - Deployment Frequency: 3–6/week
   - Change Fail Rate: 10–20%
   - Failed Deployment Recovery Time: 0.5–12 hours
   - Deployment Rework Rate: 8–15%
4. Generated data includes users, PRs, deployments, deployment_statuses, deployment_pull_requests, issues, workflow_runs, copilot_user_activity
5. Bridge table `deployment_pull_requests` correctly links deployments to PRs via matching SHAs

---

### PHASE 2C: Grafana Dashboard (Agent: `grafana`)

**Goal**: Create the complete Grafana provisioning configuration and dashboard JSON file. This phase produces dashboard-as-code that can be copied to Grafana's provisioning directory.

**Depends on**: Phase 1 (needs `schema.sql` to know table/column names for SQL queries)

**Files to create**:
```
grafana/
├── provisioning/
│   ├── datasources/
│   │   └── postgres.yml          # PostgreSQL datasource config
│   └── dashboards/
│       └── dashboard.yml         # Dashboard provider config (points to ../dashboards/)
└── dashboards/
    └── dora-metrics.json         # Main dashboard definition (all panels)
scripts/
└── setup-grafana.sh              # Copy provisioning files to Grafana dirs
```

**Dashboard JSON must include ALL of the following panels** (see Dashboard Layout section above):

| Row | Panels | Panel Type |
|-----|--------|------------|
| Row 1: Throughput | Change Lead Time, Deployment Frequency, Failed Deployment Recovery Time | Stat + sparkline |
| Row 2: Instability | Change Fail Rate, Deployment Rework Rate | Stat + sparkline |
| Row 3: Throughput Trends | Change Lead Time (line), Deployment Frequency (area), Recovery Time (line) | Time series |
| Row 4: Instability Trends | Change Fail Rate (bar), Rework Rate (bar) | Time series |
| Row 5: Copilot Comparison | DORA by Copilot Cohort (grouped bar: Active vs Inactive × 5 metrics) | Bar chart |
| Row 6: Copilot Productivity | PRs by Cohort, Lines Changed by Cohort, PRs per User by Cohort | Stat / Bar |
| Row 7: Supplementary | PR Cycle Time, Incident Resolution Time | Stat |
| Row 8: Detail Tables | Recent Deployments, Recent PRs, Open Incidents, Rework Deployments | Table |

**Template variables**: `$environment` (query), `$copilot_cohort` (custom: All, Copilot Active, Copilot Inactive)

**SQL queries**: Use the exact SQL from the "DORA Metric Definitions" section of this plan. Every panel query must include:
- `$__timeFrom()` / `$__timeTo()` for time range filtering
- `$environment` for environment filtering
- `$copilot_cohort` filter clause (the cohort subquery from the plan)

**Annotations**: Deployment markers + incident markers on time series panels

**Datasource YAML** (`postgres.yml`):
```yaml
apiVersion: 1
datasources:
  - name: DORA PostgreSQL
    type: postgres
    url: localhost:5432
    database: dora_metrics
    user: $PG_USER
    secureJsonData:
      password: $PG_PASSWORD
    jsonData:
      sslmode: disable
      postgresVersion: 1500
```

**Validation criteria**:
1. `dora-metrics.json` is valid JSON (parseable with `JSON.parse`)
2. Dashboard contains ≥ 20 panels (3+2+3+2+1+3+2+4 = 20 minimum)
3. Every panel's SQL query references `$__timeFrom()`, `$__timeTo()`, and `$environment`
4. Template variables `$environment` and `$copilot_cohort` are defined in the dashboard JSON
5. `postgres.yml` is valid YAML with correct datasource type
6. `dashboard.yml` points to the correct dashboards directory path
7. Row 5 and Row 6 panels include cohort segmentation SQL
8. `setup-grafana.sh` copies files to standard Grafana provisioning paths

---

### PHASE 3: Sync Engine & Routes (Agent: `sync-engine`)

**Goal**: Wire fetchers into a sync orchestrator that performs incremental syncs, resolves the deployment↔PR bridge, and exposes HTTP endpoints for triggering and monitoring sync jobs.

**Depends on**: Phase 2A (needs all fetcher functions)

**Files to create**:
```
src/sync/
├── orchestrator.ts          # Coordinates full incremental sync across all resource types
├── bridge-resolver.ts       # Resolves deployment SHA → PR merge_commit_sha links
└── state.ts                 # Read/write sync_state table (last_synced_at, cursor, etag)
src/routes/
├── sync.ts                  # POST /api/sync (trigger sync), returns job ID
└── status.ts                # GET /api/sync/status/:jobId (check job progress)
scripts/
└── sync-cron.sh             # Cron wrapper: curl -X POST http://localhost:3001/api/sync
```

**Update** `src/index.ts` to mount the new routes.

**Key requirements**:
- `orchestrator.ts`:
  - Calls each fetcher in sequence (or parallel where safe)
  - Uses `sync_state` table to only fetch records newer than `last_synced_at`
  - UPSERTs fetched records into PostgreSQL (ON CONFLICT DO UPDATE)
  - Calls `bridge-resolver.ts` after deployments and PRs are synced
  - Creates a `sync_jobs` record at start (status: 'running'), updates on completion/failure
  - Logs progress (records synced per resource type)
- `bridge-resolver.ts`:
  - For each deployment, finds PRs whose `merge_commit_sha` matches the deployment `sha`
  - Handles squash merges: if no direct SHA match, compares deployment SHA against commits in recently merged PRs (requires an additional Octokit call to list PR commits)
  - INSERTs into `deployment_pull_requests` bridge table (ON CONFLICT DO NOTHING)
- `state.ts`:
  - `getLastSyncedAt(resource: string): Promise<Date | null>`
  - `updateSyncState(resource: string, syncedAt: Date): Promise<void>`
- `POST /api/sync` must:
  - Return immediately with `{ jobId: number, status: 'started' }`
  - Run sync in the background (not blocking the HTTP response)
- `GET /api/sync/status/:jobId` must return current job status from `sync_jobs` table
- `sync-cron.sh`: simple bash script that calls `curl -s -X POST http://localhost:3001/api/sync`

**Validation criteria**:
1. `npx tsc --noEmit` compiles with zero errors
2. `POST /api/sync` returns `200` with a JSON body containing `jobId`
3. `GET /api/sync/status/:jobId` returns the job's current status
4. `orchestrator.ts` references every fetcher from Phase 2A
5. `bridge-resolver.ts` handles both direct SHA match and squash merge fallback
6. `state.ts` reads/writes the `sync_state` table
7. Sync updates `sync_jobs.finished_at` and `sync_jobs.status` on completion
8. Routes are mounted in `src/index.ts`

---

### PHASE 4: Polish, Error Handling & Documentation (Agent: `polish`)

**Goal**: Add production-quality error handling, comprehensive README, setup scripts, and .env configuration.

**Depends on**: Phases 2B, 2C, 3 (all prior work complete)

**Files to create/update**:
```
README.md                    # Comprehensive setup + usage guide
scripts/
├── setup-db.sh              # Create PG database + run schema.sql
└── setup-grafana.sh         # (may already exist from Phase 2C — enhance if needed)
```

**Error handling improvements** (update existing files):
- Wrap all fetcher calls in orchestrator with try/catch; log errors but continue other resources
- Add retry logic (3 retries with exponential backoff) to each fetcher
- If a sync job fails partially, record which resources succeeded in `sync_jobs.error_message`
- Add request timeout (30s) to all Octokit calls
- Validate environment variables at startup (fail fast with descriptive error)

**README must include**:
1. Project overview (what this dashboard does, why it exists)
2. Architecture diagram (the ASCII diagram from this plan)
3. Prerequisites: Node.js ≥ 18, PostgreSQL ≥ 14, Grafana OSS ≥ 10
4. Step-by-step setup guide (the 11 steps from "Bare Metal Deployment Guide" section)
5. GitHub PAT creation instructions with exact required scopes (`repo`, `read:org`, `admin:org`, `actions`)
6. `.env.example` file contents and what each variable does
7. Seed data usage: `npm run seed` and `npm run seed:verify`
8. Sync usage: `npm run sync` (manual) and cron setup
9. Grafana access: default admin credentials, dashboard URL
10. Troubleshooting: common issues (PG connection, rate limits, empty dashboard)
11. Optional: GitHub OAuth setup for Grafana (the `grafana.ini` snippet from the plan)

**`setup-db.sh`**:
```bash
#!/bin/bash
# Creates the dora_metrics database and runs schema
createdb dora_metrics 2>/dev/null || echo "Database already exists"
psql -d dora_metrics -f src/db/schema.sql
echo "Schema applied successfully"
```

**Validation criteria**:
1. README.md exists and contains all 11 sections listed above
2. `.env.example` lists every required environment variable with placeholder values
3. `setup-db.sh` is executable and references `schema.sql`
4. Orchestrator has try/catch around each fetcher call
5. At least one fetcher demonstrates retry/backoff logic
6. `npx tsc --noEmit` still compiles with zero errors after all changes
7. `package.json` has scripts: `build`, `start`, `dev`, `seed`, `seed:verify`, `sync`


---

### PHASE 5: Testing (Agent: `testing`)

**Goal**: Unit tests for fast coding-agent validation + Playwright E2E tests for full-stack CI validation. Two layers only — keep it lean.

**Depends on**: Phases 2B, 2C, 3, 4 — all prior work complete

**Files to create**:
``
vitest.config.ts
tests/
├── config.test.ts               # Config throws on missing vars
├── fetchers/
│   ├── deployments.test.ts      # Mock Octokit, verify API calls + pagination
│   ├── pull-requests.test.ts
│   ├── workflow-runs.test.ts
│   ├── issues.test.ts
│   ├── code-scanning.test.ts
│   └── copilot-users.test.ts
├── seed-generator.test.ts       # Output shapes match schema, distributions within bounds
└── bridge-resolver.test.ts      # SHA matching: direct, squash, no-match
e2e/
├── playwright.config.ts
├── dashboard.spec.ts            # Grafana E2E: panels render, dropdowns work, tables have data
└── helpers/
    └── wait-for-grafana.ts      # Multi-layer readiness check
.github/
└── workflows/
    └── test.yml                 # CI: unit (no infra) → e2e (PG + Grafana containers)
``

**Two test layers**:

| Layer | Purpose | Who Runs It | Infrastructure |
|-------|---------|-------------|----------------|
| **Unit (Vitest)** | Fast feedback — coding agents run after every change | Coding agent locally, CI | None |
| **E2E (Playwright)** | Full-stack confidence — dashboard renders with real data | CI only (GitHub Actions) | PG + Grafana containers |

**Unit test requirements**:
- Config: throws on missing `GITHUB_TOKEN`, `PG_*`; returns valid object when complete
- Fetchers: mock Octokit, verify endpoint URL, pagination, `since` param, rate limit backoff
- Seed generator: output shapes match schema, counts match config, distributions within tolerance, timestamps relative to `Date.now()`
- Bridge resolver: direct SHA match, squash fallback, no-match returns empty

**E2E test requirements**:
- Multi-layer Grafana readiness wait (health API → datasource → panel-loading hidden)
- Dashboard loads without error panels
- Stat panels show numeric values
- Template variable dropdowns work (`, `)
- Time range selector changes results
- Detail tables have rows
- Empty state: no-data date range shows graceful fallback

**CI pipeline**: `unit` job (no infra) → `e2e` job (PG + Grafana service containers, seed data, Playwright). Pin Grafana image version. Upload `playwright-report/` on failure.

**Validation criteria**:
1. `npx vitest run` passes all unit tests (zero failures)
2. `npx playwright test` passes all E2E tests against seeded PG + Grafana
3. CI workflow runs both jobs successfully on push/PR
4. Failed E2E uploads `playwright-report/` as artifact
