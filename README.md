# DORA Metrics Dashboard

## 1. Project Overview

A custom **DORA Metrics Dashboard** that syncs GitHub data into PostgreSQL and visualizes it through Grafana. Built around the **2024 DORA framework**, it tracks **5 key metrics**:

- **Deployment Frequency** — how often code is deployed to production
- **Lead Time for Changes** — time from PR merge to production deployment
- **Change Failure Rate** — percentage of deployments causing incidents
- **Mean Time to Recovery (MTTR)** — time to restore service after failure
- **Reliability** — code-scanning alert density and resolution speed

The dashboard supports **Copilot cohort comparison**, allowing teams to compare DORA metrics between developers using GitHub Copilot and those who are not, providing data-driven insight into Copilot's impact on engineering velocity and quality.

---

## 2. Architecture

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  Grafana OSS │──SQL──│  PostgreSQL  │◄──────│  Node.js     │
│  (Dashboard) │       │  (Data Store)│       │  Sync Service│
│  Port 3000   │       │  Port 5432   │       │  Port 3001   │
└──────────────┘       └──────────────┘       └──────┬───────┘
                                                     │ Octokit
                                               ┌─────▼──────┐
                                               │ GitHub REST │
                                               │ APIs        │
                                               └─────────────┘
```

**Components:**

| Component | Purpose |
|---|---|
| **Node.js Sync Service** | Fetches data from 7 GitHub REST API endpoints via Octokit and upserts into PostgreSQL |
| **PostgreSQL** | Stores all synced GitHub data (PRs, deployments, workflow runs, issues, code scanning alerts, Copilot activity) |
| **Grafana OSS** | Connects to PostgreSQL via SQL datasource; renders pre-built DORA dashboards |

---

## 3. Prerequisites

| Tool | Minimum Version | Notes |
|---|---|---|
| **Node.js** | ≥ 18 | Required for the sync service |
| **PostgreSQL** | ≥ 14 | Data store for all synced metrics |
| **Grafana OSS** | ≥ 10 | Dashboard visualization |

---

## 4. Setup Guide

### Step 1: Clone the repository

```bash
git clone <repository-url>
cd CustomMetricsDashboard
```

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values (see [Environment Variables](#6-environment-variables) below).

### Step 4: Create a GitHub Personal Access Token (PAT)

See [GitHub PAT Setup](#5-github-pat-setup) below for detailed instructions.

### Step 5: Create the PostgreSQL database

```bash
createdb dora_metrics
```

Or use the setup script:

```bash
bash scripts/setup-db.sh
```

### Step 6: Apply the database schema

```bash
psql -d dora_metrics -f src/db/schema.sql
```

### Step 7: Seed test data (optional)

```bash
npm run seed
```

### Step 8: Verify seed data

```bash
npm run seed:verify
```

### Step 9: Start the sync service

```bash
npm run dev
```

The service starts on port 3001 by default.

### Step 10: Set up Grafana provisioning

```bash
bash scripts/setup-grafana.sh
```

This copies datasource and dashboard provisioning files into your Grafana configuration directory.

### Step 11: Open Grafana

Navigate to [http://localhost:3000](http://localhost:3000) and log in with default credentials: **admin / admin**.

---

## 5. GitHub PAT Setup

Create a **GitHub Personal Access Token (classic)** with the following scopes:

| Scope | Purpose |
|---|---|
| `repo` | Access repository data (PRs, deployments, workflow runs, issues) |
| `read:org` | Read organization membership for Copilot user activity |
| `admin:org` | Access Copilot usage data at the org level |
| `actions` | Access workflow run data |

**Steps:**

1. Go to [GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Give it a descriptive name (e.g., `dora-metrics-dashboard`)
4. Select the scopes: `repo`, `read:org`, `admin:org`, `actions`
5. Click **Generate token**
6. Copy the token and add it to your `.env` file as `GITHUB_TOKEN`

---

## 6. Environment Variables

| Variable | Description | Default |
|---|---|---|
| `GITHUB_TOKEN` | GitHub Personal Access Token with required scopes | *(required)* |
| `GITHUB_ORG` | GitHub organization name to sync data from | *(required)* |
| `GITHUB_REPO` | GitHub repository name to sync data from | *(required)* |
| `PG_HOST` | PostgreSQL host | `localhost` |
| `PG_PORT` | PostgreSQL port | `5432` |
| `PG_DATABASE` | PostgreSQL database name | `dora_metrics` |
| `PG_USER` | PostgreSQL user | `postgres` |
| `PG_PASSWORD` | PostgreSQL password | `postgres` |
| `PORT` | Port for the sync service HTTP server | `3001` |

---

## 7. Seed Data

The seed system generates realistic test data so you can explore the dashboard without connecting to a live GitHub org.

```bash
# Generate seed data
npm run seed

