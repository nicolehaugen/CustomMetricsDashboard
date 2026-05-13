# DORA + Copilot Metrics Learning Dashboard

<!-- Test-only README change to validate PR-triggered CI workflows. -->

**Local-only educational dashboard** combining DORA (Deployment Frequency, Lead Time for Changes, Change Failure Rate, Mean Time to Recovery) metrics with GitHub Copilot adoption and usage leading indicators to assess engineering success against the [GitHub Engineering System Success Playbook](https://github.com/resources/insights/engineering-system-success-playbook).

## Goals

This project is intended as a hands-on way to:

1. **Familiarize yourself with the GitHub Copilot Metrics API** (and the supporting GitHub REST APIs for PRs, deployments, workflow runs, and issues) and see how each endpoint correlates to the metric objectives outlined in the GitHub Engineering System Success Playbook.
2. **Show concrete example visualizations and SQL queries** for each metric, so the dashboards double as a reference for how to translate raw API payloads into DORA + Copilot leading indicators.

Every panel includes a Learning Guide text block that documents its API source, calculation, and the exact SQL used — the dashboards are meant to be read as much as viewed.

## Quick Start

### Prerequisites

- **Docker** and **Docker Compose** (latest stable)
- **GitHub Classic Personal Access Token** (PAT) with scopes: `repo`, `read:org`, `admin:org`, `actions`, `copilot`
  - Token must have Enterprise Owner role if syncing Copilot metrics from an Enterprise
- **GitHub targets**: an Enterprise slug, Organization, and Repository to measure
  - An **enterprise slug** is the URL-safe identifier in `https://github.com/enterprises/<slug>` (e.g. `octocat-industries`). It is *not* the same as an organization login — an enterprise wraps one or more orgs. Find it under **Enterprise settings** or in the URL when viewing your enterprise account. The REST API expects this value wherever the docs say `{enterprise}` (e.g. `GET /enterprises/{enterprise}/copilot/metrics/...`).
  - An **organization slug** is the login shown in `https://github.com/<org>` (e.g. `octodemo`).
  - A **repository slug** is just the repo name from `https://github.com/<org>/<repo>` (no owner prefix).

### 1. Setup

```bash
# Clone the repository

# Create .env from template
cp .env.example .env

# Edit .env and fill in your credentials:
# - GITHUB_TOKEN: your Classic PAT
# - GITHUB_ENTERPRISE: Enterprise slug (required for Copilot metrics endpoints)
# - GITHUB_ORG: Organization slug (for DORA + Copilot seat data)
# - GITHUB_REPO: Repository slug (for DORA metrics)
```

### 2. Start the Stack

```bash
# Launch PostgreSQL, sync server, and Grafana in Docker
docker compose up -d

# Verify all services are running
docker compose ps
```

Expected output:
```
NAME                 STATUS
custom-metrics-dashboard-postgres-1        Up (healthy)
custom-metrics-dashboard-sync-server-1     Up
custom-metrics-dashboard-grafana-1         Up
```

### 3. Sync Your First Dataset

```bash
# Trigger a full sync (fetches GitHub data and loads into PostgreSQL)
curl -X POST http://localhost:3005/api/sync

# Watch for completion:
# Returns: { "jobId": "..." } 
# Poll: GET http://localhost:3005/api/sync/jobs/{jobId}
# Syncs typically complete in 30–60 seconds depending on data volume
```

### 4. Open Grafana

Navigate to **http://localhost:3006** (user: `admin` / password: `admin`)

---

## Dashboards Overview

Six dashboards are available, numbered sequentially for reference. Each reflects a different perspective on Copilot adoption and engineering success:

---

### 1️⃣ [Overview](http://localhost:3006/d/overview)
**Engineering system dashboard with operational controls and quick metrics.**

This is your control center for managing the dashboard:
- **Data sync options** — trigger manual syncs and monitor sync status
- **Quick metrics** — Copilot adoption %, usage %, and key DORA indicators at a glance
- **System health** — database connectivity, data freshness, and sync job status
- **Schema drift tables** — each row in *Drift columns not yet in schema.sql* and *Drift columns not yet visualized* has an **Ignore** link. Click it to hide that column from both detection tables; an *Ignored drift columns* table lets you Unignore later. **Caveat:** ignores are stored in the postgres volume only — running `docker compose down -v` clears them. There is no other backing store.

**Why it matters:**  
Start here to verify the system is working and data is current. Use the data sync controls to refresh your metrics before reviewing detailed dashboards. This dashboard confirms that all underlying services (PostgreSQL, sync server, Grafana) are operational.

---

### 2️⃣ [Copilot Adoption](http://localhost:3006/d/adoption)
**Copilot seat activation and organization-wide usage trends.**

- Active seats (28-day window)
- % of org with Copilot access
- Cumulative seat growth over time
- Usage by editor (VS Code, JetBrains, Vim, etc.)

**Why it matters:**  
Per the ESSP playbook, Copilot adoption is a **leading indicator** of engineering capability. A rising adoption curve signals investment in AI-assisted development. Use this to:
- Track rollout success
- Identify adoption bottlenecks by team/geography
- Correlate with downstream improvements in DORA metrics (lag of 2–4 weeks typical)

---

### 3️⃣ [Per-User Copilot](http://localhost:3006/d/per-user)
**Individual developer Copilot usage patterns.**

- Accepts & lines generated per user
- Active days per user
- Copilot chat interactions
- Code generation volume trends

**Why it matters:**  
This dashboard reveals **usage diversity**. A healthy team has a bell-curve distribution of Copilot power users and casual users. Heavy skew (e.g., 3 users generating 90% of completions) suggests:
- Knowledge concentration risk
- Opportunity for broader training or adoption initiatives

---

### 4️⃣ [Enterprise Copilot Leading Indicators](http://localhost:3006/d/edu-enterprise-leading)
**Enterprise-level Copilot metrics aligned to ESSP leading indicators.**

- **Daily Active Users (DAU)**: developers using Copilot each day
- **Suggestion Acceptance Rate**: % of Copilot suggestions accepted
- **Code Generated Volume**: lines of code generated by Copilot  
- **Chat Interactions**: Copilot chat usage per day
- **Productivity Proxy**: lines_generated / (developer_hours × 8) as a rough efficiency metric

**Why it matters:**  
Leading indicators are **early signals** of engineering success before DORA metrics (which are lagging) improve. The ESSP playbook recommends tracking Copilot usage as a proxy for team capability:
- **Rising DAU** = increasing Copilot integration in the workflow
- **Rising Acceptance Rate** = team confidence in Copilot suggestions (quality indicator)
- **Rising Code Generation** = Copilot is actively reducing boilerplate and routine coding

**Time to Impact:** improvements in leading indicators typically precede DORA metric gains by 2–4 weeks.

---

### 5️⃣ [Organization Copilot Leading Indicators](http://localhost:3006/d/edu-organization-leading)
**Org-level view of the same leading indicators for multi-team visibility.**

- Rolling averages of DAU, acceptance rate, code volume
- Team-by-team breakdowns (if available)
- Trends vs. peers / historical baselines

**Why it matters:**  
If your organization has multiple teams, this dashboard shows whether Copilot adoption is **balanced or concentrated**. Orgs with broad adoption tend to see more distributed improvements in DORA metrics.

---

### 6️⃣ [Enterprise Lagging Indicators](http://localhost:3006/d/edu-enterprise-lagging)
**DORA metrics (lagging indicators) and deployment outcomes.**

- **Deployment Frequency**: avg deploys per day (higher = faster release cadence)
- **Lead Time for Changes**: avg days from PR merge to production (lower = faster delivery)
- **Change Failure Rate**: % of deployments causing incidents (lower = more stable)
- **Mean Time to Recovery**: avg hours from incident to resolution (lower = faster response)
- Incident volume by severity

**Why it matters:**  
The **GitHub Engineering System Success Playbook explicitly identifies DORA metrics as "downstream, or lagging metrics"** — meaning they reflect the outcomes of improvements made upstream in your engineering system. As the ESSP states:

> "These metrics are downstream, or lagging metrics, and in the majority of cases should be complemented with leading metrics."

DORA is the **industry standard** for measuring engineering velocity and stability. These are lagging indicators because they reflect the outcome of process and capability improvements (like Copilot adoption):

| Metric | Meaning |
|--------|---------|
| **Deployment Frequency** ↑ | Team ships faster; able to iterate quickly |
| **Lead Time** ↓ | Reduce time-to-value; faster feedback loops |
| **CFR** ↓ | Fewer broken deployments; higher code quality |
| **MTTR** ↓ | Faster incident response; less downtime |

**Expected Correlation with Leading Indicators:**  
Per the ESSP framework, teams with sustained high Copilot DAU typically see DORA improvements within 3–8 weeks, especially in Lead Time (less code review friction) and Deployment Frequency (faster feature development). The playbook recommends using leading metrics (like Copilot adoption) as **early signals** and lagging metrics (like DORA) to **validate long-term impact**.

---

## Understanding Leading vs. Lagging Indicators

The ESSP framework distinguishes between two types of metrics:

- **Leading Indicators** — early signals of capability and adoption (e.g., Copilot DAU, acceptance rate, code volume generated). These respond quickly (within days) to changes in your engineering system.
- **Lagging Indicators** — downstream outcomes that validate long-term impact (e.g., DORA metrics). These reflect the compounded effect of improvements and typically lag by 2–8 weeks.

**The ESSP Playbook Loop:**

```
Copilot Adoption (Leading Indicator)
         ↓ 
   [2–4 weeks lag]
         ↓
DORA Metrics Improve (Lagging Indicators)
         ↓
Engineering Velocity ↑
Code Quality ↑
Release Cadence ↑
```

### Why This Matters

The GitHub Engineering System Success Playbook recommends a **balanced scorecard** approach:

1. **Lead with Copilot metrics** to validate adoption and early engagement
   - Quick feedback loop (days)
   - Indicates team is adopting the capability
   
2. **Corroborate with DORA metrics** to confirm long-term impact
   - Slower feedback loop (weeks)
   - Confirms improvements in actual delivery and stability
   
3. **Add customer data** (lagging indicators sourced outside this dashboard) for business validation:
   - Customer satisfaction (CSAT)
   - Defect escape rate
   - Feature delivery commitments met
   - Team velocity (story points / sprint)

4. **Iterate**: If Copilot DAU is high but DORA metrics plateau, investigate:
   - Are deployments blocked by process (approvals, gates)?
   - Is code review still a bottleneck?
   - Are there gaps in tooling or CI/CD maturity?

**Key Principle from ESSP:**  
> "These metrics are downstream, or lagging metrics, and in the majority of cases should be complemented with leading metrics."

This dashboard provides the **leading indicators** (Copilot adoption & engagement). Your organization must source the **lagging indicators** (DORA, customer impact) to complete the balanced scorecard and validate the true impact of Copilot investment.

---

## Environment Variables

Create a `.env` file in the repo root with the following:

```bash
# GitHub Credentials
# Use a Classic PAT (not fine-grained) with scopes: repo, read:org, admin:org, actions, copilot
GITHUB_TOKEN=ghp_your_token_here

# GitHub Targets
GITHUB_ENTERPRISE=your-enterprise-slug    # Required for Copilot metrics endpoints
GITHUB_ORG=Octodemo                       # Organization for seat data and DORA metrics
GITHUB_REPO=octocat_supply-curly-train    # Repository for DORA metrics

# PostgreSQL (defaults match docker-compose)
PG_HOST=localhost
PG_DATABASE=metrics
PG_USER=postgres
PG_PASSWORD=postgres

# Sync Server
PORT=3005                                 # API server port
```

**Important Notes:**
- **GITHUB_TOKEN**: Must be a **Classic Personal Access Token**, not fine-grained. Some Enterprise Copilot endpoints do not yet support fine-grained tokens.
- **GITHUB_ENTERPRISE**: Required to access Copilot metrics endpoints. Use the Enterprise slug (e.g., `my-enterprise`), not the URL.
- **GITHUB_ORG** and **GITHUB_REPO**: Used for DORA data. The repo should have Actions workflows configured to populate deployment metrics.

---

## Running & Syncing Data

### Start the Services

```bash
docker compose up -d
```

This launches:
- **PostgreSQL** (port 5433): stores metrics
- **Sync Server** (port 3005): fetches GitHub data and syncs to PostgreSQL
- **Grafana** (port 3006): visualizes the data

### Manually Trigger a Sync

```bash
curl -X POST http://localhost:3005/api/sync
```

Response:
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Then poll:
```bash
curl http://localhost:3005/api/sync/jobs/550e8400-e29b-41d4-a716-446655440000
```

Expected response when complete:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "recordsSynced": {
    "pullRequests": 42,
    "deployments": 18,
    "copilotEnterpriseDailySummary": 28,
    "copilotOrganizationUserMetrics": 156
  },
  "startedAt": "2026-04-29T10:00:00Z",
  "completedAt": "2026-04-29T10:02:45Z"
}
```

### Automated Syncs

The sync server **does not include a scheduler**. For recurring syncs, use an external cron job or GitHub Actions workflow to call the `/api/sync` endpoint.

Example cron (run every 6 hours):
```bash
0 */6 * * * curl -X POST http://localhost:3005/api/sync
```

---

## Development

### Local Setup (for extending or debugging)

```bash
# Install dependencies
npm install

