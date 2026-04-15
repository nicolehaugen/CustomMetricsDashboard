# Custom DORA + Copilot Impact Dashboard v2

GitHub data → PostgreSQL → Grafana. Measures the four DORA pillars plus Copilot adoption and code impact — with a Copilot cohort analysis showing whether Copilot usage correlates with better delivery performance.

## Architecture

**ELT, not ETL.** The sync service is a data courier: it saves raw API responses to `data/raw/`, loads them verbatim into PostgreSQL, and lets Grafana SQL do all the transformation. No views, stored procedures, or application-layer transforms.

```
GitHub API → sync service → data/raw/ → PostgreSQL → Grafana dashboards
```

## Requirements

- Docker + Docker Compose
- A GitHub Classic PAT with scopes: `repo`, `read:org`, `admin:org`, `actions`
- Node.js 20+ (for local development)

## Quick Start

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env — set GITHUB_TOKEN, GITHUB_ORG, GITHUB_REPO, PG_USER, PG_PASSWORD
```

### 2. Start the stack

```bash
docker-compose up -d postgres grafana
```

### 3. Apply the schema

```bash
bash setup-db.sh
```

### 4. Load data

**Option A — Live sync** (requires valid PAT and real repo):
```bash
docker-compose up sync
```

**Option B — Seed with synthetic data** (works offline):
```bash
npm run seed
```

### 5. Open Grafana

Navigate to http://localhost:3004 (admin / admin).

## Dashboards

| # | Dashboard | Purpose |
|---|-----------|---------|
| 0 | 📊 Engineering Overview | Leadership summary: all KPIs at a glance |
| 1 | 🚀 Deployment Frequency | How often does the team deploy? |
| 2 | ⏱️ Lead Time for Changes | How fast does code reach production? |
| 3 | 🔥 Change Failure Rate | How often do changes cause problems? |
| 4 | 🏥 Mean Time to Recovery | How fast does the team recover from failures? |
| 5 | 🤖 Copilot Adoption & Usage | Who has seats? Who is active? |
| 6 | 💻 Copilot Code Impact | Lines accepted, PR attribution, leaderboards |
| 7 | 🔬 DORA × Copilot Cohort | Does Copilot usage correlate with better DORA metrics? |

## GitHub PAT Scopes

| Scope | Required for |
|-------|-------------|
| `repo` | Pull requests, deployments, issues, workflow runs |
| `read:org` | Copilot org metrics, seats |
| `admin:org` | Copilot billing seats (some orgs require this) |
| `actions` | Workflow runs |

Use a **Classic PAT** (not fine-grained) — Copilot org endpoints may not support fine-grained tokens.

## Mid-Session Re-Sync

Trigger a fresh sync without restarting the stack:
```bash
curl -s -X POST http://localhost:3003/api/sync
# Returns: { "jobId": 5, "status": "started" }

# Monitor progress:
curl http://localhost:3003/api/sync/status/5
```

## Data Mode Banner

Every dashboard shows a banner indicating the data source:

| Mode | Color | Label |
|------|-------|-------|
| `live` | 🟢 Green | 📡 Live Data — your-org/your-repo |
| `seed` | 🟠 Amber | 🌱 Synthetic Seed Data |
| `demo` | 🔵 Blue | 🎮 Demo Environment |

Configure via `.env`:
```
DATA_MODE=live
DATA_SOURCE_LABEL=my-org/my-repo
DATA_SOURCE_URL=https://github.com/my-org/my-repo
```

## Copilot Attribution Model

PR attribution is **proxy-based**: a PR is "Copilot-attributed" when the PR author holds an active Copilot seat (`last_activity_at` within 28 days). The GitHub API does not provide per-PR Copilot telemetry. Every Copilot panel that uses PR attribution displays a ⚠️ caveat explaining this.

## DORA Metric Labels

- **Change Fail Rate** requires GitHub issues labeled `incident`
- **Rework Rate** requires PRs labeled `hotfix`, `bugfix`, or `rollback`
- If these labels are not used, those metrics will show 0% — not because failures don't occur, but because they aren't tracked here.

## Development

```bash
npm install
npm run dev          # Start sync server (tsx, hot reload)
npm test             # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright, requires running stack)
```

## Troubleshooting — "No Data" on Dashboards

### 1. Check stack health first
```bash
docker ps
# Confirm v2-postgres-1, v2-sync-server-1, and v2-grafana-1 are all running
docker-compose up -d   # Start any stopped containers
```

### 2. Data not loaded — run seed or sync
```bash
# Check if any rows exist
docker exec v2-postgres-1 psql -U postgres -d dora_metrics -c "SELECT COUNT(*) FROM pull_requests;"