# Verify seed data was inserted correctly
npm run seed:verify
```

Seed data includes:
- Users (with Copilot-enabled and non-Copilot cohorts)
- Pull requests with realistic merge times
- Deployments and deployment statuses
- Workflow runs (CI/CD)
- Issues with labels and close times
- Code scanning alerts
- Copilot user activity metrics

---

## 8. Sync Usage

### Manual sync via npm script

```bash
npm run sync
```

> **Note:** The sync service must be running (`npm run dev`) for this to work.

### Manual sync via curl

```bash
curl -X POST http://localhost:3001/api/sync
```

### Check sync status

```bash
curl http://localhost:3001/api/sync/status
```

### Automated sync with cron

Use the provided cron script to run syncs on a schedule:

```bash
# Edit your crontab
crontab -e

# Add a line to sync every 6 hours
0 */6 * * * /path/to/CustomMetricsDashboard/scripts/sync-cron.sh
```

---

## 9. Grafana Access

- **URL:** [http://localhost:3000](http://localhost:3000)
- **Default credentials:** `admin` / `admin`
- **Dashboard location:** After setup, find the DORA Metrics dashboard under **Dashboards** in the left sidebar

The dashboard is auto-provisioned via Grafana's provisioning system. If you ran `scripts/setup-grafana.sh`, the datasource and dashboard are already configured.

To manually access the dashboard:
1. Open Grafana at http://localhost:3000
2. Log in with admin/admin (you'll be prompted to change the password)
3. Navigate to **Dashboards** in the left sidebar
4. Select the **DORA Metrics** dashboard

---

## 10. Troubleshooting

### PostgreSQL connection refused

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

- Ensure PostgreSQL is running: `pg_isready`
- Check your `PG_HOST`, `PG_PORT`, `PG_USER`, and `PG_PASSWORD` in `.env`
- Verify the database exists: `psql -l | grep dora_metrics`

### GitHub API rate limits

```
Error: API rate limit exceeded
```

- GitHub allows 5,000 requests/hour with a PAT. The sync fetches data incrementally using `since` timestamps, so subsequent syncs are lighter.
- Check your remaining rate limit: `curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/rate_limit`
- Wait for the rate limit to reset or use a token with higher limits (GitHub App)

### Empty dashboard / no data

- Verify data was synced: `curl http://localhost:3001/api/sync/status`
- Check that seed data exists: `npm run seed:verify`
- Ensure Grafana's PostgreSQL datasource is correctly configured (host, port, database, user, password)
- Check Grafana datasource health: **Configuration → Data sources → PostgreSQL → Save & Test**

### Sync failures

- Check the sync service logs for error details
- Partial sync failures are logged but don't stop other resource types from syncing
- Verify your GitHub PAT has the required scopes (`repo`, `read:org`, `admin:org`, `actions`)
- Ensure the target org/repo exists and is accessible with your token

---

## 11. Optional: GitHub OAuth for Grafana

You can configure Grafana to use GitHub OAuth for authentication instead of the default admin credentials.

1. Create a GitHub OAuth App at [https://github.com/settings/developers](https://github.com/settings/developers)
2. Set the callback URL to `http://localhost:3000/login/github`
3. Add the following to your Grafana configuration (`grafana.ini` or environment variables):

```ini
[auth.github]
enabled = true
client_id = YOUR_GITHUB_OAUTH_APP_CLIENT_ID
client_secret = YOUR_GITHUB_OAUTH_APP_CLIENT_SECRET
allowed_organizations = your-org
```

4. Restart Grafana to apply the changes