# Type-check
npm run build

# Run sync server locally (requires PostgreSQL running in docker)
npm run sync

# Run E2E tests
npm run test:e2e
```

### Project Structure

```
.
├── src/
│   ├── server.ts              # Express API (sync endpoint)
│   ├── sync/
│   │   ├── orchestrator.ts    # Main sync workflow
│   │   ├── github-api.ts      # GitHub API calls (Octokit)
│   │   └── loaders.ts         # PostgreSQL UPSERT logic
│   ├── db/
│   │   └── schema.sql         # PostgreSQL schema (metrics tables)
│   └── config.ts              # Environment config
├── grafana/
│   ├── dashboards/            # Grafana JSON dashboard definitions
│   └── provisioning/          # Grafana datasource & dashboard auto-provisioning
├── docker-compose.yml         # Multi-container orchestration
├── Dockerfile                 # Sync server image
└── .env.example               # Template environment variables
```

### Key Design Principles

- **ELT, Not ETL**: Data is fetched raw from GitHub, stored verbatim in PostgreSQL, and transformed in Grafana SQL panels.
- **No Scheduled Syncs**: This is an on-demand API. Scheduling is the responsibility of the caller (cron, GitHub Actions, etc.).
- **Grafana Transforms**: All aggregations, smoothing, and time-series logic lives in Grafana SQL panels, not in application code.

---

## Troubleshooting

### "No data" in Grafana

1. **Check services are running:**
   ```bash
   docker compose ps
   ```
   All three containers should show `Up`.

2. **Check PostgreSQL has data:**
   ```bash
   docker exec custom-metrics-dashboard-postgres-1 psql -U postgres -d metrics -c "SELECT COUNT(*) FROM sync_jobs;"
   ```
   If returns `0`, trigger a sync: `curl -X POST http://localhost:3005/api/sync`

