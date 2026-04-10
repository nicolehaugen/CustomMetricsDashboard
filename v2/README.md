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

Navigate to http://localhost:3002 (admin / admin).

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
curl -s -X POST http://localhost:3001/api/sync
# Returns: { "jobId": 5, "status": "started" }

# Monitor progress:
curl http://localhost:3001/api/sync/status/5
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
