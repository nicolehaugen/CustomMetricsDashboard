# Custom DORA Metrics Dashboard — Implementation Plan

## Goals

This dashboard exists to close two strategic gaps:

### Goal 1: Complete DORA Metric Coverage
GitHub provides excellent built-in dashboards for CI/CD performance (Actions), security posture (Security Overview), and Copilot adoption (Usage + Code Generation). However, **none of these compute the official DORA software delivery metrics** defined by [dora.dev](https://dora.dev/guides/dora-metrics-four-keys/). This dashboard fills that gap by computing all 5 DORA metrics (2024 framework) from GitHub API data:

| DORA Metric | Available in GitHub Built-in Dashboards? | This Dashboard |
|------------|:-:|:-:|
| Change Lead Time | ❌ | ✅ |
| Deployment Frequency | ❌ | ✅ |
| Failed Deployment Recovery Time | ❌ | ✅ |
| Change Fail Rate | ❌ (Actions shows CI job failure rate — different metric) | ✅ |
| Deployment Rework Rate | ❌ | ✅ |

**Together, GitHub's built-in dashboards + this custom dashboard = complete DORA coverage.**

### Goal 2: Feature Parity with Claude Code Analytics
Claude Code (a competitor AI coding tool) provides analytics that measure its impact on engineering productivity — including DORA-adjacent metrics like PRs with Claude Code attribution, lines of code shipped with Claude Code, and PRs per user. **GitHub Copilot currently has no equivalent dashboard for measuring its DORA impact.** This dashboard provides comparable metrics segmented by Copilot user cohorts, ensuring GitHub Copilot can demonstrate the same productivity narrative that Claude Code offers:

| Claude Code Analytics Metric | This Dashboard's Equivalent |
|------------------------------|----------------------------|
| PRs with CC (count + %) | PRs by Copilot Cohort (count + %) |
| Lines of code with CC | Lines Changed by Copilot Cohort |
| PRs per user | PRs per User by Copilot Cohort |
| DORA metrics (not provided by Claude Code) | All 5 DORA metrics, segmented by Copilot cohort |

**Result: GitHub Copilot users can demonstrate DORA impact at a level that Claude Code cannot — because Claude Code doesn't compute DORA metrics at all (no deployment/incident tracking).**

---

## Approach

Self-hosted, single-repository dashboard using a three-component architecture:

1. **Node.js Sync Service** — uses Octokit.js (GitHub SDK) to fetch data from GitHub REST APIs, compute DORA metrics, and write results to PostgreSQL. Runs as a systemd service with both scheduled sync (cron) and a manual trigger endpoint.
2. **PostgreSQL** — stores raw GitHub event data, computed DORA metrics, and sync state. Grafana reads directly from PostgreSQL using its native datasource.
3. **Grafana OSS** — provides the dashboard UI with built-in time range pickers, template variable dropdowns (environment, Copilot cohort), charts, stat panels, and tables. Dashboards are provisioned from JSON files for version control.

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

---

## Technology Stack & Rationale

| Layer | Technology | Why |
|-------|-----------|-----|
| **Dashboard** | Grafana OSS | Purpose-built for metrics dashboards — native time series charts, stat panels, tables, template variables for filtering, alerting, annotations. No custom frontend code needed. |
| **GitHub SDK** | @octokit/rest (Node.js) | Official GitHub JavaScript SDK — covers all required REST API endpoints with pagination helpers and rate limit handling |
| **Database** | PostgreSQL | Native Grafana datasource (no plugins needed), robust for concurrent reads/writes, supports views and materialized queries, production-grade |
| **Sync Service** | Node.js + Express | Lightweight HTTP server for manual sync trigger + Octokit integration. TypeScript for type safety. |
| **Scheduler** | cron / systemd timer | Runs periodic sync (e.g., every 6 hours) alongside the manual trigger option |
| **Runtime** | Node.js ≥ 18 | Required for Octokit and modern TypeScript |

### Why Grafana Over Custom Frontend

- **No frontend code to write**: Grafana provides charts, stat panels, tables, and filters out of the box
- **Native PostgreSQL support**: Direct SQL queries in panel editors — no API layer needed between DB and UI
- **Template variables**: Built-in dropdown filters for environment, cohort, time granularity
- **Time range picker**: Native, with presets (last 7d, 30d, 90d) and custom range
- **Annotations**: Can mark deployments/incidents directly on charts
- **Alerting**: Optional — alert on DORA metric thresholds (e.g., CFR > 15%)
- **Dashboard-as-code**: Export/import dashboards as JSON for version control

---

## Authentication Strategy

### GitHub API Authentication (Sync Service → GitHub)

**Recommended: Classic Personal Access Token (PAT)**

1. Create a **classic PAT** (not fine-grained — some endpoints like Copilot metrics may not support fine-grained tokens yet)
2. Required scopes:
   - `repo` — deployments, PRs, issues, code scanning
   - `read:org` — org membership (for Copilot metrics access)
   - `admin:org` — required for `/orgs/{org}/copilot/metrics/` endpoints
   - `actions` — workflow run data (note: may be covered by `repo` scope)
3. Store in `.env` file as `GITHUB_TOKEN`
4. **Best practice**: Use an org-owned service account, not a personal account, to avoid token invalidation if a team member leaves

**Upgrade path → GitHub App**: If the dashboard becomes a shared internal tool, register a GitHub App for:
- Higher rate limits (15,000 vs 5,000 req/hr)
- Short-lived installation tokens (no long-lived secrets)
- Better auditability
- The architecture is designed so swapping `new Octokit({ auth: pat })` for GitHub App auth is a single-file change in the auth module.

### Grafana Access (Browser → Grafana)

**Phase 1 (MVP):** Grafana's built-in auth — default admin account on localhost. Suitable for internal network access.

**Phase 2 (optional):** Configure Grafana's [GitHub OAuth integration](https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/configure-authentication/github/):
- Users log in with their GitHub account
- Restrict access to specific org/team members via `allowed_organizations`
- Grafana manages user sessions natively — no custom auth code
- Configuration is in `grafana.ini`:
  ```ini
  [auth.github]
  enabled = true
  client_id = YOUR_GITHUB_OAUTH_APP_CLIENT_ID
  client_secret = YOUR_GITHUB_OAUTH_APP_CLIENT_SECRET
  allowed_organizations = your-org
  ```

### PostgreSQL Authentication

- Local connections only (localhost) — no external exposure
- Sync service and Grafana connect via password auth
- Credentials stored in `.env` (sync service) and Grafana datasource config (provisioned YAML)

---

## Data Architecture

### Incremental Sync Strategy

Data sync is **incremental**, not a full re-fetch:

1. A `sync_state` table tracks `last_synced_at` and pagination cursors per resource type
2. On sync, only fetch records newer than `last_synced_at` (using `since`, `updated` sort, or date filters)
3. First-ever sync does a one-time historical backfill (paginating through all available data)
4. **Dual trigger model**:
   - **Scheduled**: cron job or systemd timer runs sync every N hours (configurable, default: 6 hours)
   - **Manual**: `POST http://localhost:3001/api/sync` triggers an immediate incremental sync. Can be called from a Grafana text panel link or directly via curl.
5. Sync runs as a background process — the POST returns immediately with a job ID. The `sync_jobs` table tracks status.

### PostgreSQL Schema

```sql
-- ═══ Raw Event Tables ═══════════════════════════════════════

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  github_user_id BIGINT UNIQUE NOT NULL,
  login         TEXT NOT NULL
);

CREATE TABLE copilot_user_activity (
  id            SERIAL PRIMARY KEY,
  user_id       INT REFERENCES users(id),
  activity_date DATE NOT NULL,
  is_active     BOOLEAN NOT NULL,
  metrics_json  JSONB,
  UNIQUE (user_id, activity_date)
);

CREATE TABLE pull_requests (
  id                SERIAL PRIMARY KEY,
  number            INT UNIQUE NOT NULL,
  author_user_id    INT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL,
  merged_at         TIMESTAMPTZ,
  merge_commit_sha  TEXT,
  title             TEXT,
  state             TEXT NOT NULL,
  labels            JSONB,             -- array of label objects (needed for rework detection: hotfix, bugfix, rollback)
  additions         INT,               -- lines added (from PR API — equivalent to Claude Code's lines_of_code.count)
  deletions         INT                -- lines deleted (from PR API — equivalent to Claude Code's lines_of_code.count)
);

CREATE TABLE deployments (
  id                  SERIAL PRIMARY KEY,
  github_deployment_id BIGINT UNIQUE NOT NULL,
  environment         TEXT NOT NULL,
  sha                 TEXT NOT NULL,
  ref                 TEXT,
  created_at          TIMESTAMPTZ NOT NULL,
  creator_user_id     INT REFERENCES users(id)
);

CREATE TABLE deployment_statuses (
  id              SERIAL PRIMARY KEY,
  deployment_id   INT REFERENCES deployments(id),
  state           TEXT NOT NULL,      -- success, failure, error, pending, etc.
  created_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE workflow_runs (
  id              SERIAL PRIMARY KEY,
  github_run_id   BIGINT UNIQUE NOT NULL,
  workflow_name   TEXT,
  conclusion      TEXT,               -- success, failure, cancelled, etc.
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ,
  run_started_at  TIMESTAMPTZ,
  head_sha        TEXT
);

CREATE TABLE issues (
  id                SERIAL PRIMARY KEY,
  number            INT UNIQUE NOT NULL,
  title             TEXT,
  labels            JSONB,            -- array of label objects
  state             TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL,
  closed_at         TIMESTAMPTZ,
  assignee_user_id  INT REFERENCES users(id)
);

CREATE TABLE code_scanning_alerts (
  id              SERIAL PRIMARY KEY,
  alert_number    INT UNIQUE NOT NULL,
  severity        TEXT,
  state           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,
  fixed_at        TIMESTAMPTZ,
  tool_name       TEXT
);

-- ═══ Bridge Tables ══════════════════════════════════════════

CREATE TABLE deployment_pull_requests (
  deployment_id   INT REFERENCES deployments(id),
  pull_request_id INT REFERENCES pull_requests(id),
  PRIMARY KEY (deployment_id, pull_request_id)
);

-- ═══ Operational Tables ═════════════════════════════════════

CREATE TABLE sync_state (
  resource_name   TEXT PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ,
  cursor          TEXT,
  etag            TEXT
);

CREATE TABLE sync_jobs (
  id              SERIAL PRIMARY KEY,
  status          TEXT NOT NULL DEFAULT 'running',  -- running, completed, failed
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  error_message   TEXT,
  records_synced  INT DEFAULT 0
);

-- ═══ Indexes for Grafana Query Performance ══════════════════

CREATE INDEX idx_deployments_env_created ON deployments(environment, created_at);
CREATE INDEX idx_deployment_statuses_state ON deployment_statuses(deployment_id, state);
CREATE INDEX idx_pull_requests_merged ON pull_requests(merged_at) WHERE merged_at IS NOT NULL;
CREATE INDEX idx_workflow_runs_conclusion ON workflow_runs(conclusion, created_at);
CREATE INDEX idx_issues_incident ON issues(created_at) WHERE labels @> '[{"name": "incident"}]';
CREATE INDEX idx_copilot_activity_date ON copilot_user_activity(activity_date, is_active);
```

**Important**: Join users by `github_user_id` (numeric), not login string (which can change).

### Deployment ↔ PR Bridge Resolution

This is the hardest data join. Strategy:
1. For each deployment, get the deployed SHA
2. Look up PRs whose `merge_commit_sha` matches the deployment SHA
3. Handle squash/rebase merges: compare the deployment SHA against the list of commits in recently merged PRs using the Commits API
4. Store resolved links in `deployment_pull_requests` bridge table

---

## DORA Metric Definitions

> Aligned with the **current DORA framework (2024)** from [dora.dev](https://dora.dev/guides/dora-metrics-four-keys/). DORA evolved from 4 to **5 metrics** in 2024, grouped into **Throughput** and **Instability**. Key changes from earlier versions:
> - "MTTR" was renamed to **"Failed Deployment Recovery Time"** in 2023 — it specifically measures recovery from *deployment-caused* failures, not general incidents
> - **"Deployment Rework Rate"** was added as a 5th metric in 2024
> - **"Reliability"** is a separate operational metric (not delivery performance)
>
> Source: [A history of DORA's software delivery metrics](https://dora.dev/insights/dora-metrics-history/)

---

### Software Delivery Throughput

#### 1. Change Lead Time
> *Time from code commit to successful production deployment.*

```sql
-- Grafana panel query (time series, median lead time per period)
SELECT
  date_trunc($__interval, d.created_at) AS time,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (d.created_at - pr.merged_at)) / 3600
  ) AS median_lead_time_hours
FROM deployments d
JOIN deployment_pull_requests dpr ON dpr.deployment_id = d.id
JOIN pull_requests pr ON pr.id = dpr.pull_request_id
JOIN deployment_statuses ds ON ds.deployment_id = d.id
WHERE d.environment = '$environment'
  AND ds.state = 'success'
  AND pr.merged_at IS NOT NULL
  AND d.created_at BETWEEN $__timeFrom() AND $__timeTo()
GROUP BY 1
ORDER BY 1;
```

**DORA definition note**: DORA defines this as "commit to production." Our MVP uses `merged_at` as a proxy because the merge commit is the unit that enters the deployment pipeline. For more precision, use the earliest commit timestamp in the PR via the Commits API.

**DORA benchmark**: Elite teams achieve < 1 hour; high performers < 1 day.

#### 2. Deployment Frequency
> *How often application changes are deployed to production.*

```sql
-- Grafana panel query (time series, group by $interval)
SELECT
  date_trunc($__interval, d.created_at) AS time,
  COUNT(*) AS deployment_count
FROM deployments d
JOIN deployment_statuses ds ON ds.deployment_id = d.id
WHERE d.environment = '$environment'
  AND ds.state = 'success'
  AND d.created_at BETWEEN $__timeFrom() AND $__timeTo()
  AND ds.created_at = (SELECT MAX(created_at) FROM deployment_statuses WHERE deployment_id = d.id)
GROUP BY 1
ORDER BY 1;
```
Only count **successful** production deployments.

**DORA benchmark**: Elite teams deploy on-demand (multiple times per day).

#### 3. Failed Deployment Recovery Time
> *Time to recover from a deployment that fails and requires immediate intervention.*
>
> **Renamed from "MTTR" in 2023.** DORA specifically focuses on recovery from *deployment-caused* impairments, not general incidents or infrastructure outages. ([Source](https://dora.dev/insights/dora-metrics-history/))

```sql
-- Grafana panel query (stat or time series)
-- Measures time from failed deployment status to next successful deployment in same environment
WITH failed_deployments AS (
  SELECT
    d.id AS deployment_id,
    d.environment,
    ds.created_at AS failure_time
  FROM deployments d
  JOIN deployment_statuses ds ON ds.deployment_id = d.id
  WHERE ds.state IN ('failure', 'error')
    AND d.environment = '$environment'
    AND ds.created_at BETWEEN $__timeFrom() AND $__timeTo()
),
recovery AS (
  SELECT
    fd.deployment_id,
    fd.failure_time,
    MIN(ds2.created_at) AS recovery_time
  FROM failed_deployments fd
  JOIN deployments d2 ON d2.environment = fd.environment AND d2.created_at > fd.failure_time
  JOIN deployment_statuses ds2 ON ds2.deployment_id = d2.id AND ds2.state = 'success'
  WHERE ds2.created_at > fd.failure_time
  GROUP BY fd.deployment_id, fd.failure_time
)
SELECT
  date_trunc($__interval, failure_time) AS time,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (recovery_time - failure_time)) / 3600
  ) AS median_recovery_hours
FROM recovery
GROUP BY 1
ORDER BY 1;
```

**DORA benchmark**: Elite teams recover in < 1 hour.

**Note**: This uses deployment status transitions (`failure` → next `success` in same environment). If more granular incident tracking is needed, supplement with incident-labeled issues, but the deployment-based measure is the DORA-aligned approach.

---

### Software Delivery Instability

#### 4. Change Fail Rate
> *Percentage of deployments that require immediate intervention (rollback, hotfix).*

```sql
-- Grafana panel query (stat or time series)
WITH deployment_outcomes AS (
  SELECT
    d.id,
    d.created_at,
    (SELECT state FROM deployment_statuses
     WHERE deployment_id = d.id ORDER BY created_at DESC LIMIT 1
    ) AS latest_state
  FROM deployments d
  WHERE d.environment = '$environment'
    AND d.created_at BETWEEN $__timeFrom() AND $__timeTo()
)
SELECT
  date_trunc($__interval, created_at) AS time,
  COUNT(*) FILTER (WHERE latest_state IN ('failure', 'error')) * 100.0
    / NULLIF(COUNT(*), 0) AS change_fail_rate_percent
FROM deployment_outcomes
GROUP BY 1
ORDER BY 1;
```

**DORA benchmark**: Elite teams achieve 0–15%.

**Data enrichment**: For higher accuracy, supplement deployment status failures with:
- Issues labeled `incident` created within 24 hours of a deployment
- PRs labeled `hotfix` or `rollback` merged shortly after a deployment
The dashboard includes both a "Deployment Failure Rate" (status-based) and an optional "Incident-Linked CFR" (issue-based) panel.

#### 5. Deployment Rework Rate *(NEW — added in DORA 2024)*
> *Percentage of deployments that are unplanned work to fix bugs in production.*
>
> This is DORA's newest metric, introduced in the [2024 Accelerate State of DevOps Report](https://dora.dev/research/2024/dora-report/). It captures the ratio of reactive/unplanned deployments vs. planned feature work.

```sql
-- Grafana panel query (stat or time series)
-- Identifies "rework" deployments by matching deployment SHAs to PRs labeled as hotfix/bugfix/rollback
-- or deployments that follow a failed deployment within a short window
WITH classified_deployments AS (
  SELECT
    d.id,
    d.created_at,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM deployment_pull_requests dpr
        JOIN pull_requests pr ON pr.id = dpr.pull_request_id
        WHERE dpr.deployment_id = d.id
        AND pr.labels @> ANY(ARRAY['[{"name":"hotfix"}]','[{"name":"bugfix"}]','[{"name":"rollback"}]']::jsonb[])
      ) THEN true
      WHEN EXISTS (
        SELECT 1 FROM deployment_statuses ds_prev
        JOIN deployments d_prev ON ds_prev.deployment_id = d_prev.id
        WHERE d_prev.environment = d.environment
        AND ds_prev.state IN ('failure', 'error')
        AND d.created_at - d_prev.created_at < INTERVAL '24 hours'
        AND d_prev.created_at < d.created_at
      ) THEN true
      ELSE false
    END AS is_rework
  FROM deployments d
  WHERE d.environment = '$environment'
    AND d.created_at BETWEEN $__timeFrom() AND $__timeTo()
)
SELECT
  date_trunc($__interval, created_at) AS time,
  COUNT(*) FILTER (WHERE is_rework) * 100.0 / NULLIF(COUNT(*), 0) AS rework_rate_percent
FROM classified_deployments
GROUP BY 1
ORDER BY 1;
```

**Identifying rework deployments**: Since GitHub has no native "planned vs unplanned" flag, we use two heuristics:
1. **Label-based**: Deployments linked to PRs with `hotfix`, `bugfix`, or `rollback` labels
2. **Proximity-based**: Deployments that occur within 24 hours after a failed deployment in the same environment

**Prerequisite**: Teams should adopt a convention of labeling hotfix/bugfix PRs. The dashboard displays a warning if no labeled PRs are found.

---

### Operational Performance (Separate from Delivery)

#### Reliability *(Future Enhancement)*
> *The degree to which software meets users' expectations for availability, latency, performance, and scalability.*
>
> DORA treats reliability as an **operational performance** metric, separate from the 5 delivery metrics. It was expanded from "availability" in 2021 to encompass broader SLO compliance.

**Not included in MVP** — Reliability requires data from external monitoring systems (uptime monitors, APM, SLO dashboards) that aren't available from GitHub APIs. Future options:
- Integrate with Grafana's existing monitoring datasources (Prometheus, Datadog, etc.)
- Import SLO compliance data from an external system into PostgreSQL
- Add a manual reliability score entry mechanism

---

### Supplementary Metrics (custom — not available in any built-in dashboard)
- **PR Cycle Time**: from `pull_requests` table (`merged_at - created_at`) — distinct from Claude Code's "PRs per user" metric; this measures the *duration* of the PR lifecycle
- **Incident Resolution Time**: from `issues` table (incident-labeled, `closed_at - created_at`) — operational health context for Failed Deployment Recovery Time

**Removed — already covered by built-in dashboards:**
- ~~CI Job Failure Rate~~ → GitHub Actions Performance dashboard shows this natively with breakdowns by workflow, job, repo, OS, runner
- ~~Security Alert Remediation Time~~ → GitHub Security Overview dashboard (Remediation tab) shows this with severity breakdown and trend charts

---

## Metric Coverage Analysis (Goal Alignment)

The tables below show how this dashboard, combined with GitHub's built-in dashboards, achieves both goals.

### Goal 1 Validation: Complete DORA Coverage

| Metric | Why It's Custom | Nearest Built-in Alternative |
|--------|----------------|------------------------------|
| **Change Lead Time** | Requires joining PRs + Deployments API data | None — no dashboard computes commit/merge-to-deploy time |
| **Deployment Frequency** | Requires filtering Deployments API by environment + success status | None — no native deployment frequency view |
| **Failed Deployment Recovery Time** | Requires correlating failed/success deployment status transitions | None — DORA recovery time not computed anywhere |
| **Change Fail Rate** | Requires linking deployment failures to incident issues | Actions dashboard shows CI job failure rate (different metric) |
| **Deployment Rework Rate** | Requires identifying hotfix/bugfix deployments (DORA 2024) | None — this is a brand new DORA metric |
| **DORA × Copilot Cohort Segmentation** | Requires joining Copilot Usage API with DORA data | None — no dashboard segments DORA by Copilot usage |
| **PR Cycle Time** | Time from PR creation to merge | None — Claude Code tracks PR *count* per user, not cycle *duration* |
| **Incident Resolution Time** | Issue-based incident tracking | None — no dashboard computes this from GitHub Issues |

### Goal 1 Validation: Built-in Dashboards Already Covering Non-DORA Metrics

| Metric | Built-in Dashboard | URL |
|--------|-------------------|-----|
| CI Job Failure Rate (11%) | GitHub Actions Performance | `/orgs/{org}/actions/metrics/performance` |
| Avg Job Run Time, Queue Time | GitHub Actions Performance | `/orgs/{org}/actions/metrics/performance` |
| Breakdown by Workflow/Job/Repo/OS/Runner | GitHub Actions Performance | `/orgs/{org}/actions/metrics/performance` |
| Open security alerts over time | GitHub Security Overview (Detection) | `/orgs/{org}/security/overview` |
| Security alert remediation trends | GitHub Security Overview (Remediation) | `/orgs/{org}/security/overview` |
| Age of alerts, reopened alerts | GitHub Security Overview | `/orgs/{org}/security/overview` |
| IDE active Copilot users (651) | GitHub Copilot Usage | `/orgs/{org}/insights/copilot/usage` |
| Agent adoption (90%) | GitHub Copilot Usage | `/orgs/{org}/insights/copilot/usage` |
| Lines of code changed with AI | GitHub Copilot Code Generation | `/orgs/{org}/insights/copilot/code-generation` |
| Agent contribution %, changes per model | GitHub Copilot Code Generation | `/orgs/{org}/insights/copilot/code-generation` |

### Goal 2 Validation: Claude Code Feature Parity

Claude Code tracks several DORA-adjacent metrics. Our dashboard provides **equivalent metrics using GitHub Copilot data** so teams can compare AI tool impact apples-to-apples.

#### Analytics Dashboard Equivalents

| Claude Code Metric | DORA Relevance | Our Dashboard Equivalent | Panel Name |
|-------------------|----------------|-------------------------|------------|
| **PRs with CC (count + %)** | Lead Time throughput | ✅ PRs by Copilot Cohort (count + %) | "PRs by Copilot Cohort" |
| **Lines of code with CC** | Lead Time velocity | ✅ Lines added/deleted by Copilot Cohort (from PR `additions`/`deletions`) | "Lines Changed by Copilot Cohort" |
| **PRs per user** | Lead Time productivity | ✅ PRs per user split by Copilot Cohort | "PRs per User by Cohort" |
| **Suggestion accept rate** | Code quality proxy | ⚠️ No direct equivalent — GitHub Copilot doesn't expose accept rates per repo via API. Noted as gap. | N/A |
| **DAU / Sessions** | Adoption | ❌ Not duplicated — already in GitHub Copilot Usage dashboard + Claude Code analytics | N/A |
| **Leaderboard** | Adoption | ❌ Not duplicated — Claude Code analytics provides this natively | N/A |

#### OTel Metric Equivalents

| Claude Code OTel Metric | DORA Relevance | Our Dashboard Equivalent |
|-------------------------|----------------|-------------------------|
| `claude_code.pull_request.count` | Lead Time | ✅ PR count from `pull_requests` table, segmented by Copilot cohort |
| `claude_code.commit.count` | Lead Time | ✅ Commit count can be derived from PRs (1 merge commit per merged PR). For finer grain, could add commit fetching. |
| `claude_code.lines_of_code.count` (added/removed) | Lead Time | ✅ PR `additions`/`deletions` from GitHub PR API, segmented by Copilot cohort |
| `claude_code.code_edit_tool.decision` (accept/reject) | CFR proxy | ⚠️ No direct equivalent. Closest proxy: PR review approval rate (could add if review data fetched) |
| `claude_code.active_time.total` | MTTR proxy (time to fix) | ⚠️ No equivalent — GitHub APIs don't track developer session/coding time |
| `claude_code.cost.usage` | ROI | ❌ Out of scope — cost tracking is tool-specific, not a DORA metric |
| `claude_code.session.count` | Adoption | ❌ Not duplicated — adoption metrics covered by built-in dashboards |

#### Gaps Acknowledged

These Claude Code metrics have **no GitHub API equivalent** and cannot be replicated:
- **Suggestion accept rate** — GitHub Copilot tracks this in its own dashboard but doesn't expose per-repo data via API
- **Active coding time** — No GitHub API tracks developer session duration
- **Token/cost usage** — Tool-specific, not a delivery metric

**Key insight**: Our dashboard fills a unique niche — it computes **DORA delivery performance metrics** and **segments them by AI tool adoption cohorts**. Claude Code's analytics focus on attribution and adoption; our dashboard focuses on delivery outcomes. Together they provide the full picture.

---

## Copilot Impact Segmentation — Cohort Definitions

### What Is a Cohort?

A **cohort** is a group of users classified by their Copilot usage pattern during a specific time window. Every PR author, deployment creator, or issue assignee is placed into exactly one cohort for any given measurement period. This allows us to compare DORA metrics between groups: "Did users with Copilot activity have faster lead times than those without?"

### How Cohorts Are Defined

Cohort assignment uses the **GitHub Copilot Usage Metrics API** (`GET /orgs/{org}/copilot/metrics/reports/users-1-day?day={date}`), which returns a list of users who had Copilot activity on each day.

#### Cohort Assignment Rules

| Cohort | Definition | How Determined |
|--------|-----------|----------------|
| **Copilot Active** | User had **at least 1 day** of Copilot activity within the dashboard's selected time range | The user appears in `copilot_user_activity` with `is_active = true` for **any** `activity_date` within `$__timeFrom()` to `$__timeTo()` |
| **Copilot Inactive** | User authored PRs / deployments during the time range but had **zero** Copilot activity days | The user does NOT appear in `copilot_user_activity` with `is_active = true` during the selected time range |

#### Important: What This Does and Does NOT Tell Us

- ✅ **Does tell us**: Whether a user was generally using Copilot during the period — analogous to an A/B test where Group A has access to the tool and Group B does not
- ❌ **Does NOT tell us**: Whether Copilot was specifically used for a particular PR or deployment — the API reports daily user-level activity, not per-PR attribution
- 📝 **Label accordingly**: Dashboard panels use "Authors with Copilot activity" and "Authors without Copilot activity" — never "Copilot-assisted PRs"

#### How This Compares to Claude Code Attribution

| | GitHub Copilot (our approach) | Claude Code |
|---|---|---|
| **Attribution level** | User-level (daily activity) | PR-level (code line matching) |
| **Mechanism** | Copilot Usage Metrics API → user was active on date X | Code matching → PR is labeled `claude-code-assisted` |
| **Precision** | Lower — user may have used Copilot but not for this specific PR | Higher — direct PR-level attribution |
| **Coverage** | Works for all Copilot features (completions, chat, agent) | Only covers Claude Code sessions |

#### Cohort Assignment in the Database

```sql
-- Determine if user is "Copilot Active" for a given dashboard time range:
SELECT DISTINCT user_id
FROM copilot_user_activity
WHERE is_active = true
  AND activity_date BETWEEN $__timeFrom()::date AND $__timeTo()::date;

-- All other PR/deployment authors in the period are "Copilot Inactive"
```

#### Grafana Template Variable

```sql
-- $copilot_cohort dropdown: "All", "Copilot Active", "Copilot Inactive"
SELECT 'All' AS cohort
UNION ALL SELECT 'Copilot Active'
UNION ALL SELECT 'Copilot Inactive';
```

```sql
-- Cohort filter clause (added to every DORA metric panel query)
AND (
  '$copilot_cohort' = 'All'
  OR ('$copilot_cohort' = 'Copilot Active' AND pr.author_user_id IN (
    SELECT user_id FROM copilot_user_activity
    WHERE is_active = true AND activity_date BETWEEN $__timeFrom()::date AND $__timeTo()::date
  ))
  OR ('$copilot_cohort' = 'Copilot Inactive' AND pr.author_user_id NOT IN (
    SELECT user_id FROM copilot_user_activity
    WHERE is_active = true AND activity_date BETWEEN $__timeFrom()::date AND $__timeTo()::date
  ))
)
```

#### Data Source

`GET /orgs/{org}/copilot/metrics/reports/users-1-day?day={date}`

The sync service fetches this daily for each day in the configured range. Each response returns users who had Copilot activity on that specific day, stored in `copilot_user_activity(user_id, activity_date, is_active, metrics_json)`.

---

## Grafana Dashboard Layout

### Dashboard Structure (provisioned via JSON)

```
┌─────────────────────────────────────────────────────────────────┐
│  DORA Metrics Dashboard (dora.dev 2024 Framework)                │
│  [Time range picker ▾] [Environment: $environment ▾]            │
│  [Copilot Cohort: $copilot_cohort ▾] [Last sync: 2 hrs ago]    │
├─────────────────────────────────────────────────────────────────┤
│  Row 1: THROUGHPUT (Stat Panels + sparklines)                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │ Change       │ │ Deployment   │ │ Failed Deployment    │    │
│  │ Lead Time    │ │ Frequency    │ │ Recovery Time        │    │
│  │ 4.2h  ▼     │ │ 5.2/wk  ▲   │ │ 1.3h  ▼             │    │
│  └──────────────┘ └──────────────┘ └──────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  Row 2: INSTABILITY (Stat Panels + sparklines)                   │
│  ┌──────────────┐ ┌──────────────────────┐                      │
│  │ Change       │ │ Deployment           │                      │
│  │ Fail Rate    │ │ Rework Rate          │                      │
│  │ 8%   ▼      │ │ 12%  ▼              │                      │
│  └──────────────┘ └──────────────────────┘                      │
├─────────────────────────────────────────────────────────────────┤
│  Row 3: Throughput Trends (Time Series Panels)                   │
│  ┌──────────────────────┐ ┌──────────────────────┐              │
│  │ Change Lead Time     │ │ Deployment Frequency │              │
│  │ [line chart, median] │ │ [area chart, count]  │              │
│  └──────────────────────┘ └──────────────────────┘              │
│  ┌──────────────────────────────────────────────┐               │
│  │ Failed Deployment Recovery Time (trend)      │               │
│  │ [line chart, median hours]                   │               │
│  └──────────────────────────────────────────────┘               │
├─────────────────────────────────────────────────────────────────┤
│  Row 4: Instability Trends (Time Series Panels)                  │
│  ┌──────────────────────┐ ┌──────────────────────┐              │
│  │ Change Fail Rate     │ │ Deployment Rework    │              │
│  │ [bar chart, %]       │ │ Rate [bar chart, %]  │              │
│  └──────────────────────┘ └──────────────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│  Row 5: Copilot Cohort Comparison (Bar Chart Panels)             │
│  ┌──────────────────────────────────────────────┐               │
│  │ DORA Metrics by Copilot Cohort               │               │
│  │ [grouped bar: Active vs Inactive, 5 metrics] │               │
│  └──────────────────────────────────────────────┘               │
├─────────────────────────────────────────────────────────────────┤
│  Row 6: Copilot Productivity (Claude Code equivalents)           │
│  ┌──────────────┐ ┌──────────────────┐ ┌──────────────┐        │
│  │ PRs by       │ │ Lines Changed    │ │ PRs per User │        │
│  │ Cohort       │ │ by Cohort        │ │ by Cohort    │        │
│  │ Active: 72%  │ │ +12k / -3k      │ │ Active: 2.4  │        │
│  │ Inactive: 28%│ │ vs +4k / -1k    │ │ Inactive: 1.1│        │
│  └──────────────┘ └──────────────────┘ └──────────────┘        │
├─────────────────────────────────────────────────────────────────┤
│  Row 7: Supplementary Metrics                                    │
│  ┌──────────────┐ ┌──────────────────┐                           │
│  │ PR Cycle     │ │ Incident         │                           │
│  │ Time: 6h     │ │ Resolution: 4.2h │                           │
│  └──────────────┘ └──────────────────┘                           │
├─────────────────────────────────────────────────────────────────┤
│  Row 8: Detail Tables (collapsible)                              │
│  [Recent Deployments] [Recent PRs] [Open Incidents]              │
│  [Rework Deployments — hotfix/bugfix PRs]                        │
└─────────────────────────────────────────────────────────────────┘
```

### Grafana Template Variables

| Variable | Type | Query | Purpose |
|----------|------|-------|---------|
| `$environment` | Query | `SELECT DISTINCT environment FROM deployments ORDER BY environment` | Filter all panels by deployment environment |
| `$copilot_cohort` | Custom | `All, Copilot Active, Copilot Inactive` | Segment DORA metrics by Copilot user cohort |

Grafana's **native time range picker** handles time period filtering — no custom implementation needed.

### Annotations

- **Deployment markers**: Show production deployments as vertical lines on time series charts
- **Incident markers**: Show incident creation/closure as annotations

---

## Project Structure

```
CustomMetricsDashboard/
├── package.json                    # Node.js sync service dependencies
├── tsconfig.json
├── .env.example                    # GITHUB_TOKEN, GITHUB_ORG, GITHUB_REPO, PG connection
├── DORAMetricsAnalysis.md          # (existing) reference document
├── README.md                       # Setup, configuration, usage guide
│
├── src/                            # Node.js Sync Service
│   ├── index.ts                    # Express server entry point (port 3001)
│   ├── config.ts                   # Environment variable loading + validation
│   │
│   ├── github/                     # GitHub API fetchers (all via Octokit)
│   │   ├── client.ts              # Octokit instance + auth config
│   │   ├── deployments.ts         # Fetch deployments + statuses
│   │   ├── pull-requests.ts       # Fetch merged PRs
│   │   ├── workflow-runs.ts       # Fetch workflow runs
│   │   ├── issues.ts             # Fetch incident-labeled issues
│   │   ├── code-scanning.ts      # Fetch code scanning alerts
│   │   ├── copilot-users.ts      # Fetch Copilot usage metrics
│   │   └── pagination.ts         # Generic Octokit pagination helper
│   │
│   ├── db/
│   │   ├── connection.ts          # PostgreSQL connection pool (pg)
│   │   ├── schema.sql             # Full schema DDL (run on first setup)
│   │   └── migrations/            # Future schema changes
│   │
│   ├── sync/
│   │   ├── orchestrator.ts        # Coordinates full incremental sync
│   │   ├── bridge-resolver.ts     # Deployment ↔ PR SHA resolution
│   │   └── state.ts              # sync_state read/write helpers
│   │
│   ├── routes/
│   │   ├── sync.ts               # POST /api/sync — trigger sync
│   │   └── status.ts             # GET /api/sync/status — job status
│   │
│   └── types.ts                   # Shared TypeScript types
│
├── grafana/                        # Grafana provisioning (dashboard-as-code)
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── postgres.yml      # PostgreSQL datasource config
│   │   └── dashboards/
│   │       └── dashboard.yml     # Dashboard provider config
│   │
│   └── dashboards/
│       └── dora-metrics.json     # Main DORA dashboard definition
│
├── scripts/
│   ├── setup-db.sh               # Create PostgreSQL database + run schema
│   ├── setup-grafana.sh          # Install Grafana OSS + copy provisioning
│   ├── sync-cron.sh             # Cron wrapper: calls POST /api/sync
│   └── seed.ts                  # Seed DB with realistic test data from a real repo
│
├── seed/
│   ├── config.ts                 # Seed configuration (target repo, date ranges, counts)
│   ├── generator.ts             # Generates realistic records that match real API shapes
│   └── README.md                # Seed usage: npm run seed vs npm run sync
│
└── .gitignore                     # Ignores .env, node_modules, etc.
```

---

## Data Seeding Strategy

### Goal
Provide a way to seed the PostgreSQL database with realistic test data for development and demo purposes, structured **identically** to what the real sync service produces. Swapping from seeded data to a real repo should be seamless — just run `npm run sync` instead of `npm run seed`.

### Design Principle: Same Schema, Same Shape
The seed data writes to the **exact same tables** as the real sync engine. There is no separate "test schema" — seeded records are indistinguishable from real records at the database level. This guarantees that:
- Grafana dashboard queries work identically on seeded and real data
- Switching from seed to real data = `TRUNCATE` all tables + run sync against a real repo
- No code changes needed when transitioning

### Seed Approach: Hybrid (Real Structure + Synthetic Events)

The seeder uses the `octodemo/bootstrap` repo as a **reference model** but generates synthetic event data:

1. **Users**: Generate 15-20 realistic GitHub users with numeric IDs and logins. A configurable percentage (e.g., 70%) are marked as "Copilot Active" in `copilot_user_activity`.

2. **Pull Requests**: Generate 100+ PRs over the past 90 days with realistic distributions:
   - Varying cycle times (1h to 5 days, skewed toward shorter)
   - Mix of states (merged, closed, open)
   - Some labeled `hotfix`, `bugfix`, or `rollback` (for rework rate)
   - Each assigned to a random user from the user pool

3. **Deployments**: Generate production deployments linked to merged PRs:
   - Realistic deploy frequency (2-8 per week)
   - Each deployment has a SHA matching a merged PR's `merge_commit_sha`
   - `deployment_pull_requests` bridge records created automatically
   - Multiple environments (production, staging)

4. **Deployment Statuses**: For each deployment, generate status history:
   - ~85% succeed (status: `success`)
   - ~15% fail (status: `failure` or `error`)
   - Failed deployments get a subsequent recovery deployment within 0.5-12 hours

5. **Issues (incidents)**: Generate incident-labeled issues:
   - Created within 0-24 hours after a failed deployment
   - Closed 1-48 hours after creation (for MTTR/recovery time)
   - Some linked to specific deployments

6. **Workflow Runs**: Generate CI runs:
   - ~89% success, ~11% failure (matching real observed rates)
   - Realistic run times (30s to 15min)

7. **Code Scanning Alerts**: Generate security alerts:
   - Mix of severities (critical, high, medium, low)
   - ~60% fixed (with `fixed_at` timestamps), ~40% open

8. **Copilot User Activity**: Daily activity records for the user pool:
   - 70% of users active on any given day
   - Metrics JSON with realistic values

### Seed Configuration (`seed/config.ts`)

```typescript
export const SEED_CONFIG = {
  // Reference repo (structure only — not fetching real data)
  referenceRepo: 'octodemo/bootstrap',
  
  // Data generation parameters
  timeRange: {
    startDays: 90,    // Generate data going back N days
    endDate: 'now',
  },
  counts: {
    users: 18,
    pullRequests: 120,
    deploymentsPerWeek: { min: 2, max: 8 },
    incidentRatio: 0.15,         // 15% of deployments trigger incidents
    hotfixRatio: 0.12,           // 12% of deployments are rework
    copilotActiveRatio: 0.70,    // 70% of users have Copilot activity
  },
  environments: ['production', 'staging'],
  
  // DORA target ranges (to validate seeded data produces reasonable metrics)
  expectedMetrics: {
    deploymentFrequency: '3-6/week',
    changeLeadTime: '2-24 hours',
    changeFailRate: '10-20%',
    failedDeploymentRecoveryTime: '0.5-12 hours',
    deploymentReworkRate: '8-15%',
  },
};
```

### CLI Commands

```bash
# Seed the database with test data (wipes existing data first)
npm run seed

# Seed with custom parameters
npm run seed -- --users 25 --days 180 --deploy-rate 10

# Sync real data from GitHub (replaces seeded data)
npm run sync

# Verify seeded data produces valid DORA metrics
npm run seed:verify
```

### `npm run seed:verify`
After seeding, this command runs the same SQL queries that Grafana uses and prints a summary:
```
✓ Change Lead Time:           median 6.2 hours
✓ Deployment Frequency:       4.8/week
✓ Failed Deploy Recovery:     median 2.4 hours
✓ Change Fail Rate:           13.2%
✓ Deployment Rework Rate:     11.8%
✓ Users (Copilot Active):     13/18 (72%)
✓ Total PRs:                  120
✓ Total Deployments:          52
✓ Incident Issues:            8
```

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
```
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
```

**Validation criteria**:
1. `npx vitest run` passes all unit tests (zero failures)
2. `npx playwright test` passes all E2E tests against seeded PG + Grafana
3. CI workflow runs both jobs successfully on push/PR
4. Failed E2E uploads `playwright-report/` as artifact

---

## Testing Strategy

### Why Two Layers

| Layer | Purpose | Who Runs It | Infrastructure |
|-------|---------|-------------|----------------|
| **Unit (Vitest)** | Fast feedback — coding agents run after every change | Coding agent locally, CI | None |
| **E2E (Playwright)** | Full-stack confidence — dashboard actually renders with real data | CI only (GitHub Actions) | PG + Grafana containers |

Unit tests validate code correctness **instantly** (no DB, no containers). E2E tests validate the **whole system works** in CI. Together they cover the critical path without over-engineering.

### Unit Tests (Vitest, no infrastructure)

Run with `npx vitest run` — coding agents should run this after every code change.

**Config** (`tests/config.test.ts`):
- Throws on missing `GITHUB_TOKEN`, missing `PG_*` vars
- Returns valid config when all vars present

**Fetchers** (`tests/fetchers/*.test.ts`):
- Mock Octokit, verify correct API endpoint + pagination params per fetcher
- Verify `since` parameter for incremental fetch
- Verify rate limit backoff on `X-RateLimit-Remaining: 0`

**Seed Generator** (`tests/seed-generator.test.ts`):
- Output shapes match DB schema column types
- Counts match config (users: 18, PRs: 120)
- Distributions within tolerance (~15% failures, ~12% rework, ~70% Copilot active)
- Timestamps relative to `Date.now()` within 90-day window
- Deployment SHAs match linked PRs' `merge_commit_sha`

**Bridge Resolver** (`tests/bridge-resolver.test.ts`):
- Direct SHA match works
- Squash merge fallback works
- No match returns empty (doesn't error)

### E2E Tests (Playwright, runs in CI)

Run with `npx playwright test` — requires PG + Grafana service containers (CI only).

**Test suite** (`e2e/dashboard.spec.ts`):
- Dashboard loads without error panels
- Stat panels in Rows 1–2 show numeric values (not "No data")
- Template variable dropdowns work (`$environment`, `$copilot_cohort`) — no errors after filtering
- Time range selector changes results
- Detail tables in Row 8 have rows
- Empty state: date range with no data shows "No data" gracefully

**Grafana readiness** (`e2e/helpers/wait-for-grafana.ts`):
Multi-layer wait to avoid flaky tests — health API → datasource check → panel-loading hidden.

### CI Pipeline (GitHub Actions)

```yaml
name: Tests
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18 }
      - run: npm ci
      - run: npx vitest run

  e2e:
    runs-on: ubuntu-latest
    needs: unit
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: dora_metrics_test
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      grafana:
        image: grafana/grafana:11.0.0
        env:
          GF_SECURITY_ADMIN_PASSWORD: admin
        ports: ["3000:3000"]
        options: >-
          --health-cmd "curl --fail http://localhost:3000/api/health || exit 1"
          --health-interval 10s --health-timeout 10s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: psql -h localhost -U test -d dora_metrics_test -f src/db/schema.sql
        env: { PGPASSWORD: test }
      - run: npm run seed
        env: { PG_HOST: localhost, PG_PORT: "5432", PG_USER: test, PG_PASSWORD: test, PG_DATABASE: dora_metrics_test }
      - name: Provision Grafana
        run: |
          curl -s -X POST http://admin:admin@localhost:3000/api/datasources \
            -H "Content-Type: application/json" \
            -d '{"name":"DORA PostgreSQL","type":"postgres","url":"localhost:5432","database":"dora_metrics_test","user":"test","secureJsonData":{"password":"test"},"jsonData":{"sslmode":"disable","postgresVersion":1500}}'
          curl -s -X POST http://admin:admin@localhost:3000/api/dashboards/db \
            -H "Content-Type: application/json" \
            -d "{\"dashboard\": $(cat grafana/dashboards/dora-metrics.json), \"overwrite\": true}"
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

Pin Grafana image version (e.g., `11.0.0`) to prevent selector drift across upgrades.

---

## Bare Metal Deployment Guide

### Service Architecture (no Docker)

```
┌─────────────────────────────────────────────────┐
│  Host Machine                                    │
│                                                  │
│  [systemd] grafana-server    ── port 3000 ──►   │
│  [systemd] postgresql        ── port 5432       │
│  [systemd] dora-sync-service ── port 3001       │
│  [cron]    sync every 6h     ── calls :3001     │
│                                                  │
│  Optional: [nginx/caddy] reverse proxy ── :443  │
└─────────────────────────────────────────────────┘
```

### Setup Steps (documented in README)

1. **Install PostgreSQL** — system package, create `dora_metrics` database
2. **Run schema** — `psql -d dora_metrics -f src/db/schema.sql`
3. **Install Node.js ≥ 18** — system package or nvm
4. **Install sync service** — `npm install && npm run build`
5. **Configure .env** — copy `.env.example`, fill in PAT + PG credentials + repo config
6. **Start sync service** — `node dist/index.js` or register as systemd service
7. **Run initial sync** — `curl -X POST http://localhost:3001/api/sync`
8. **Install Grafana OSS** — system package
9. **Copy provisioning files** — datasource YAML + dashboard JSON to Grafana's provisioning dirs
10. **Start Grafana** — `systemctl start grafana-server`
11. **Set up cron** — add `scripts/sync-cron.sh` to crontab

---

## Notes & Considerations

- **Rate Limits**: A single-repo incremental sync should stay well within 5,000 req/hr PAT limits. The most expensive operation is the initial backfill. The sync service includes rate limit detection and backoff.
- **Copilot Metrics API**: Requires `admin:org` scope. The new `/copilot/metrics/reports/` endpoints replace the legacy `/copilot/metrics` (sunset announced Jan 2026). Verify endpoint availability before implementation.
- **Incident Labeling Convention**: Change Fail Rate accuracy improves when teams consistently label issues with `incident`. The dashboard displays a warning annotation if no incident-labeled issues are found.
- **Rework Labeling Convention (DORA 2024)**: Deployment Rework Rate requires identifying unplanned/reactive deployments. Teams should adopt a convention of labeling hotfix/bugfix PRs with `hotfix`, `bugfix`, or `rollback`. The dashboard also uses a proximity heuristic (deployments within 24h of a failure) as a fallback.
- **PostgreSQL Maintenance**: For a small team / single repo, PostgreSQL requires minimal maintenance. Consider adding `VACUUM ANALYZE` to the cron schedule.
- **Security**: The PAT is stored in `.env` (never committed). PostgreSQL listens on localhost only. Grafana runs on localhost or behind a reverse proxy with TLS.
- **Dashboard Versioning**: The Grafana dashboard JSON is version-controlled in `grafana/dashboards/`. Changes made in the Grafana UI can be exported back to JSON.
- **Grafana Panel SQL**: All DORA metric queries are written as raw SQL in Grafana panel definitions. This means metric logic lives in the dashboard JSON, not in application code. The sync service only handles data collection — computation happens at query time in PostgreSQL.