3. **Check Copilot metrics were fetched:**
   ```bash
   docker exec custom-metrics-dashboard-postgres-1 psql -U postgres -d metrics -c "SELECT COUNT(*) FROM copilot_enterprise_daily_summary;"
   ```
   If returns `0`, check sync server logs: `docker logs custom-metrics-dashboard-sync-server-1 | grep -i copilot`

4. **Verify Grafana datasource:**
   - Open http://localhost:3006/connections/datasources
   - Ensure datasource type is `PostgreSQL` and hostname is `postgres` (not `localhost`)
   - Test connection; should show "Database user 'postgres' authenticated successfully"

### Sync fails with "401 Unauthorized"

- Verify `GITHUB_TOKEN` in `.env` is a valid Classic PAT
- Check token has required scopes: `repo`, `read:org`, `admin:org`, `actions`, `copilot`
- If syncing Copilot metrics: verify token owner has Enterprise Owner role

### Sync shows "0" Copilot records

- Confirm `GITHUB_ENTERPRISE` in `.env` is set to a valid Enterprise slug
- Verify the Enterprise has Copilot seats provisioned
- Check sync logs: `docker logs custom-metrics-dashboard-sync-server-1 | tail -50`

### Grafana won't start

- Ensure PostgreSQL is healthy: `docker compose logs postgres`
- Verify Grafana port (3006) is not already in use: `lsof -i :3006` (or `Get-NetTCPConnection -LocalPort 3006` on Windows)