# Option A: Load synthetic data (no PAT required)
npm run seed

# Option B: Trigger a live sync (requires valid .env)
response=$(curl -s -X POST http://localhost:3003/api/sync)
echo "$response"
jobId=$(echo "$response" | jq -r '.jobId')
curl "http://localhost:3003/api/sync/status/$jobId"
```

### 3. Copilot panels show "No data" after sync
A sync can report `status: success` while Copilot tables stay empty — errors are caught per-fetcher and logged as warnings. Check the seat count:
```bash
docker exec v2-postgres-1 psql -U postgres -d dora_metrics -c "SELECT COUNT(*) FROM copilot_seats;"
```
If 0, check the sync server logs:
```bash
docker logs v2-sync-server-1 | grep -E "WARN|ERROR|copilot"
```
Common causes:
- PAT lacks `admin:org` scope — regenerate with `repo`, `read:org`, `admin:org`, `actions`
- Wrong `GITHUB_ORG` value in `.env` (must be org slug, not display name)
- Copilot is not enabled for your organisation
- Fine-grained PAT used instead of Classic PAT

After fixing `.env`, rebuild and restart:
```bash
docker-compose up -d --build
curl -s -X POST http://localhost:3003/api/sync
```

### 4. DORA panels show "No data" — no GitHub Deployments
The deployment-based panels (Deployment Frequency, Lead Time, MTTR, Change Failure Rate) require your repo to use the [GitHub Deployments API](https://docs.github.com/en/rest/deployments/deployments). If your repo uses a different deployment mechanism (e.g., direct Actions runs, external CD), the `deployments` table will be empty.

The `$environment` template variable auto-includes an **All** option, so you will see 0 rather than a broken filter — but you will need to create at least one GitHub Deployment for meaningful data.

### 5. "Lead Time" and cohort panels show "No data" even with deployments
These panels JOIN through `deployment_pull_requests`, which links deployments to the PRs that caused them. The bridge resolver matches `deployment.sha` to `pull_request.merge_commit_sha` (direct) or `pull_request.head_sha` (squash fallback). If your CI pipeline generates synthetic deployment SHAs that don't match any PR SHA, the bridge table stays empty.

Check bridge links:
```bash
docker exec v2-postgres-1 psql -U postgres -d dora_metrics -c "SELECT COUNT(*) FROM deployment_pull_requests;"
```

### 6. Datasource type mismatch (Grafana 12+)
Grafana 12 renamed the PostgreSQL datasource type from `postgres` to `grafana-postgresql-datasource`. Verify the datasource at http://localhost:3004/connections/datasources — a mismatch silently breaks all panels.

### 7. Dashboard banner shows "No data"
The banner reads from the `data_mode` table. If you applied the schema manually without running `setup-db.sh`, insert a row:
```bash
docker exec v2-postgres-1 psql -U postgres -d dora_metrics -c \
  "INSERT INTO data_mode (mode, source_label) SELECT 'seed', 'No data loaded yet' WHERE NOT EXISTS (SELECT 1 FROM data_mode);"
```

## Project Structure

```
v2/
├── src/
│   ├── config.ts              # Env var validation
│   ├── index.ts               # Express server entry point
│   ├── db/
│   │   ├── connection.ts      # PostgreSQL pool
│   │   └── schema.sql         # Full v2 DDL
│   ├── github/                # API fetchers (one file per endpoint group)
│   └── sync/                  # Orchestrator, bridge resolver, state
├── seed/                      # Synthetic data generator
├── scripts/                   # CLI: seed.ts, sync.ts
├── grafana/
│   ├── provisioning/          # Auto-provisioned datasource + dashboard config
│   └── dashboards/            # 8 Grafana dashboard JSON files
├── tests/                     # Vitest unit tests
│   └── e2e/                   # Playwright E2E tests
├── data/raw/                  # Git-ignored; raw API response dumps
├── docker-compose.yml
├── .env.example
└── setup-db.sh
```