---

## References

- **[GitHub Engineering System Success Playbook](https://github.com/resources/insights/engineering-system-success-playbook)** — The framework this dashboard is built upon. Read this to understand the DORA/Copilot correlation.
- **[ESSP Ebook (PDF)](https://assets.ctfassets.net/wfutmusr1t3h/59IWCIRvx0KfHbh6B7bv62/d9f55b94ab43fe91e9ed183d73882954/2025-05-28-GitHub-ESSP-Ebook-EZ-Version012.pdf)** — In-depth guidance, case studies, and implementation roadmaps.
- **[DORA Metrics Overview](https://dora.dev/)** — Industry-standard definitions and benchmarks.
- **[GitHub Copilot Metrics API](https://docs.github.com/en/enterprise-cloud@latest/rest/copilot/copilot-metrics)** — API documentation for Copilot usage endpoints.

---

## Support & Contributing

This is an **educational, local-only dashboard** for learning how Copilot adoption correlates with engineering success metrics. 

For issues or suggestions:
1. Check the logs: `docker compose logs -f`
2. Verify your `.env` configuration matches [Environment Variables](#environment-variables)
3. Ensure your GitHub token has all required scopes

---

**Created: April 29, 2026**  
**Version: current**  
**Status: Learning / Evaluation Dashboard (Local Docker only)**
