# Custom DORA + Copilot Impact Dashboard — Implementation Plan v2

> **Version**: 2.1 — Full rebuild from scratch  
> **Supersedes**: `ImplementationPlan.md` (v1)  
> **Key changes**: Raw-first ELT architecture; exact API field names; 28-day Copilot window; no deprecated endpoints; one dashboard per DORA pillar; panel descriptions with caveats; data mode indicator (seed/demo/live)

---

## Goals

### Goal 1: Complete DORA Metric Coverage

GitHub provides excellent built-in dashboards for CI/CD, security, and Copilot adoption — but **none compute the official DORA software delivery metrics** (per [dora.dev](https://dora.dev/guides/dora-metrics-four-keys/)). This dashboard fills that gap using GitHub API data:

| DORA Metric | GitHub Built-in? | This Dashboard |
|---|:-:|:-:|
| Change Lead Time | ❌ | ✅ |
| Deployment Frequency | ❌ | ✅ |
| Failed Deployment Recovery Time | ❌ | ✅ |
| Change Fail Rate | ❌ (Actions shows CI failure rate — different) | ✅ |
| Deployment Rework Rate | ❌ | ✅ |

### Goal 2: Feature Parity with Claude Code Analytics

GitHub Copilot lacks PR-centric contribution metrics that Claude Code provides. This dashboard fills that gap by deriving equivalent metrics from GitHub API data:

| Claude Code Metric | This Dashboard Equivalent |
|---|---|
| PRs with CC (count + %) | Copilot-attributed PRs (count + %) |
| Lines of code with CC in merged PRs | Lines in Copilot-attributed PRs |
| PRs per user per day | PRs per user chart, segmented by seat |
| Top contributors leaderboard | Leaderboard: PRs + lines by Copilot users |
| Lines of code accepted | Org-level lines accepted (Copilot Metrics API) |
| —not provided— | DORA metrics segmented by Copilot cohort |

**Result**: GitHub Copilot users get a productivity narrative that matches Claude Code — plus DORA metrics that Claude Code cannot provide.

---

## Architectural Principles

> These principles are non-negotiable. Every design decision flows from them.

### 1. ELT, Not ETL

**Extract → save raw files → Load verbatim → Transform only at query time in Grafana SQL.**

- The sync service is a *data courier*, not a data processor
- All interpretation of what data *means* lives in Grafana panel SQL where it is visible, reviewable, and editable
- No views, stored procedures, or application-layer transformations

### 2. Schema Mirrors API Exactly

- Column names = API field names (e.g., `merge_commit_sha`, `user_login`, `last_activity_at`)
- Nullability matches API (if the API can return `null`, the column is `NULL`-able with no default)
- No derived columns (no `is_active` boolean computed from counts, no `github_user_id` that stores a hash)
- Flat scalar fields from nested objects use underscore-joined names (`user_login`, `user_id`)
- Array/object fields that can't be flattened sensibly (labels, reviewers, etc.) use JSONB

### 3. Raw File Dumps

Before every DB insert, the raw JSON response is saved to `data/raw/{endpoint}/{YYYY-MM-DD}.json`. These files:
- Enable debugging and auditing without re-hitting the API
- Provide a replay capability if schema drift requires a DB reingest
- Are git-ignored (no secrets committed)

### 4. Schema Mismatch Detection at Sync Time

At the start of each sync run, for each table:
1. Fetch one API response record to get its keys
2. Query `information_schema.columns` to get the DB table's column names
3. Check: every API key must exist as a DB column (one-directional — DB can have extra columns like `id`, `fetched_at`)
4. If any API key is missing from DB: abort sync, surface error message in Grafana

This catches the most impactful failure mode: GitHub adds a field, the column doesn't exist, silently losing data. The check is one metadata query per table — negligible overhead.

### 5. Fully Consistent Approach

All tables — DORA (pull_requests, deployments, etc.) and Copilot (seats, org_metrics) — follow identical principles. No special-casing, no legacy exceptions.

### 6. 28-Day Window for Copilot Data

The GitHub Copilot Metrics API retains only 28 days of data. All Copilot-related tables use a 28-day rolling window. DORA tables (pull_requests, deployments, etc.) accumulate full history via incremental sync.

### 7. Use Official Octokit SDK Methods

Never use undocumented endpoints or `octokit.request()` with `as any` casts. If an endpoint isn't in `octokit.rest.*`, use `octokit.request()` with proper TypeScript typing — not `as any`.

#### ⚠️ Legacy vs. Current Copilot Metrics API

| Feature | Legacy API ❌ RETIRED | Current API ✅ |
|---|---|---|
| Octokit method | `octokit.rest.copilot.usageMetricsForOrg` | `octokit.rest.copilot.getUsageMetricsForOrg` |
| REST endpoint | `GET /orgs/{org}/copilot/metrics` | `GET /orgs/{org}/copilot/usage-metrics/reports/org-28-day/latest` |
| Data delivery | Direct JSON response body | `download_links[]` → fetch each signed URL |
| Report format | JSON object | **NDJSON** (Newline Delimited JSON — one object per line) |
| Granularity | Basic aggregates (seats, total LoC) | Per-IDE, language, model, feature; Chat, CLI, PRs, Agents |
| Status | **Retired April 2, 2026** — returns errors | Active / current standard |

> **Rule**: Never call `octokit.rest.copilot.usageMetricsForOrg`. It is retired and returns errors as of April 2, 2026.

**Copilot endpoints to use**:
- `octokit.rest.copilot.listCopilotSeats` → `GET /orgs/{org}/copilot/billing/seats` (per-user seat info, inline JSON)
- `octokit.rest.copilot.getUsageMetricsForOrg({ org })` → `GET /orgs/{org}/copilot/usage-metrics/reports/org-28-day/latest` (returns `download_links` to NDJSON)
- `octokit.request('GET /orgs/{org}/copilot/usage-metrics/reports/users-28-day/latest', ...)` → per-user 28-day (returns `download_links` to NDJSON)
- Optional enterprise variants: `GET /enterprises/{enterprise}/copilot/usage-metrics/reports/enterprise-28-day/latest` and `users-28-day/latest`

**Two-step fetch pattern** (applies to all `/reports/` endpoints):
1. Call the Octokit method/request to get `download_links` (signed URLs — not the data)
2. `fetch()` each URL → parse as **NDJSON** (line-by-line, `text.split('\n')`) — **not** `res.json()`

### 8. Sync Trigger Model

- **On startup**: `docker-compose up` runs a one-shot `sync` service that performs initial data load, then exits
- **Mid-session**: `POST /api/sync` endpoint triggers an immediate re-sync (closes old data, restarts with fresh 28-day window for Copilot data, incremental for DORA data)
- No cron needed for local use

---

## Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Dashboard | Grafana OSS | Native time series, stat panels, tables, template variables, direct PostgreSQL support — no custom frontend |
| GitHub SDK | `@octokit/rest` | Official Node.js SDK — typed endpoints, pagination helpers, rate limit handling |
| Database | PostgreSQL 16+ | Native Grafana datasource, robust JSONB support, strong typing |
| Sync Service | Node.js 20 + Express | Lightweight HTTP server for sync trigger; TypeScript for type safety |
| Containerization | Docker + docker-compose | Local development; sync service + PostgreSQL + Grafana in one `up` |
| Testing | Vitest + Playwright | Unit tests (no infra needed) + E2E tests (full-stack CI) |

---

## Authentication

### GitHub API (PAT)

- **Classic PAT** (not fine-grained — Copilot org endpoints may not support fine-grained)
- Required scopes: `repo`, `read:org`, `admin:org`, `actions`
- Stored in `.env` as `GITHUB_TOKEN`
- Best practice: use an org-owned service account

### Grafana

- Default admin on localhost for local use
- Optional: configure GitHub OAuth (`auth.github` in `grafana.ini`) for team access

### PostgreSQL

- Local connections only (no external exposure)
- Credentials in `.env` for sync service, provisioned YAML for Grafana datasource

---

## Data Architecture

### True API Limitations (Not Data Layer Issues)

The following are genuine constraints of the GitHub API — not fixable by architecture changes:

| Limitation | Impact | Dashboard Response |
|---|---|---|
| **No per-PR Copilot attribution** — API doesn't indicate which PRs used Copilot | Attribution is proxy-based ("author has active seat") | Document clearly as caveat on every PR-attribution panel |
| **28-day Copilot retention** — org metrics and user metrics APIs return last 28 days | Copilot history limited to rolling 28-day window | Dashboard default = last 28 days for Copilot panels |
| **Per-user data is org-scoped** — `users-28-day` requires org admin or fine-grained "Organization Copilot metrics" read permission | May not be available in all environments | Gracefully degrade: if user metrics endpoint returns 403/404, show org-level aggregates only |

---

## Database Schema

> All column names match GitHub API field names exactly. No invented names.
> Nullable fields match API (if GitHub can return `null`, column is nullable with no DEFAULT).

```sql
-- ╔═══════════════════════════════════════════════════════╗
-- ║  SCHEMA: CustomMetricsDashboard (v2)                   ║
-- ╚═══════════════════════════════════════════════════════╝

-- ─── Infrastructure ──────────────────────────────────────

CREATE TABLE sync_state (
  resource       TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ,
  cursor         TEXT             -- pagination cursor or ETag
);

CREATE TABLE sync_jobs (
  id             SERIAL PRIMARY KEY,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'running',  -- running, success, failed
  records_synced JSONB,           -- { "pull_requests": 42, "deployments": 8, ... }
  error_message  TEXT
);

-- ─── DORA: Pull Requests ─────────────────────────────────
-- Source: GET /repos/{owner}/{repo}/pulls (+ individual PR for additions/deletions)
-- Field names: exact match to GitHub PR API response

CREATE TABLE pull_requests (
  id                SERIAL PRIMARY KEY,
  number            INT NOT NULL UNIQUE,
  title             TEXT,
  state             TEXT NOT NULL,       -- open, closed
  body              TEXT,
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  merged_at         TIMESTAMPTZ,
  merge_commit_sha  TEXT,
  draft             BOOLEAN,
  additions         INT,                 -- populated via individual PR fetch
  deletions         INT,
  changed_files     INT,
  user_login        TEXT,                -- from user.login
  user_id           BIGINT,             -- from user.id (real GitHub ID, not hashed)
  merged_by_login   TEXT,               -- from merged_by.login (null if not merged)
  merged_by_id      BIGINT,
  head_sha          TEXT,               -- from head.sha
  head_ref          TEXT,               -- from head.ref (branch name)
  base_ref          TEXT,               -- from base.ref (target branch)
  labels            JSONB,              -- array of {id, name, color} objects
  requested_reviewers JSONB,            -- array of user objects
  assignees         JSONB,              -- array of user objects
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pr_merged_at   ON pull_requests(merged_at);
CREATE INDEX idx_pr_created_at  ON pull_requests(created_at);
CREATE INDEX idx_pr_user_id     ON pull_requests(user_id);

-- ─── DORA: Deployments ───────────────────────────────────
-- Source: GET /repos/{owner}/{repo}/deployments

CREATE TABLE deployments (
  id                    SERIAL PRIMARY KEY,
  deployment_id         BIGINT NOT NULL UNIQUE,  -- GitHub's id field
  sha                   TEXT NOT NULL,
  ref                   TEXT,
  task                  TEXT,
  environment           TEXT NOT NULL,
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ,
  creator_login         TEXT,                    -- from creator.login
  creator_id            BIGINT,                  -- from creator.id
  payload               JSONB,
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dep_created_at   ON deployments(created_at);
CREATE INDEX idx_dep_environment  ON deployments(environment);
CREATE INDEX idx_dep_sha          ON deployments(sha);

-- ─── DORA: Deployment Statuses ───────────────────────────
-- Source: GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses

CREATE TABLE deployment_statuses (
  id              SERIAL PRIMARY KEY,
  deployment_id   BIGINT NOT NULL REFERENCES deployments(deployment_id),
  state           TEXT NOT NULL,     -- pending, success, failure, error, inactive, queued, in_progress
  description     TEXT,
  environment     TEXT,
  environment_url TEXT,
  creator_login   TEXT,
  creator_id      BIGINT,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_depstatus_deployment_id ON deployment_statuses(deployment_id);
CREATE INDEX idx_depstatus_state         ON deployment_statuses(state);

-- ─── DORA: Deployment ↔ PR Bridge ────────────────────────
-- Populated by bridge-resolver: matches deployment sha to PR merge_commit_sha

CREATE TABLE deployment_pull_requests (
  deployment_id  BIGINT NOT NULL REFERENCES deployments(deployment_id),
  pr_number      INT NOT NULL REFERENCES pull_requests(number),
  match_type     TEXT NOT NULL,   -- 'direct_sha' or 'squash_fallback'
  PRIMARY KEY (deployment_id, pr_number)
);

-- ─── DORA: Issues (incidents) ────────────────────────────
-- Source: GET /repos/{owner}/{repo}/issues

CREATE TABLE issues (
  id             SERIAL PRIMARY KEY,
  number         INT NOT NULL UNIQUE,
  title          TEXT,
  state          TEXT NOT NULL,    -- open, closed
  body           TEXT,
  created_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ,
  closed_at      TIMESTAMPTZ,
  user_login     TEXT,
  user_id        BIGINT,
  assignee_login TEXT,
  assignee_id    BIGINT,
  labels         JSONB,            -- array of {id, name, color}
  assignees      JSONB,
  milestone      JSONB,
  pull_request   JSONB,            -- present if issue is also a PR (null for pure issues)
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_issues_created_at ON issues(created_at);
CREATE INDEX idx_issues_state      ON issues(state);

-- ─── DORA: Workflow Runs ─────────────────────────────────
-- Source: GET /repos/{owner}/{repo}/actions/runs

CREATE TABLE workflow_runs (
  id               SERIAL PRIMARY KEY,
  run_id           BIGINT NOT NULL UNIQUE,  -- GitHub's id field
  name             TEXT,
  workflow_id      BIGINT,
  head_branch      TEXT,
  head_sha         TEXT,
  run_number       INT,
  event            TEXT,
  status           TEXT,                    -- queued, in_progress, completed
  conclusion       TEXT,                    -- success, failure, cancelled, skipped, timed_out, etc.
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ,
  run_started_at   TIMESTAMPTZ,
  run_attempt      INT,
  actor_login      TEXT,
  actor_id         BIGINT,
  triggering_actor_login TEXT,
  triggering_actor_id    BIGINT,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_runs_created_at  ON workflow_runs(created_at);
CREATE INDEX idx_workflow_runs_head_sha    ON workflow_runs(head_sha);

-- ─── Copilot: Org-Level Daily Metrics ───────────────────────────────────────
-- Source: GET /orgs/{org}/copilot/usage-metrics/reports/org-28-day/latest
-- Octokit: octokit.rest.copilot.getUsageMetricsForOrg({ org })
-- Returns download_links → fetch each signed URL → parse NDJSON (line-by-line).
-- Each NDJSON object contains a "day_totals" array; flatten: one DB row per day_totals[i].
-- Column names match the API JSON field names exactly (per raw-first principle).
-- API version: 2026-03-10  |  Scope: read:org or "Organization Copilot metrics" read

CREATE TABLE copilot_org_metrics (
  id                               SERIAL PRIMARY KEY,
  day                              DATE NOT NULL UNIQUE, -- from day_totals[].day
  organization_id                  TEXT,                 -- from day_totals[].organization_id
  daily_active_users               INTEGER,
  weekly_active_users              INTEGER,
  monthly_active_users             INTEGER,
  monthly_active_agent_users       INTEGER,
  monthly_active_chat_users        INTEGER,
  daily_active_cli_users           INTEGER,              -- omitted by API if no CLI usage
  code_acceptance_activity_count   INTEGER,
  code_generation_activity_count   INTEGER,
  user_initiated_interaction_count INTEGER,
  loc_suggested_to_add_sum         INTEGER,
  loc_suggested_to_delete_sum      INTEGER,
  loc_added_sum                    INTEGER,
  loc_deleted_sum                  INTEGER,
  -- Nested objects stored as JSONB (raw from API, queried with jsonb_array_elements())
  pull_requests                    JSONB,   -- { total_created, total_merged, total_created_by_copilot,
                                            --   total_reviewed_by_copilot, median_minutes_to_merge,
                                            --   median_minutes_to_merge_copilot_authored, ... }
  totals_by_feature                JSONB,   -- [{feature, code_acceptance_activity_count, loc_added_sum, ...}]
  totals_by_ide                    JSONB,   -- [{ide, code_acceptance_activity_count, ...}]
  totals_by_language_feature       JSONB,   -- [{language, feature, ...}]
  totals_by_language_model         JSONB,   -- [{language, model, ...}] (may be empty)
  totals_by_model_feature          JSONB,   -- [{model, feature, ...}] (may be empty)
  totals_by_cli                    JSONB,   -- {session_count, request_count, token_usage, ...}
  fetched_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_copilot_org_metrics_day ON copilot_org_metrics(day);

-- ─── Copilot: Per-User Seat Data ─────────────────────────
-- Source: GET /orgs/{org}/copilot/billing/seats
-- Octokit: octokit.rest.copilot.listCopilotSeats
-- Represents current seat assignment snapshot; table is wiped and reloaded on sync

CREATE TABLE copilot_seats (
  id                        SERIAL PRIMARY KEY,
  assignee_login            TEXT NOT NULL,   -- from assignee.login
  assignee_id               BIGINT NOT NULL UNIQUE,  -- from assignee.id
  assignee_type             TEXT,             -- from assignee.type (User, Team, etc.)
  created_at                TIMESTAMPTZ,      -- seat assignment date
  updated_at                TIMESTAMPTZ,
  pending_cancellation_date DATE,
  last_activity_at          TIMESTAMPTZ,      -- last time user used Copilot
  last_activity_editor      TEXT,             -- e.g. "vscode", "jetbrains", "cli"
  plan_type                 TEXT,             -- business, enterprise, etc.
  fetched_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_copilot_seats_assignee_id       ON copilot_seats(assignee_id);
CREATE INDEX idx_copilot_seats_last_activity_at  ON copilot_seats(last_activity_at);

-- ─── Copilot User Metrics (per-user daily, from users-28-day download) ────────
-- Source: GET /orgs/{org}/copilot/usage-metrics/reports/users-28-day/latest
-- Returns download_links → fetch each signed URL → parse NDJSON (line-by-line).
-- Each NDJSON line is one user-day record. Column names match JSON field names exactly.
-- API version: 2026-03-10  |  Scope: read:org or "Organization Copilot metrics" read
-- See example schema: https://docs.github.com/en/copilot/reference/copilot-usage-metrics/example-schema

CREATE TABLE copilot_user_metrics (
  id                               SERIAL PRIMARY KEY,
  day                              DATE NOT NULL,     -- from "day" field
  user_id                          BIGINT,            -- from "user_id"
  user_login                       TEXT NOT NULL,     -- from "user_login"
  enterprise_id                    TEXT,              -- from "enterprise_id" (populated when using enterprise endpoint)
  organization_id                  TEXT,              -- from "organization_id" (API only, org-scoped)
  user_initiated_interaction_count INTEGER,           -- explicit prompts sent to Copilot
  code_generation_activity_count   INTEGER,           -- distinct Copilot output events
  code_acceptance_activity_count   INTEGER,           -- suggestions/blocks accepted
  loc_suggested_to_add_sum         INTEGER,           -- lines Copilot suggested to add
  loc_suggested_to_delete_sum      INTEGER,           -- lines Copilot suggested to delete
  loc_added_sum                    INTEGER,           -- lines actually added (accepted + agent edits)
  loc_deleted_sum                  INTEGER,           -- lines deleted (agent edits)
  used_agent                       BOOLEAN,           -- used agent mode that day
  used_chat                        BOOLEAN,           -- used IDE chat that day
  used_cli                         BOOLEAN,           -- used Copilot CLI that day
  used_copilot_code_review_active  BOOLEAN,           -- actively engaged with Copilot code review
  used_copilot_code_review_passive BOOLEAN,           -- Copilot auto-assigned to review their PR
  -- Nested breakdowns stored as JSONB (use jsonb_array_elements() in Grafana SQL)
  totals_by_ide                    JSONB,   -- [{ide, loc_added_sum, code_acceptance_activity_count, ...}]
  totals_by_feature                JSONB,   -- [{feature, loc_added_sum, ...}]
  totals_by_language_feature       JSONB,   -- [{language, feature, ...}]
  totals_by_language_model         JSONB,   -- [{language, model, ...}]
  totals_by_model_feature          JSONB,   -- [{model, feature, ...}]
  totals_by_cli                    JSONB,   -- {session_count, request_count, prompt_count, token_usage, ...}
  fetched_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_copilot_user_metrics_day        ON copilot_user_metrics(day);
CREATE INDEX idx_copilot_user_metrics_login       ON copilot_user_metrics(user_login);
CREATE UNIQUE INDEX idx_copilot_user_metrics_day_user ON copilot_user_metrics(day, user_login);

-- ─── Dashboard Config: Data Mode ─────────────────────────
-- Populated by the sync service on startup from env vars.
-- Controls the data source banner shown on every dashboard.

CREATE TABLE data_mode (
  id           SERIAL PRIMARY KEY,
  mode         TEXT NOT NULL,   -- 'live', 'seed', 'demo'
  source_label TEXT NOT NULL,   -- e.g. "octodemo/my-repo" or "Synthetic seed data"
  source_url   TEXT,            -- e.g. "https://github.com/octodemo/my-repo"
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Single-row table: always TRUNCATE + INSERT on sync so banner reflects current config.
```

### Schema Mismatch Detection (Sync Time)

```typescript
// Pseudocode — runs once per table before any INSERT
async function assertSchemaMatch(
  table: string,
  apiRecord: Record<string, unknown>,
  pool: Pool
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table]
  );
  const dbCols = new Set(rows.map(r => r.column_name));
  const apiKeys = Object.keys(apiRecord);
  const missingCols = apiKeys.filter(k => !dbCols.has(k));

  if (missingCols.length > 0) {
    throw new SchemaMismatchError(
      `Table '${table}' is missing columns for API keys: ${missingCols.join(', ')}. ` +
      `Run schema migration and re-sync.`
    );
  }
}
// Error is caught by orchestrator → stored in sync_jobs.error_message
// → Grafana shows error panel with the message
```

---

## API Endpoints & Octokit Methods

> All Copilot usage metrics endpoints with a `/reports/` path return `{ download_links: string[], report_day/report_start_day/report_end_day }`.
> The actual metric data is in the signed-URL JSON files. See the **Download-Link Pattern** section below.

### DORA Source Endpoints (inline JSON via Octokit)

| Data | Endpoint | Octokit Method | Notes |
|---|---|---|---|
| Pull Requests (list) | `GET /repos/{owner}/{repo}/pulls?state=all` | `octokit.rest.pulls.list` | Paginated; fetch detail per PR for additions/deletions |
| Pull Request (detail) | `GET /repos/{owner}/{repo}/pulls/{pull_number}` | `octokit.rest.pulls.get` | For `additions`, `deletions`, `changed_files` |
| Deployments | `GET /repos/{owner}/{repo}/deployments` | `octokit.rest.repos.listDeployments` | Paginated |
| Deployment Statuses | `GET /repos/{owner}/{repo}/deployments/{id}/statuses` | `octokit.rest.repos.listDeploymentStatuses` | One call per deployment |
| Issues | `GET /repos/{owner}/{repo}/issues?state=all` | `octokit.rest.issues.listForRepo` | |
| Workflow Runs | `GET /repos/{owner}/{repo}/actions/runs` | `octokit.rest.actions.listWorkflowRunsForRepo` | Paginated |
| Copilot Seats | `GET /orgs/{org}/copilot/billing/seats` | `octokit.rest.copilot.listCopilotSeats` | Current snapshot; inline JSON |

### Copilot Usage Metrics — Organization Scope

Required permission: `read:org` PAT scope, or fine-grained **"Organization Copilot metrics" (read)**.

| Report | Endpoint | Octokit Method | Period | Downloaded schema |
|---|---|---|---|---|
| Org aggregate — 28 days | `GET /orgs/{org}/copilot/usage-metrics/reports/org-28-day/latest` | `octokit.rest.copilot.getUsageMetricsForOrg({ org })` | Rolling 28d | NDJSON — each line is an object with `day_totals[]` (→ `copilot_org_metrics`) |
| Org aggregate — 1 day | `GET /orgs/{org}/copilot/usage-metrics/reports/org-1-day?day=YYYY-MM-DD` | `octokit.request(...)` with typed path | Single day | Same `day_totals` structure |
| Org per-user — 28 days | `GET /orgs/{org}/copilot/usage-metrics/reports/users-28-day/latest` | `octokit.request(...)` with typed path | Rolling 28d | NDJSON — each line is one user-day record (→ `copilot_user_metrics`) |
| Org per-user — 1 day | `GET /orgs/{org}/copilot/usage-metrics/reports/users-1-day?day=YYYY-MM-DD` | `octokit.request(...)` with typed path | Single day | Same user-day structure |

**Primary sync**: `org-28-day/latest` + `users-28-day/latest`. The `1-day` variants are for optional backfill of historical days.

### Copilot Usage Metrics — Enterprise Scope (optional)

Required permission: `manage_billing:copilot` or `read:enterprise` PAT scope, or fine-grained **"Enterprise Copilot metrics" (read)**.
These endpoints require enterprise-level access and are optional for local/org deployments. Graceful degrade if 403.

| Report | Endpoint | Octokit Method | Period | Downloaded schema |
|---|---|---|---|---|
| Enterprise aggregate — 28 days | `GET /enterprises/{enterprise}/copilot/usage-metrics/reports/enterprise-28-day/latest` | `octokit.request(...)` with typed path | Rolling 28d | NDJSON — same `day_totals` structure as org |
| Enterprise aggregate — 1 day | `GET /enterprises/{enterprise}/copilot/usage-metrics/reports/enterprise-1-day?day=YYYY-MM-DD` | `octokit.request(...)` with typed path | Single day | Same structure |
| Enterprise per-user — 28 days | `GET /enterprises/{enterprise}/copilot/usage-metrics/reports/users-28-day/latest` | `octokit.request(...)` with typed path | Rolling 28d | NDJSON — user-day records (same as org user schema) |
| Enterprise per-user — 1 day | `GET /enterprises/{enterprise}/copilot/usage-metrics/reports/users-1-day?day=YYYY-MM-DD` | `octokit.request(...)` with typed path | Single day | Same user-day structure |

> If `GITHUB_ENTERPRISE` env var is set, sync enterprise endpoints into the same `copilot_org_metrics` and `copilot_user_metrics` tables (with `enterprise_id` populated). Otherwise, skip with a logged warning.

### Download-Link Pattern (all `/reports/` endpoints)

All Copilot usage metrics `/reports/` endpoints follow a two-step pattern: the initial call returns only signed download URLs; the actual metric data is in NDJSON files fetched from those URLs.

```typescript
// Step 1: call the API — response is NOT the data, just signed download links
// For org aggregate (preferred SDK method):
const { data: envelope } = await octokit.rest.copilot.getUsageMetricsForOrg({ org });
// For users / enterprise variants (typed request call):
// const { data: envelope } = await octokit.request(
//   'GET /orgs/{org}/copilot/usage-metrics/reports/users-28-day/latest',
//   { org, headers: { 'X-GitHub-Api-Version': '2026-03-10' } }
// );
// envelope = { download_links: string[], report_start_day, report_end_day }

// Step 2: fetch each signed URL and parse as NDJSON (line-by-line — NOT res.json())
const records: UserMetricRecord[] = [];
for (const url of envelope.download_links) {
  const res = await fetch(url);
  const text = await res.text();
  for (const line of text.split('\n').filter(l => l.trim())) {
    records.push(JSON.parse(line));
  }
}

// Step 3: save raw to disk before touching the DB
await fs.writeFile(`data/raw/copilot-user-metrics/${today}.json`, JSON.stringify(records, null, 2));

// Step 4: TRUNCATE + INSERT into DB
```

> Signed URLs expire — never store `download_links` in the DB. Always download and save the payload immediately.
> Reports are **NDJSON** (Newline Delimited JSON). Do NOT use `res.json()` — parse each line separately.

### All API Fields in Downloaded Reports

**Org/Enterprise aggregate `day_totals` record** (scalar fields stored as columns):

| Field | Type | Description |
|---|---|---|
| `day` | date | Calendar day |
| `organization_id` | text | Org ID (org-scoped reports) |
| `enterprise_id` | text | Enterprise ID |
| `daily_active_users` | integer | Users active on this day |
| `weekly_active_users` | integer | Users active in trailing 7 days |
| `monthly_active_users` | integer | Users active in calendar month |
| `monthly_active_agent_users` | integer | Users who used agent mode in calendar month |
| `monthly_active_chat_users` | integer | Users who used chat in calendar month |
| `daily_active_cli_users` | integer | Users who used Copilot CLI (omitted if 0) |
| `code_acceptance_activity_count` | integer | Suggestions/blocks accepted |
| `code_generation_activity_count` | integer | Distinct Copilot output events |
| `user_initiated_interaction_count` | integer | Explicit prompts sent |
| `loc_suggested_to_add_sum` | integer | Lines suggested to add |
| `loc_suggested_to_delete_sum` | integer | Lines suggested to delete |
| `loc_added_sum` | integer | Lines added (accepted + agent edits) |
| `loc_deleted_sum` | integer | Lines deleted (agent edits) |
| `pull_requests` | JSONB | PR metrics object — see below |
| `totals_by_feature` | JSONB | Breakdown by feature (code_completion, chat_panel_ask_mode, agent_edit, etc.) |
| `totals_by_ide` | JSONB | Breakdown by IDE (vscode, jetbrains, etc.) |
| `totals_by_language_feature` | JSONB | Breakdown by language × feature |
| `totals_by_language_model` | JSONB | Breakdown by language × model |
| `totals_by_model_feature` | JSONB | Breakdown by model × feature |
| `totals_by_cli` | JSONB | CLI metrics (session_count, request_count, token_usage, ...) |

**`pull_requests` nested object fields** (accessed via JSONB in Grafana SQL):

| Field | Description |
|---|---|
| `total_created` | PRs created on this day |
| `total_reviewed` | PRs reviewed on this day (may count same PR multiple days) |
| `total_merged` | PRs merged on this day |
| `median_minutes_to_merge` | Median PR creation → merge time (minutes) |
| `total_suggestions` | PR review suggestions generated (all authors) |
| `total_applied_suggestions` | PR review suggestions applied (all authors) |
| `total_created_by_copilot` | PRs created by Copilot agent |
| `total_reviewed_by_copilot` | PRs reviewed by Copilot |
| `total_merged_created_by_copilot` | Copilot-created PRs merged on this day |
| `median_minutes_to_merge_copilot_authored` | Median merge time for Copilot-created PRs |
| `total_copilot_suggestions` | PR review suggestions generated by Copilot |
| `total_copilot_applied_suggestions` | Copilot review suggestions applied |

**User-level record fields** (one row per user per day):

| Field | Type | Description |
|---|---|---|
| `day` | date | Calendar day |
| `user_id` | bigint | GitHub numeric user ID |
| `user_login` | text | GitHub username |
| `enterprise_id` | text | Enterprise ID |
| `organization_id` | text | Org ID (org-scoped reports) |
| `user_initiated_interaction_count` | integer | Explicit prompts sent |
| `code_generation_activity_count` | integer | Distinct Copilot output events |
| `code_acceptance_activity_count` | integer | Suggestions/blocks accepted |
| `loc_suggested_to_add_sum` | integer | Lines suggested to add |
| `loc_suggested_to_delete_sum` | integer | Lines suggested to delete |
| `loc_added_sum` | integer | Lines added (accepted + agent edits) |
| `loc_deleted_sum` | integer | Lines deleted (agent edits) |
| `used_agent` | boolean | Used agent mode that day |
| `used_chat` | boolean | Used IDE chat that day |
| `used_cli` | boolean | Used Copilot CLI that day |
| `used_copilot_code_review_active` | boolean | Actively engaged with Copilot code review |
| `used_copilot_code_review_passive` | boolean | Copilot auto-assigned to review their PR |
| `totals_by_ide` | JSONB | IDE breakdown |
| `totals_by_feature` | JSONB | Feature breakdown |
| `totals_by_language_feature` | JSONB | Language × feature breakdown |
| `totals_by_language_model` | JSONB | Language × model breakdown |
| `totals_by_model_feature` | JSONB | Model × feature breakdown |
| `totals_by_cli` | JSONB | CLI metrics (session_count, request_count, prompt_count, token_usage) |

---

## Copilot Attribution Model

### What We Can Derive (GitHub API supports)

**PR Attribution** — a PR is "Copilot-attributed" when:
```sql
-- author has an active Copilot seat AND was active within the last 28 days
pr.user_id = cs.assignee_id
AND cs.last_activity_at >= (NOW() - INTERVAL '28 days')
```

**Core attribution SQL pattern** (used in all Copilot-segmented panels):
```sql
WITH copilot_users AS (
  SELECT assignee_id
  FROM copilot_seats
  WHERE last_activity_at >= (NOW() - INTERVAL '28 days')
)
SELECT
  CASE WHEN cu.assignee_id IS NOT NULL THEN 'Copilot Active' ELSE 'Non-Copilot' END AS cohort,
  ...
FROM pull_requests pr
LEFT JOIN copilot_users cu ON pr.user_id = cu.assignee_id
WHERE pr.merged_at BETWEEN $__timeFrom() AND $__timeTo()
```

### What We Cannot Derive (True API Limitations)

| Limitation | Reason | Caveat shown on panel |
|---|---|---|
| Per-PR Copilot attribution | No API field indicates "Copilot was used in this specific PR" | "Attribution = author has active Copilot seat, not per-PR telemetry" |
| Lines of code actually generated by Copilot | API reports lines accepted from suggestions; PR additions/deletions include all lines | "Lines in Copilot-attributed PRs ≠ lines Copilot wrote" |

---

## DORA Metric Definitions

> SQL is written for Grafana's PostgreSQL datasource. `$__timeFrom()` and `$__timeTo()` are Grafana macros.
> `$environment` is a template variable (Grafana dropdown). `$copilot_cohort` filters by cohort.

### 1. Change Lead Time (Median: PR merged → Deployment)

```sql
SELECT
  date_trunc('week', d.created_at) AS time,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (d.created_at - pr.merged_at)) / 3600.0
  ) AS "Lead Time (hours)"
FROM deployments d
JOIN deployment_pull_requests dpr ON dpr.deployment_id = d.deployment_id
JOIN pull_requests pr ON pr.number = dpr.pr_number
JOIN deployment_statuses ds ON ds.deployment_id = d.deployment_id
WHERE d.environment = '$environment'
  AND ds.state = 'success'
  AND pr.merged_at IS NOT NULL
  AND d.created_at BETWEEN $__timeFrom() AND $__timeTo()
GROUP BY 1
ORDER BY 1
```

### 2. Deployment Frequency (Successful deployments per week)

```sql
SELECT
  date_trunc('week', d.created_at) AS time,
  COUNT(DISTINCT d.deployment_id) AS "Deployments"
FROM deployments d
JOIN deployment_statuses ds ON ds.deployment_id = d.deployment_id
WHERE d.environment = '$environment'
  AND ds.state = 'success'
  AND d.created_at BETWEEN $__timeFrom() AND $__timeTo()
GROUP BY 1
ORDER BY 1
```

### 3. Change Fail Rate (% of deployments followed by incident within 24h)

```sql
WITH deploy_failures AS (
  SELECT DISTINCT d.deployment_id
  FROM deployments d
  JOIN deployment_statuses ds ON ds.deployment_id = d.deployment_id
  JOIN issues i ON i.labels::jsonb @> '[{"name":"incident"}]'
    AND i.created_at BETWEEN d.created_at AND d.created_at + INTERVAL '24 hours'
  WHERE d.environment = '$environment'
    AND ds.state = 'success'
    AND d.created_at BETWEEN $__timeFrom() AND $__timeTo()
)
SELECT
  COUNT(DISTINCT df.deployment_id)::float /
  NULLIF(COUNT(DISTINCT d.deployment_id), 0) * 100 AS "Change Fail Rate (%)"
FROM deployments d
LEFT JOIN deploy_failures df ON df.deployment_id = d.deployment_id
JOIN deployment_statuses ds ON ds.deployment_id = d.deployment_id
WHERE d.environment = '$environment'
  AND ds.state = 'success'
  AND d.created_at BETWEEN $__timeFrom() AND $__timeTo()
```

### 4. Failed Deployment Recovery Time (Time from failure to next success)

```sql
WITH failure_windows AS (
  SELECT
    d.deployment_id,
    d.created_at AS failed_at,
    LEAD(d.created_at) OVER (PARTITION BY d.environment ORDER BY d.created_at) AS recovered_at
  FROM deployments d
  JOIN deployment_statuses ds ON ds.deployment_id = d.deployment_id
  WHERE ds.state = 'failure'
    AND d.environment = '$environment'
    AND d.created_at BETWEEN $__timeFrom() AND $__timeTo()
)
SELECT
  date_trunc('week', failed_at) AS time,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (recovered_at - failed_at)) / 3600.0
  ) AS "Recovery Time (hours)"
FROM failure_windows
WHERE recovered_at IS NOT NULL
GROUP BY 1
ORDER BY 1
```

### 5. Deployment Rework Rate (% of deployments linked to hotfix/bugfix PRs)

```sql
WITH rework_deploys AS (
  SELECT DISTINCT dpr.deployment_id
  FROM deployment_pull_requests dpr
  JOIN pull_requests pr ON pr.number = dpr.pr_number
  WHERE pr.labels::jsonb @> '[{"name":"hotfix"}]'
     OR pr.labels::jsonb @> '[{"name":"bugfix"}]'
     OR pr.labels::jsonb @> '[{"name":"rollback"}]'
)
SELECT
  COUNT(DISTINCT rd.deployment_id)::float /
  NULLIF(COUNT(DISTINCT d.deployment_id), 0) * 100 AS "Rework Rate (%)"
FROM deployments d
JOIN deployment_statuses ds ON ds.deployment_id = d.deployment_id
LEFT JOIN rework_deploys rd ON rd.deployment_id = d.deployment_id
WHERE d.environment = '$environment'
  AND ds.state = 'success'
  AND d.created_at BETWEEN $__timeFrom() AND $__timeTo()
```

### 6. PR Cycle Time (Median: PR opened → merged)

```sql
SELECT
  date_trunc('week', merged_at) AS time,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (merged_at - created_at)) / 3600.0
  ) AS "PR Cycle Time (hours)"
FROM pull_requests
WHERE merged_at IS NOT NULL
  AND merged_at BETWEEN $__timeFrom() AND $__timeTo()
GROUP BY 1
ORDER BY 1
```

---

## Copilot Impact Metric Definitions

> Org metrics use `copilot_org_metrics.day`. User metrics use `copilot_user_metrics.day`.
> `copilot_seats` is still used for PR attribution (seat holder = Copilot active user proxy).
> PR metrics embedded in `copilot_org_metrics.pull_requests` JSONB provide API-native PR counts.

### Org-Level Lines Accepted / Suggested

```sql
-- Stat card: total lines accepted in window
SELECT SUM(loc_added_sum) AS "Lines Added"
FROM copilot_org_metrics
WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date;

-- Time series: suggested vs added trend
SELECT
  day AS time,
  loc_suggested_to_add_sum AS "Lines Suggested",
  loc_added_sum             AS "Lines Added"
FROM copilot_org_metrics
WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
ORDER BY day;

-- Acceptance rate trend
SELECT
  day AS time,
  ROUND(
    loc_added_sum::numeric / NULLIF(loc_suggested_to_add_sum, 0) * 100, 1
  ) AS "Acceptance Rate (%)"
FROM copilot_org_metrics
WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
ORDER BY day;
```

### Active / Engaged Users (Org Level)

```sql
-- Daily active and monthly active users
SELECT
  day AS time,
  daily_active_users    AS "Daily Active",
  weekly_active_users   AS "Weekly Active"
FROM copilot_org_metrics
WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
ORDER BY day;

-- Monthly aggregates (stat cards from latest row)
SELECT
  monthly_active_users         AS "Monthly Active",
  monthly_active_agent_users   AS "Monthly Agent Users",
  monthly_active_chat_users    AS "Monthly Chat Users"
FROM copilot_org_metrics
ORDER BY day DESC LIMIT 1;
```

### PR Metrics from Copilot Org Report (API-native, no proxy)

```sql
-- Daily PR activity: created, merged, Copilot-created
SELECT
  day AS time,
  (pull_requests->>'total_created')::int               AS "PRs Created",
  (pull_requests->>'total_merged')::int                AS "PRs Merged",
  (pull_requests->>'total_created_by_copilot')::int    AS "Copilot-Created PRs",
  (pull_requests->>'total_reviewed_by_copilot')::int   AS "Copilot-Reviewed PRs"
FROM copilot_org_metrics
WHERE pull_requests IS NOT NULL
  AND day BETWEEN $__timeFrom()::date AND $__timeTo()::date
ORDER BY day;

-- Copilot PR review suggestions: generated vs applied
SELECT
  day AS time,
  (pull_requests->>'total_copilot_suggestions')::int        AS "Copilot Suggestions",
  (pull_requests->>'total_copilot_applied_suggestions')::int AS "Applied"
FROM copilot_org_metrics
WHERE pull_requests IS NOT NULL
  AND day BETWEEN $__timeFrom()::date AND $__timeTo()::date
ORDER BY day;

-- Median merge time: all PRs vs Copilot-authored
SELECT
  day AS time,
  (pull_requests->>'median_minutes_to_merge')::float                  AS "All PRs (min)",
  (pull_requests->>'median_minutes_to_merge_copilot_authored')::float AS "Copilot PRs (min)"
FROM copilot_org_metrics
WHERE pull_requests IS NOT NULL
  AND day BETWEEN $__timeFrom()::date AND $__timeTo()::date
ORDER BY day;
```

### Feature Adoption Breakdown (from `totals_by_feature` JSONB)

```sql
-- Lines added by Copilot feature (code completion vs chat vs agent)
SELECT
  day AS time,
  feat->>'feature'          AS feature,
  (feat->>'loc_added_sum')::int AS loc_added
FROM copilot_org_metrics,
     jsonb_array_elements(totals_by_feature) AS feat
WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
ORDER BY day, feature;
```

### IDE Distribution (from `totals_by_ide` JSONB)

```sql
-- Lines added by IDE
SELECT
  ide_row->>'ide'              AS "IDE",
  SUM((ide_row->>'loc_added_sum')::int) AS "Lines Added"
FROM copilot_org_metrics,
     jsonb_array_elements(totals_by_ide) AS ide_row
WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
GROUP BY 1
ORDER BY 2 DESC;
```

### Per-User Leaderboard (from `copilot_user_metrics` — true API data)

```sql
-- Top contributors by lines added (true leaderboard, not seat-proxy)
SELECT
  user_login                                                          AS "Developer",
  SUM(loc_added_sum)                                                 AS "Lines Added",
  SUM(loc_suggested_to_add_sum)                                      AS "Lines Suggested",
  ROUND(
    SUM(loc_added_sum)::numeric / NULLIF(SUM(loc_suggested_to_add_sum), 0) * 100, 1
  )                                                                  AS "Acceptance Rate (%)",
  SUM(code_acceptance_activity_count)                                AS "Acceptances",
  SUM(user_initiated_interaction_count)                              AS "Prompts"
FROM copilot_user_metrics
WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
GROUP BY user_login
ORDER BY "Lines Added" DESC
LIMIT 20;

-- Feature adoption by user (who is using agent vs chat vs completions)
SELECT
  user_login,
  BOOL_OR(used_agent) AS "Used Agent",
  BOOL_OR(used_chat)  AS "Used Chat",
  BOOL_OR(used_cli)   AS "Used CLI",
  BOOL_OR(used_copilot_code_review_active) AS "Used Code Review"
FROM copilot_user_metrics
WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
GROUP BY user_login
ORDER BY user_login;
```

### Copilot-Attributed PRs (seat-proxy, for cross-join with pull_requests table)

```sql
-- PRs with Copilot attribution (count)
WITH copilot_users AS (
  SELECT assignee_id FROM copilot_seats
  WHERE last_activity_at >= NOW() - INTERVAL '28 days'
)
SELECT COUNT(*) AS "Copilot-Attributed PRs"
FROM pull_requests pr
JOIN copilot_users cu ON pr.user_id = cu.assignee_id
WHERE pr.merged_at BETWEEN $__timeFrom() AND $__timeTo();

-- AI-assisted PR rate (%)
WITH copilot_users AS (
  SELECT assignee_id FROM copilot_seats
  WHERE last_activity_at >= NOW() - INTERVAL '28 days'
)
SELECT
  ROUND(
    COUNT(DISTINCT CASE WHEN cu.assignee_id IS NOT NULL THEN pr.id END)::numeric * 100.0
    / NULLIF(COUNT(DISTINCT pr.id), 0), 1
  ) AS "Copilot PR Rate (%)"
FROM pull_requests pr
LEFT JOIN copilot_users cu ON pr.user_id = cu.assignee_id
WHERE pr.merged_at BETWEEN $__timeFrom() AND $__timeTo();

-- Lines in Copilot-attributed PRs
WITH copilot_users AS (
  SELECT assignee_id FROM copilot_seats
  WHERE last_activity_at >= NOW() - INTERVAL '28 days'
)
SELECT
  COALESCE(SUM(pr.additions + pr.deletions), 0) AS "Lines in Copilot PRs"
FROM pull_requests pr
JOIN copilot_users cu ON pr.user_id = cu.assignee_id
WHERE pr.merged_at BETWEEN $__timeFrom() AND $__timeTo();
```

### DORA Metrics by Copilot Cohort

```sql
-- Change Lead Time: Copilot Active vs Non-Copilot
WITH copilot_users AS (
  SELECT assignee_id FROM copilot_seats
  WHERE last_activity_at >= NOW() - INTERVAL '28 days'
)
SELECT
  CASE WHEN cu.assignee_id IS NOT NULL THEN 'Copilot Active' ELSE 'Non-Copilot' END AS cohort,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (d.created_at - pr.merged_at)) / 3600.0
  ) AS "Lead Time (hours)"
FROM deployments d
JOIN deployment_pull_requests dpr ON dpr.deployment_id = d.deployment_id
JOIN pull_requests pr ON pr.number = dpr.pr_number
JOIN deployment_statuses ds ON ds.deployment_id = d.deployment_id
LEFT JOIN copilot_users cu ON pr.user_id = cu.assignee_id
WHERE d.environment = '$environment'
  AND ds.state = 'success'
  AND pr.merged_at IS NOT NULL
  AND d.created_at BETWEEN $__timeFrom() AND $__timeTo()
GROUP BY cohort;
```

---

## Panel Description Standards

Every panel in every dashboard must include a **description** (shown on hover of the ℹ️ icon in Grafana). The description uses markdown and follows this template:

```markdown
### What it measures
[1–2 sentences describing the data being visualized and the SQL computation behind it]

### What insight it offers
[1 sentence on the decision or action this metric informs]

### ⚠️ Caveats
- [Caveat 1 — if applicable]
- [Caveat 2 — if applicable]
```

**Caveat categories** (use these consistently):
- **Attribution proxy**: "Copilot attribution = author has active seat, not per-PR telemetry"
- **Label dependency**: "Change Fail Rate requires issues to be labeled `incident`. If no incident labels exist, this metric reads 0%."
- **28-day retention**: "Data limited to last 28 days due to GitHub Copilot API retention."
- **Counting scope**: "Counts all lines changed in attributed PRs — not just lines Copilot generated."
- **Sample size**: "Median values may be unreliable if fewer than 5 data points exist in the window."
- **Snapshot data**: "Based on current seat snapshot, not historical seat assignments."

---

## Data Mode Indicator

Every dashboard has a **banner row at the top** showing the data source context. This tells the viewer at a glance whether they're looking at live production data, seeded synthetic data, or a configured demo repository.

### Banner SQL

```sql
-- Panel: "Data Source" — displayed as a 3-stat row at the top of every dashboard
SELECT
  CASE mode
    WHEN 'live' THEN '📡 Live Data'
    WHEN 'seed' THEN '🌱 Synthetic Seed Data'
    WHEN 'demo' THEN '🎮 Demo Environment'
    ELSE '❓ Unknown'
  END AS "Data Mode",
  source_label AS "Source",
  TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI') || ' UTC' AS "Configured"
FROM data_mode
ORDER BY updated_at DESC LIMIT 1;

-- Panel: "Last Synced" — stat showing sync freshness
SELECT
  TO_CHAR(MAX(started_at), 'YYYY-MM-DD HH24:MI') || ' UTC' AS "Last Synced"
FROM sync_jobs WHERE status = 'success';

-- Panel: "Sync Status" — stat showing if last sync succeeded or failed
SELECT
  CASE
    WHEN status = 'failed' THEN '⚠️ Last sync failed: ' || COALESCE(error_message, 'unknown error')
    ELSE '✅ Sync OK'
  END AS "Sync Status"
FROM sync_jobs ORDER BY started_at DESC LIMIT 1;
```

### Env Vars

```
DATA_MODE=live          # 'live', 'seed', or 'demo'
DATA_SOURCE_LABEL=octodemo/my-repo   # shown in banner
DATA_SOURCE_URL=https://github.com/octodemo/my-repo  # optional link
```

Set by the sync service at startup:
```typescript
await pool.query(`DELETE FROM data_mode`);
await pool.query(
  `INSERT INTO data_mode (mode, source_label, source_url) VALUES ($1, $2, $3)`,
  [config.dataMode, config.dataSourceLabel, config.dataSourceUrl ?? null]
);
```

### Visual Treatment

| Mode | Banner Color | Label |
|---|---|---|
| `live` | Green | 📡 Live Data — octodemo/my-repo |
| `seed` | Amber | 🌱 Synthetic Seed Data — generated by seed generator |
| `demo` | Blue | 🎮 Demo Environment — octodemo/demo-repo |

Grafana thresholds on the "Data Mode" stat panel implement the color coding:
- `live` → green (`#73BF69`)
- `seed` → amber (`#FA6400`)
- `demo` → blue (`#5794F2`)

---

## Dashboard Structure

The dashboard suite is split into **8 purpose-built dashboards**. Each dashboard is focused on a single concern and can be used independently. The Overview dashboard provides an at-a-glance summary with links to each pillar.

| # | File | Title | Primary audience |
|---|---|---|---|
| 0 | `00-overview.json` | 📊 Engineering Overview | Engineering leadership |
| 1 | `01-deployment-frequency.json` | 🚀 Deployment Frequency | Delivery teams |
| 2 | `02-lead-time.json` | ⏱️ Lead Time for Changes | Delivery teams |
| 3 | `03-change-failure-rate.json` | 🔥 Change Failure Rate & Quality | Reliability / SRE |
| 4 | `04-mean-time-to-recovery.json` | 🏥 Mean Time to Recovery | Reliability / SRE |
| 5 | `05-copilot-adoption.json` | 🤖 Copilot Adoption & Usage | Engineering leadership |
| 6 | `06-copilot-code-impact.json` | 💻 Copilot Code Impact | Engineering leadership |
| 7 | `07-dora-vs-copilot.json` | 🔬 DORA × Copilot Cohort | Engineering leadership |

> Dashboards 1–4 are the four official DORA pillars, one per dashboard.  
> Dashboards 5–6 cover Copilot telemetry (adoption and code completions separately — divided because adoption questions and code generation questions have different audiences and different data sources).  
> Dashboard 7 is cross-cutting: it answers "does Copilot usage correlate with better DORA metrics?"  
> Dashboard 0 is the home/landing page linking to all others.

---

## Dashboard Layout

> Every dashboard begins with a **Data Source Banner row** (3 stat panels: Data Mode, Source, Last Synced + Sync Status). This row is the same across all 8 dashboards.

### Dashboard 0: `00-overview.json` — 📊 Engineering Overview

**Purpose**: Single-page summary for leadership. Shows current DORA performance, Copilot adoption, and quick-reference links to pillar dashboards.

#### Row 0: 🏷️ Data Source Banner
*(Same on every dashboard — see Data Mode Indicator section)*

#### Row 1: ⚡ DORA Scorecard (4 stat cards + DORA band color)

| Panel | Metric | DORA Band Thresholds |
|---|---|---|
| Deployment Frequency | Deployments/week | Elite ≥5/day \| High ≥1/wk \| Med ≥1/mo \| Low <1/mo |
| Lead Time (median) | Hours PR merged → deployed | Elite <1h \| High <1d \| Med <1wk \| Low ≥1wk |
| Change Fail Rate | % | Elite ≤5% \| High ≤10% \| Med ≤15% \| Low >15% |
| MTTR (median) | Hours failure → recovery | Elite <1h \| High <1d \| Med <1wk \| Low ≥1wk |

**Panel description** (Deployment Frequency example):
> **What it measures**: Count of successful deployments to the production environment per week in the selected time range.  
> **What insight it offers**: Indicates how frequently the team ships working software — a leading indicator of team agility.  
> **⚠️ Caveats**: Only counts deployments to the `$environment` filter. If your team uses multiple environments, filter to `production`. Requires GitHub Deployments API to be in use; if your team deploys without GitHub Deployments, this will read 0.

#### Row 2: 🤖 Copilot Summary (4 stat cards)

| Panel | Metric |
|---|---|
| Active Copilot Seats | `copilot_seats` count |
| Org Acceptance Rate | Lines accepted / lines suggested × 100 |
| Copilot PR Rate | % merged PRs by active seat holders |
| Lines Accepted (28d) | Sum of `total_code_lines_accepted` |

#### Row 3: 🔗 Navigation links

Text panels linking to each of the 8 dashboards (implemented as Grafana text panels with dashboard links).

---

### Dashboard 1: `01-deployment-frequency.json` — 🚀 Deployment Frequency

**Purpose**: Deep-dive into how often and how consistently deployments happen.

#### Row 0: Data Source Banner
#### Row 1: 📊 KPI Card
- **Deployment Frequency** (stat, DORA band color): median deployments/week

  *Description*: Counts successful deployments per week. Filters to `$environment`. DORA elite teams deploy multiple times per day; high performers deploy weekly.  
  *Caveat*: Requires GitHub Deployments to be in use (not just GitHub Actions runs, which are CI — not deployments).

#### Row 2: 📈 Frequency Trends
- **Deployments per Week** (time series, area fill): count of successful deployments by week
- **Deployments by Environment** (stacked bar): frequency split across environments
- **Deployment Volume Heat Map** (bar chart by day of week): which days have most deployments

  *Description (Deployments per Week)*: Weekly count of deployments reaching `success` status. Trend shows whether deployment cadence is improving or declining.  
  *Caveat*: A single deployment event may represent multiple PRs (batch releases). Frequency alone doesn't indicate whether each deployment carries meaningful change.

#### Row 3: 🔬 Deployment Detail
- **Deployment Success Rate** (stat): `success / total` for all deployments
- **Failed Deployments Timeline** (time series): count of `failure` status by week
- **Recent Deployments Table** (table): sha, environment, status, creator, created_at

  *Description (Success Rate)*: Percentage of all deployment events that reached `success` status in the selected window. A declining success rate may indicate pipeline instability.

#### Row 4: 🤖 Copilot Cohort
- **Deployment Frequency: Copilot vs Non-Copilot** (grouped bar): average deployments/week for PRs by each cohort

  *Description*: Compares deployment cadence for PRs authored by Copilot seat holders vs others.  
  *Caveat — Attribution proxy*: "Copilot active" = author has a seat with `last_activity_at` within 28 days, not per-deployment telemetry.

---

### Dashboard 2: `02-lead-time.json` — ⏱️ Lead Time for Changes

**Purpose**: How quickly does a merged PR reach production? The full pipeline from code complete to live.

#### Row 0: Data Source Banner
#### Row 1: 📊 KPI Cards
- **Change Lead Time** (stat, DORA band color): median hours PR merged → deployment succeeded
- **PR Cycle Time** (stat): median hours PR opened → PR merged
- **P90 Lead Time** (stat): 90th percentile — captures worst-case outliers

  *Description (Change Lead Time)*: Median time between a PR being merged and the deployment that included it reaching `success` status. Measures how fast the team can get code from "done" to "live."  
  *Caveat*: Requires the deployment ↔ PR bridge to be populated (deployment SHA must match PR `merge_commit_sha`). PRs merged via squash use fallback SHA matching which may miss some links.

#### Row 2: 📈 Lead Time Trends
- **Change Lead Time over Time** (time series, median + P90 bands): weekly median and P90
- **PR Cycle Time over Time** (time series): weekly median PR open → merge duration
- **Pipeline Breakdown** (stacked bar): show PR cycle time vs deploy lag stacked (cycle time + time-to-deploy = total lead time)

  *Description (Pipeline Breakdown)*: Splits total lead time into two stages: (1) PR cycle time (open to merge) and (2) deploy lag (merge to deployment). Identifies which stage is the bottleneck.

#### Row 3: 📋 Outlier Analysis
- **Slowest PRs by Lead Time** (table): PR number, title, cycle time, lead time, author
- **Fastest PRs** (table): same fields, sorted ascending

  *Description (Slowest PRs)*: Shows the PRs with the longest time from open to deployment. Useful for identifying PRs stuck in review or waiting for deployment windows.  
  *Caveat*: A PR may show a very long lead time if it was kept open as a draft for a long period, even if actual review was fast.

#### Row 4: 🤖 Copilot Cohort
- **Lead Time: Copilot vs Non-Copilot** (grouped bar): median lead time for each cohort
- **PR Cycle Time: Copilot vs Non-Copilot** (grouped bar): median cycle time per cohort

  *Description*: Compares whether Copilot seat holders have shorter or longer lead times. A shorter lead time for Copilot users would suggest AI assistance accelerates the review and release cycle.  
  *Caveat — Attribution proxy*.

---

### Dashboard 3: `03-change-failure-rate.json` — 🔥 Change Failure Rate & Quality

**Purpose**: How often do changes cause problems? Covers failures, rework, and unplanned work.

#### Row 0: Data Source Banner
#### Row 1: 📊 KPI Cards
- **Change Fail Rate** (stat, DORA band): % of successful deployments linked to an incident issue within 24h
- **Deployment Rework Rate** (stat): % of successful deployments linked to a hotfix/bugfix/rollback PR
- **Total Incidents** (stat): count of `incident`-labeled issues in the window

  *Description (Change Fail Rate)*: Percentage of successful deployments that triggered an `incident`-labeled GitHub issue within 24 hours. This is the closest approximation to "deployments that caused a production failure" available from GitHub API data.  
  *Caveat — Label dependency*: Requires issues to be labeled `incident` (or `bug` as configured). If the team doesn't use this label, the metric reads 0% — not because failures don't happen but because they aren't tracked here.  
  *Caveat — 24h window*: Some incidents may be caused by deployments that happened more than 24 hours ago. The window is configurable but defaults to 24h.

  *Description (Rework Rate)*: Percentage of deployments that include a PR labeled `hotfix`, `bugfix`, or `rollback` — indicating reactive/unplanned work. Higher rework rate suggests recurring quality issues.  
  *Caveat — Label dependency*: Requires PRs to use `hotfix`, `bugfix`, or `rollback` labels consistently.

#### Row 2: 📈 Trends
- **Change Fail Rate over Time** (time series): weekly CFR percentage
- **Rework Rate over Time** (time series): weekly rework percentage
- **Incidents over Time** (time series): count of incident issues created per week

#### Row 3: 📋 Incident & Failure Analysis
- **Open Incidents** (table): issue number, title, created_at, assignee, labels
- **Deployments Linked to Incidents** (table): deployment, SHA, environment, created_at, incident title
- **Hotfix/Bugfix PRs** (table): PR number, title, author, merged_at, labels

  *Description (Open Incidents)*: GitHub issues labeled `incident` that are currently open. A long tail of open incidents may indicate the team is not systematically closing incidents after recovery.

#### Row 4: 🤖 Copilot Cohort
- **CFR: Copilot vs Non-Copilot** (grouped bar): failure rate for deployments linked to Copilot-attributed vs non-attributed PRs

  *Description*: Tests the hypothesis that Copilot-assisted development has a different failure rate than non-assisted.  
  *Caveat — Attribution proxy*. *Caveat — Small sample sizes*: If the total number of failures is small (< 5 per cohort), percentages will be volatile.

---

### Dashboard 4: `04-mean-time-to-recovery.json` — 🏥 Mean Time to Recovery

**Purpose**: When failures happen, how quickly does the team recover?

#### Row 0: Data Source Banner
#### Row 1: 📊 KPI Cards
- **MTTR** (stat, DORA band): median hours from deployment failure → next successful deployment
- **P90 MTTR** (stat): 90th percentile — captures worst-case recoveries
- **Incidents Still Open** (stat): count of `incident` issues with `state = 'open'`

  *Description (MTTR)*: Median time between a deployment reaching `failure` status and the next deployment to the same environment reaching `success` status. Measures how quickly the team can restore service after a bad deployment.  
  *Caveat*: Recovery time is measured as time to next successful deployment — not time to incident closure. If a team rolls back quickly but leaves the incident issue open, MTTR will be low but the incident table will show open issues. If recovery involves a direct database fix (not a deployment), this metric won't capture it.

#### Row 2: 📈 Recovery Trends
- **MTTR over Time** (time series, median + P90): weekly median and P90 recovery time
- **Incident Resolution Time** (time series): time from incident issue opened → issue closed per week

  *Description (Incident Resolution Time)*: Time between an `incident`-labeled issue being opened and closed. Complementary to MTTR: MTTR measures deployment recovery, this measures issue resolution (which may include postmortem, root cause analysis, etc.).  
  *Caveat*: Only measures issues labeled `incident`. Many teams resolve incidents without closing the GitHub issue promptly.

#### Row 3: 📋 Recovery Detail
- **Recent Failures with Recovery Time** (table): failed deployment, SHA, environment, failed_at, recovered_at, duration
- **Unresolved Failures** (table): failed deployments with no subsequent success deployment

  *Description (Unresolved Failures)*: Deployments that entered `failure` state and have not yet been followed by a `success` deployment. These represent ongoing instability or deployments abandoned in a failed state.

#### Row 4: 🤖 Copilot Cohort
- **MTTR: Copilot vs Non-Copilot** (grouped bar): median recovery time for failures linked to each cohort's PRs

  *Caveat — Attribution proxy*. *Caveat*: Recovery time depends heavily on the nature of the failure, not just the code authorship. Treat this as exploratory, not conclusive.

---

### Dashboard 5: `05-copilot-adoption.json` — 🤖 Copilot Adoption & Usage

**Purpose**: Who has seats, who is active, which surfaces are used? Answers whether the investment in Copilot is being utilized.

> Default time range: last 28 days.

#### Row 0: Data Source Banner
#### Row 1: 📊 Adoption KPIs
- **Total Seats** (stat): count of all `copilot_seats` rows
- **Active Seats (28d)** (stat): seats where `last_activity_at >= NOW() - INTERVAL '28 days'`
- **Seat Utilization Rate** (stat): active / total × 100
- **Inactive Seats (>14d)** (stat): seats with no activity in 14+ days

  *Description (Seat Utilization Rate)*: Percentage of assigned Copilot seats that have shown activity in the last 28 days. A low utilization rate suggests seats are not being used — an opportunity to audit assignments or increase onboarding.  
  *Caveat — Snapshot data*: Seat data reflects the current assignment snapshot, not historical assignments. Seats assigned today will appear in the denominator even if the user hasn't had time to activate.

#### Row 2: 📈 Daily Active Users Trend
- **Daily Active Users** (time series): `copilot_org_metrics.total_active_users` by date
- **Daily Engaged Users** (time series): `copilot_org_metrics.total_engaged_users` by date

  *Description (Active vs Engaged)*: "Active users" had a Copilot session open; "engaged users" received at least one suggestion. The gap between these two measures how often Copilot surfaces suggestions when it's running.

#### Row 3: 🔬 Surface & Editor Breakdown
- **Last Active Editor** (bar chart): `copilot_seats.last_activity_editor` distribution
- **Plan Type Distribution** (pie chart): `copilot_seats.plan_type`
- **Seat Activity Recency** (table): `assignee_login`, `last_activity_at`, `last_activity_editor`, `plan_type` sorted by `last_activity_at` DESC

  *Description (Last Active Editor)*: Distribution of the most recent editor used per seat holder. Based on the `last_activity_editor` field from the seats API — reflects the last-used editor, not usage frequency across editors.  
  *Caveat — Snapshot data*: Shows last-used editor for current seat holders. Users who primarily use VS Code but occasionally use JetBrains will be counted in JetBrains if that was their last session.

---

### Dashboard 6: `06-copilot-code-impact.json` — 💻 Copilot Code Impact

**Purpose**: What volume of code is Copilot generating and accepting? PR attribution and leaderboards.

> Default time range: last 28 days.

#### Row 0: Data Source Banner
#### Row 1: 📊 Code Completions KPIs
- **Lines Accepted (28d)** (stat): `SUM(total_code_lines_accepted)`
- **Lines Suggested (28d)** (stat): `SUM(total_code_lines_suggested)`
- **Acceptance Rate** (stat): lines accepted / lines suggested × 100
- **Total Completions Accepted** (stat): `SUM(total_code_acceptances)`

  *Description (Acceptance Rate)*: The percentage of suggested code lines that developers kept (accepted). A higher acceptance rate indicates Copilot's suggestions are relevant and useful for the team. Industry typical range: 25–40%.  
  *Caveat*: This is an org-level aggregate. Individual users may have very different acceptance rates. The metric counts line-level acceptances, not full suggestion block acceptances.  
  *Caveat — 28-day retention*: Data limited to last 28 days due to GitHub Copilot API retention.

#### Row 2: 📈 Completions Trends
- **Lines Accepted vs Suggested over Time** (time series): dual-line chart by date
- **Acceptance Rate Trend** (time series): daily acceptance rate percentage

  *Description (Lines Trend)*: Day-by-day volume of code lines suggested vs accepted. An increasing gap between suggested and accepted may indicate suggestion quality declining or developer usage changing.

#### Row 3: 🤖 PR Attribution
*(Panels from Copilot-attributed PR analysis)*

- **Copilot-Attributed PRs** (stat): count of merged PRs by active seat holders
- **Copilot PR Rate (%)** (stat): Copilot-attributed PRs / total merged PRs × 100
- **Lines in Copilot-Attributed PRs** (stat): SUM(additions + deletions) for attributed PRs

  *Description (Copilot PR Rate)*: The proportion of merged pull requests authored by someone with an active Copilot seat. A higher percentage indicates broader Copilot adoption across the team's output.  
  *Caveat — Attribution proxy*: "Copilot-attributed" means the PR author holds an active seat — not that Copilot generated code in this specific PR. A developer with a seat who writes a PR entirely without Copilot is still counted.  
  *Caveat — Lines counting scope*: Lines in Copilot-attributed PRs counts ALL lines in those PRs (`additions + deletions`), not just lines Copilot suggested.

- **PRs by Cohort: Copilot vs Non-Copilot** (stacked bar, weekly): weekly PR count by cohort
- **Lines by Cohort** (stacked bar, weekly): weekly line count by cohort

#### Row 4: 🏆 Leaderboards
- **Top 10 by Copilot PRs** (table): developer, PR count, total lines
- **Top 10 by Lines in Copilot PRs** (table): developer, additions, deletions, total lines, PR count
- **PRs per Copilot User** (horizontal bar): one bar per active seat holder

  *Description (Leaderboard)*: Rankings of Copilot seat holders by their PR output. Identifies power users and potential knowledge-sharing opportunities.  
  *Caveat*: Rankings only include seat holders — high-output developers without Copilot seats do not appear. This dashboard measures Copilot user productivity, not overall team ranking.

---

### Dashboard 7: `07-dora-vs-copilot.json` — 🔬 DORA × Copilot Cohort

**Purpose**: The cross-cutting question: does Copilot usage correlate with better delivery performance?

#### Row 0: Data Source Banner
#### Row 1: 📊 DORA by Cohort — All 5 Metrics Side-by-Side

- **DORA Metrics Comparison** (grouped bar, 5 metrics × 2 cohorts): Change Lead Time, PR Cycle Time, Deployment Frequency, Change Fail Rate, Rework Rate — one bar per cohort per metric

  *Description*: Side-by-side comparison of all key DORA metrics for PRs authored by Copilot seat holders vs non-seat holders. This is the flagship panel for demonstrating Copilot's impact on delivery performance.  
  *Caveat — Attribution proxy*.  
  *Caveat*: Correlation is not causation. Higher-performing developers may be more likely to adopt Copilot, rather than Copilot making developers higher-performing. Treat as directional signal, not causal evidence.

#### Row 2: 📈 Lead Time by Cohort
- **Change Lead Time: Copilot vs Non-Copilot** (time series, two lines): weekly median per cohort
- **PR Cycle Time: Copilot vs Non-Copilot** (time series): weekly median per cohort

#### Row 3: 📦 Output by Cohort
- **Merged PRs by Cohort** (time series): weekly PR count per cohort
- **Lines Changed by Cohort** (time series): weekly line count per cohort
- **PRs per Developer by Cohort** (bar): average PRs per user in each cohort

  *Description (PRs per Developer)*: Average number of merged PRs per developer in each cohort. Answers whether Copilot users are shipping more PRs per person.  
  *Caveat*: Average can be skewed by a single high-output developer. If one cohort has a prolific author, that may dominate the average.

#### Row 4: 🔥 Stability by Cohort
- **Change Fail Rate: Copilot vs Non-Copilot** (grouped bar): CFR per cohort
- **MTTR: Copilot vs Non-Copilot** (grouped bar): recovery time per cohort

---

### Template Variables (All Dashboards)

| Variable | Type | Query / Options | Applies to |
|---|---|---|---|
| `$environment` | Query | `SELECT DISTINCT environment FROM deployments ORDER BY environment` | DORA dashboards (1–4, 7) |
| `$copilot_cohort` | Custom | `All, Copilot Active, Non-Copilot` | Dashboard 7 |

---



## Project Structure

```
CustomMetricsDashboard/
├── src/
│   ├── config.ts                    # Env var validation and config object
│   ├── index.ts                     # Express app entry point
│   ├── db/
│   │   ├── connection.ts            # PostgreSQL pool
│   │   └── schema.sql               # Full schema DDL (v2)
│   ├── github/
│   │   ├── client.ts                # Octokit initialization
│   │   ├── pull-requests.ts         # Fetch PRs (list + individual for additions/deletions)
│   │   ├── deployments.ts           # Fetch deployments + statuses
│   │   ├── issues.ts                # Fetch issues
│   │   ├── workflow-runs.ts         # Fetch workflow runs
│   │   ├── copilot-org-metrics.ts   # Fetch org aggregate metrics (org-28-day → download → parse NDJSON)
│   │   ├── copilot-user-metrics.ts  # Fetch per-user metrics (users-28-day → download → parse)
│   │   └── copilot-seats.ts         # Fetch per-user seat data
│   ├── sync/
│   │   ├── orchestrator.ts          # Coordinates all fetchers; manages sync_jobs
│   │   ├── bridge-resolver.ts       # Maps deployment SHA → PR merge_commit_sha
│   │   ├── schema-check.ts          # assertSchemaMatch() function
│   │   └── state.ts                 # Read/write sync_state table
│   └── routes/
│       ├── sync.ts                  # POST /api/sync
│       └── status.ts                # GET /api/sync/status/:jobId
├── seed/
│   ├── config.ts                    # Seed counts, ratios, distributions
│   └── generator.ts                 # Generates JSON files in data/raw/ then loads them
├── scripts/
│   ├── seed.ts                      # CLI: truncate → generate → load → verify
│   └── sync.ts                      # CLI: trigger POST /api/sync and tail status
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── postgres.yml
│   │   └── dashboards/
│   │       └── dashboard.yml
│   └── dashboards/
│       ├── 00-overview.json
│       ├── 01-deployment-frequency.json
│       ├── 02-lead-time.json
│       ├── 03-change-failure-rate.json
│       ├── 04-mean-time-to-recovery.json
│       ├── 05-copilot-adoption.json
│       ├── 06-copilot-code-impact.json
│       └── 07-dora-vs-copilot.json
├── data/
│   └── raw/                         # Git-ignored; populated at sync time
│       ├── pull-requests/
│       ├── deployments/
│       ├── deployment-statuses/
│       ├── issues/
│       ├── workflow-runs/
│       ├── copilot-org-metrics/
│       └── copilot-seats/
├── tests/
│   ├── config.test.ts
│   ├── seed-config.test.ts
│   ├── schema-check.test.ts
│   ├── bridge-resolver.test.ts
│   ├── seed-generator.test.ts
│   ├── dashboards.test.ts              # Validates all 8 dashboard JSON files
│   ├── data-mode.test.ts
│   └── fetchers/
│       ├── pull-requests.test.ts
│       ├── deployments.test.ts
│       ├── issues.test.ts
│       ├── workflow-runs.test.ts
│       ├── copilot-org-metrics.test.ts
│       └── copilot-seats.test.ts
├── tests/e2e/
│   ├── overview-dashboard.spec.ts
│   ├── dora-dashboards.spec.ts
│   └── copilot-dashboards.spec.ts
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Seeding Strategy

The seed generator follows the **same code path as production sync**, ensuring seed data is representative and that the seed process validates the real data pipeline:

1. `npm run seed` calls `seed/generator.ts`
2. Generator creates fake GitHub API-shaped JSON objects
3. Generator writes each object to `data/raw/{endpoint}/seed-{n}.json` (same format as real sync)
4. Seed loader reads those files and calls the same `INSERT` logic as the real sync service
5. If seeding works, real sync will too

### Seed Configuration (`seed/config.ts`)

```typescript
export const SEED_CONFIG = {
  users: 20,
  prs: 140,             // ~70% by Copilot users
  deploymentsPerWeek: { min: 2, max: 8 },
  incidentRate: 0.15,   // 15% of deployments trigger incident within 24h
  reworkRate: 0.12,     // 12% of deployments linked to hotfix/bugfix PRs
  copilotSeatCount: 14, // ~70% of users
  windowDays: 28,       // align with Copilot API retention
  environments: ['production', 'staging'],
};
```

### Seed Data Distributions

| Entity | Count | Distribution |
|---|---|---|
| Users | 20 | Real login names (synthetic), unique GitHub IDs |
| Pull Requests | 140 | 70% by Copilot users; cycle times 1h–5d skewed short |
| Deployments | ~70 total (28d) | 2–8/week; 85% success; 15% failure |
| Deployment Statuses | 2–3 per deployment | pending → success or pending → failure |
| Issues | ~25 | 15% labeled `incident`; realistic created/closed timestamps |
| Workflow Runs | ~200 | ~80% success; mix of push/PR events |
| Copilot Org Metrics | 28 rows | One per day; ~70 active users/day; realistic acceptance rates (25–40%) |
| Copilot Seats | 14 rows | `last_activity_at` spread across last 28 days; mix of editors |

---

## Sync Engine Details

### File Dump Format

```typescript
// Before each table INSERT, write raw response:
const outputPath = `data/raw/${endpoint}/${new Date().toISOString().slice(0, 10)}.json`;
await fs.writeFile(outputPath, JSON.stringify(records, null, 2));
```

### Orchestration Order

```
1. Assert schema matches (all tables) → abort if any mismatch
2. Fetch + dump copilot_seats → TRUNCATE copilot_seats → INSERT
3. Fetch + dump copilot_org_metrics (last 28d) → TRUNCATE copilot_org_metrics → INSERT
4. Fetch users-28-day/latest → download each signed URL → dump to data/raw/copilot-user-metrics/
   TRUNCATE copilot_user_metrics → INSERT (one row per user per day in the downloaded payload)
5. Fetch + dump pull_requests (since last_synced_at) → UPSERT by number
6. Fetch + dump deployments (since last_synced_at) → UPSERT by deployment_id
7. Fetch + dump deployment_statuses → UPSERT by (deployment_id, state, created_at)
8. Fetch + dump issues (since last_synced_at) → UPSERT by number
9. Fetch + dump workflow_runs (since last_synced_at) → UPSERT by run_id
10. Run bridge-resolver (deployment SHA → PR number)
11. Update sync_state for each resource
12. Mark sync_jobs as success
```

### Data Freshness Indicator

A Grafana text panel shows last sync time:
```sql
SELECT TO_CHAR(MAX(started_at), 'YYYY-MM-DD HH24:MI') || ' UTC' AS "Last Synced"
FROM sync_jobs WHERE status = 'success';
```

A stat panel shows sync error (if any):
```sql
SELECT error_message FROM sync_jobs ORDER BY started_at DESC LIMIT 1;
```

### docker-compose Setup

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: dora_metrics
      POSTGRES_USER: ${PG_USER}
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD", "pg_isready"]
      interval: 5s

  sync:
    build: .
    command: ["node", "dist/scripts/sync.js"]
    depends_on:
      postgres: { condition: service_healthy }
    env_file: .env
    restart: "no"              # one-shot: runs sync once on startup, exits

  sync-server:
    build: .
    command: ["node", "dist/index.js"]
    depends_on:
      postgres: { condition: service_healthy }
    env_file: .env
    ports: ["3001:3001"]

  grafana:
    image: grafana/grafana:11.0.0
    depends_on: [postgres]
    ports: ["3002:3000"]
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/var/lib/grafana/dashboards
      - grafanaData:/var/lib/grafana

volumes:
  pgdata:
  grafanaData:
```

**Mid-session re-sync** (user wants fresh data):
```bash
curl -s -X POST http://localhost:3001/api/sync
# Returns { "jobId": 5, "status": "started" }
# Monitor: curl http://localhost:3001/api/sync/status/5
```

---

## Fleet Execution Plan

> Agents work in parallel where dependencies allow. Each agent has clear validation criteria before handoff.

### PHASE 1: Foundation (Agent: `foundation`)

**Deliverables**:
- `src/db/schema.sql` — full v2 schema as documented above
- `src/db/connection.ts` — PostgreSQL pool using env vars
- `src/config.ts` — validate all required env vars on startup; fail fast with descriptive error
- `src/github/client.ts` — Octokit initialization with PAT from config
- `src/sync/schema-check.ts` — `assertSchemaMatch()` function
- `.env.example` — all required vars with placeholder values
- `package.json` — scripts: `build`, `start`, `dev`, `seed`, `sync`, `test`, `test:e2e`
- `tsconfig.json`, `vitest.config.ts`

**Validation**:
1. `npx tsc --noEmit` compiles zero errors
2. Schema DDL is valid SQL (parseable by `psql`)
3. `assertSchemaMatch()` throws `SchemaMismatchError` when API keys ∉ DB columns
4. `assertSchemaMatch()` passes when DB has extra columns (id, fetched_at)

---

### PHASE 2A: GitHub Fetchers (Agent: `fetchers`)

**Depends on**: Phase 1

**Deliverables**: All files in `src/github/`:

| File | Method/Endpoint | Key Behavior |
|---|---|---|
| `pull-requests.ts` | `pulls.list` + `pulls.get` | Paginated; fetch individual PR for additions/deletions; save raw JSON to `data/raw/pull-requests/` |
| `deployments.ts` | `repos.listDeployments` + `repos.listDeploymentStatuses` | Paginated; save raw JSON; one statuses call per deployment |
| `issues.ts` | `issues.listForRepo` | Paginated; filter to `issues` (not PRs) via `pull_request` field; save raw JSON |
| `workflow-runs.ts` | `actions.listWorkflowRunsForRepo` | Paginated; save raw JSON |
| `copilot-org-metrics.ts` | `octokit.rest.copilot.getUsageMetricsForOrg({ org })` | Two-step: get download_links → fetch each URL; parse NDJSON line-by-line; flatten `day_totals[]` into rows; save raw |
| `copilot-user-metrics.ts` | `octokit.request('GET /orgs/{org}/copilot/usage-metrics/reports/users-28-day/latest', ...)` | Two-step: get download_links → fetch each URL; parse NDJSON line-by-line; each line is one user-day record; save raw |
| `copilot-seats.ts` | `copilot.listCopilotSeats` | Paginated inline JSON; flatten `assignee.*` fields; save raw JSON |

**Validation**:
1. `npx tsc --noEmit` zero errors
2. Each fetcher saves a file to `data/raw/{endpoint}/` before returning data
3. Copilot report fetchers use `octokit.request()` with proper TypeScript types — no `as any` casts
4. `copilot-org-metrics.ts` and `copilot-user-metrics.ts` implement the two-step download-link pattern
5. Each list fetcher handles pagination via Octokit's `octokit.paginate()`
6. Rate limit backoff on `X-RateLimit-Remaining: 0`

---

### PHASE 2B: Seed Data Generator (Agent: `seeder`)

**Depends on**: Phase 1

**Deliverables**: `seed/config.ts`, `seed/generator.ts`, `scripts/seed.ts`

**Key requirements**:
- Generator produces objects shaped exactly like real API responses (field names must match)
- Generator writes to `data/raw/{endpoint}/seed-{date}.json` before any DB insert
- Load step calls the same INSERT logic as production sync (not a separate seed INSERT)
- 28-day window; all Copilot data within that window
- PR additions/deletions: realistic distribution (median 120 lines, skewed right)
- 70% of PRs authored by Copilot seat holders
- Seed includes users where `user_id` matches `copilot_seats.assignee_id` (referential integrity)

**Validation**:
1. `npm run seed` completes without error
2. `npm run seed:verify` prints DORA metrics within expected ranges (see v1 plan)
3. All joins in Grafana panel SQL return data (no empty results) after seeding

---

### PHASE 2C: Grafana Dashboards (Agent: `grafana`)

**Depends on**: Phase 1

**Deliverables**: All `grafana/` files including all 8 dashboards

**Requirements**:
- All 8 dashboard JSON files per the Dashboard Structure section
- Every panel has a non-empty `description` field (markdown: what it measures, insight, caveats)
- Every panel's SQL uses `$__timeFrom()`, `$__timeTo()` where applicable
- Each dashboard's `panels[0]` is a `text` panel with mode `markdown` (data source banner)
- DORA pillar dashboards (01–04) have title matching `DORA:*` and tag `dora`
- Copilot dashboards (05–07) have tag `copilot`
- All uids are unique across all 8 files
- `dashboard.yml` provider config points to the correct dashboards directory

**Validation**:
1. All 8 JSON files are valid JSON
2. `npm test` passes `dashboards.test.ts` — all structure checks pass for all 8 files
3. `postgres.yml` and `dashboard.yml` are valid YAML
4. Every panel has a non-empty `description` field
5. DORA pillar dashboards each have an `environment` template variable

---

### PHASE 3: Sync Engine & Routes (Agent: `sync-engine`)

**Depends on**: Phase 2A

**Deliverables**: `src/sync/orchestrator.ts`, `src/sync/bridge-resolver.ts`, `src/sync/state.ts`, `src/routes/sync.ts`, `src/routes/status.ts`

**Key requirements**:
- Orchestrator runs `assertSchemaMatch()` for all tables before any INSERT; aborts on mismatch
- Orchestrator calls each fetcher, saves raw files, then INSERTs to DB
- Copilot tables are TRUNCATE + INSERT (full reload; 28-day window)
- DORA tables are UPSERT by natural key (incremental)
- Bridge resolver: direct SHA match + squash merge fallback
- `POST /api/sync`: returns `{ jobId, status: 'started' }` immediately; runs sync in background
- `GET /api/sync/status/:jobId`: returns job status from `sync_jobs`
- Schema mismatch error stored in `sync_jobs.error_message`

**Validation**:
1. `npx tsc --noEmit` zero errors
2. `POST /api/sync` returns 200 with `jobId`
3. Schema mismatch triggers `status: 'failed'` with descriptive `error_message`
4. TRUNCATE + INSERT for Copilot tables confirmed (not UPSERT)
5. UPSERT (ON CONFLICT DO UPDATE) for DORA tables confirmed

---

### PHASE 4: Polish, Error Handling & Documentation (Agent: `polish`)

**Depends on**: Phases 2B, 2C, 3

**Key requirements**:
- Retry logic (3 retries, exponential backoff) in each fetcher
- Request timeout (30s) on all Octokit calls
- README with setup guide, architecture diagram, PAT scopes, sync usage
- `setup-db.sh`: creates database + runs `schema.sql`
- `data/raw/` added to `.gitignore`
- `package.json` scripts: `build`, `start`, `dev`, `seed`, `seed:verify`, `sync`, `test`, `test:e2e`

---

### PHASE 5: Testing (Agent: `testing`)

**Depends on**: Phases 2B, 2C, 3, 4

---

## Testing Strategy

Two layers — same approach as the existing codebase. No new testing tools introduced.

| Layer | Tool | Infrastructure | Command |
|---|---|---|---|
| **Unit** | Vitest | None — all DB/network calls are mocked | `npm test` |
| **E2E** | Playwright (Chromium) | PG + Grafana via docker-compose | `npm run test:e2e` |

**Vitest config** (`vitest.config.ts`): `include: ['tests/**/*.test.ts']`, environment: `node`.  
**Playwright config** (`playwright.config.ts`): `baseURL: 'http://localhost:3002'`, Chromium, `retries: 1`, screenshots on failure, trace on first retry, `timeout: 60_000`.

---

### Unit Tests — Patterns & File Inventory

All unit tests follow the patterns established in the existing codebase:

#### Pattern 1: Mocking the DB pool (all tests that touch the DB)

```typescript
// Define mockPool BEFORE vi.mock() — Vitest hoists vi.mock() to top of file
const mockPool = { query: vi.fn() };

vi.mock('../src/db/connection', () => ({
  getPool: vi.fn(() => mockPool),
}));
```

#### Pattern 2: Mocking the rate-limit wrapper (all fetcher tests)

```typescript
vi.mock('../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));
```

#### Pattern 3: Mocking Octokit (fetcher tests)

```typescript
const octokit = {
  rest: {
    pulls: { list: vi.fn(), get: vi.fn().mockResolvedValue({ data: { additions: 10, deletions: 5 } }) },
  },
  // Discriminate by method to return different data per API call
  paginate: vi.fn(async (method: any, params?: any) => {
    if (method === octokit.rest.pulls.list) return mockPRs;
    return [];
  }),
} as any;
```

#### Pattern 4: Config tests (env var isolation)

```typescript
beforeEach(() => { vi.resetModules(); process.env = { ...originalEnv }; });
afterEach(() => { process.env = originalEnv; });

it('throws on missing GITHUB_TOKEN', async () => {
  delete process.env.GITHUB_TOKEN;
  await expect(() => import('../src/config')).rejects.toThrow('GITHUB_TOKEN');
});
```

#### Pattern 5: Route handler extraction (route tests)

```typescript
import { default as router } from '../src/routes/data-mode';

const handler = router.stack
  .find((layer: any) => layer.route?.path === '/')
  ?.route?.stack[0]?.handle;

const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
await handler({} as any, res);
expect(res.json).toHaveBeenCalledWith({ ... });
```

#### Pattern 6: Dashboard JSON structure validation (no running Grafana needed)

```typescript
import { readFileSync, readdirSync } from 'fs';
const dashboard = JSON.parse(readFileSync(join(dashboardDir, filename), 'utf-8'));
expect(dashboard.uid).toBeTruthy();
expect(dashboard.panels[0].type).toBe('text'); // description/banner panel first
```

---

### Unit Test File Inventory

**`tests/config.test.ts`**  
Mirrors existing pattern exactly. Add new assertions for `DATA_MODE`, `DATA_SOURCE_LABEL` env vars:
- Throws on missing `GITHUB_TOKEN`, `PG_HOST`, `GITHUB_ORG`, `GITHUB_REPO`
- Returns valid config when all vars present (check `config.dataMode`, `config.dataSourceLabel`)
- `DATA_MODE` defaults to `'live'` when not set

**`tests/seed-config.test.ts`**  
Mirrors existing pattern. Update for new config shape:
- `SEED_REFERENCE_REPO` env var overrides `referenceRepo`
- `windowDays` defaults to 28
- `copilotSeatCount` is present and less than `users`

**`tests/schema-check.test.ts`**  
New test for `assertSchemaMatch()`:
```typescript
const mockPool = { query: vi.fn() };
vi.mock('../src/db/connection', () => ({ getPool: vi.fn(() => mockPool) }));

it('throws SchemaMismatchError when API key is missing from DB columns', async () => {
  mockPool.query.mockResolvedValue({ rows: [{ column_name: 'id' }, { column_name: 'date' }] });
  const apiRecord = { date: '2024-01-01', new_field: 42 };
  await expect(assertSchemaMatch('copilot_org_metrics', apiRecord, mockPool as any))
    .rejects.toThrow(/new_field/);
});

it('passes when DB has extra infrastructure columns (id, fetched_at)', async () => {
  mockPool.query.mockResolvedValue({
    rows: [{ column_name: 'id' }, { column_name: 'date' }, { column_name: 'fetched_at' }, { column_name: 'total_active_users' }],
  });
  const apiRecord = { date: '2024-01-01', total_active_users: 50 };
  await expect(assertSchemaMatch('copilot_org_metrics', apiRecord, mockPool as any))
    .resolves.toBeUndefined();
});
```

**`tests/bridge-resolver.test.ts`**  
Mirrors existing test — keep as-is, adapting for new `deployment_id` column name (was `github_deployment_id` in v1):
- Direct SHA match inserts bridge link
- No unlinked deployments returns 0
- *(Squash fallback test added as a new case)*

**`tests/seed-generator.test.ts`**  
Update for new schema — `copilotUserActivity` is replaced by `copilotSeats` and `copilotOrgMetrics`:
```typescript
it('generates copilot_seats with seat holders', () => {
  expect(data.copilotSeats.length).toBe(SEED_CONFIG.copilotSeatCount);
  for (const seat of data.copilotSeats) {
    expect(seat.assignee_login).toBeTruthy();
    expect(seat.assignee_id).toBeGreaterThan(0);
    expect(seat.last_activity_at).toBeInstanceOf(Date);
    expect(seat.last_activity_editor).toBeTruthy();
  }
});

it('generates 28 rows of copilot_org_metrics', () => {
  expect(data.copilotOrgMetrics.length).toBe(28);
  for (const row of data.copilotOrgMetrics) {
    expect(row.date).toBeTruthy();
    expect(row.total_active_users).toBeGreaterThan(0);
    expect(row.total_code_lines_accepted).toBeGreaterThanOrEqual(0);
    expect(row.total_code_lines_suggested).toBeGreaterThanOrEqual(row.total_code_lines_accepted);
    expect(row.copilot_ide_code_completions).toBeDefined(); // JSONB column present
  }
});

it('generates ~70% of PRs by copilot seat holders', () => {
  const seatIds = new Set(data.copilotSeats.map(s => s.assignee_id));
  const copilotPRs = data.pullRequests.filter(pr => seatIds.has(pr.user_id));
  const ratio = copilotPRs.length / data.pullRequests.length;
  expect(ratio).toBeGreaterThan(0.5);
  expect(ratio).toBeLessThan(0.9);
});
```
Retain from existing tests: users count, PR field validity, deployment distributions, incident labels, hotfix/bugfix/rollback labels, workflow runs.

**`tests/dashboards.test.ts`**  
Replaces existing `dashboards.test.ts`. Extended to cover all 8 dashboard files. Uses `describe.each` for common structure checks (same pattern as existing):

```typescript
const ALL_DASHBOARDS = [
  '00-overview.json',
  '01-deployment-frequency.json',
  '02-lead-time.json',
  '03-change-failure-rate.json',
  '04-mean-time-to-recovery.json',
  '05-copilot-adoption.json',
  '06-copilot-code-impact.json',
  '07-dora-vs-copilot.json',
];

const DORA_PILLAR_DASHBOARDS = ALL_DASHBOARDS.slice(1, 5);

// Common checks (describe.each over ALL_DASHBOARDS):
// - file is valid JSON
// - has unique uid
// - has non-empty title and description
// - first panel (panels[0]) is type 'text' with mode 'markdown' (data source banner / description)
// - panel IDs are unique across the dashboard
// - at least one panel has targets[0].rawSql

// DORA-specific checks (describe.each over DORA_PILLAR_DASHBOARDS):
// - title matches /^DORA:/
// - has 'dora' tag
// - has 'environment' template variable

// Copilot dashboard checks:
// - '05-copilot-adoption.json' has 'copilot' tag and 'copilot' in panel titles
// - '06-copilot-code-impact.json' has panels referencing copilot_org_metrics or copilot_seats

// Cross-dashboard checks:
// - no uid collisions across all 8 dashboards
// - DORA pillars collectively cover all 4 pillars by title

// Data source banner check:
// - every dashboard's first text panel contains the word 'data' or 'source' or 'mode'
```

**`tests/data-mode.test.ts`**  
Replaces existing `data-source.test.ts`. Same handler-extraction pattern:
- Returns `{ mode: 'seed', source_label: '...', ... }` when table has a row
- Returns `{ mode: 'unknown' }` when table is empty
- Returns 500 on DB error

**`tests/fetchers/pull-requests.test.ts`**  
Mirrors existing test. Add assertions for file dump creation:
```typescript
it('writes raw JSON file to data/raw/pull-requests/', async () => {
  const writeSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue();
  await fetchPullRequests(octokit, 'owner', 'repo');
  expect(writeSpy).toHaveBeenCalledWith(
    expect.stringContaining('data/raw/pull-requests/'),
    expect.any(String)
  );
});
```
*(Apply same file dump assertion pattern to all fetcher tests below.)*

**`tests/fetchers/deployments.test.ts`**  
Mirrors existing test. Keep: fetches deployments + statuses, `since` filter works. Add: file dump assertion.

**`tests/fetchers/copilot-org-metrics.test.ts`**  
New test for the two-step download-link pattern and `day_totals` flattening:
```typescript
it('fetches download_links, downloads each URL, flattens day_totals into rows', async () => {
  const mockDayTotals = [{
    day: '2024-01-15',
    organization_id: 'org-1',
    daily_active_users: 45,
    loc_added_sum: 630,
    loc_suggested_to_add_sum: 1700,
    pull_requests: { total_created: 5, total_merged: 4, total_created_by_copilot: 1 },
    totals_by_feature: [{ feature: 'code_completion', loc_added_sum: 630 }],
    totals_by_ide: [{ ide: 'vscode', loc_added_sum: 630 }],
    totals_by_language_feature: [],
    totals_by_language_model: [],
    totals_by_model_feature: [],
  }];
  const downloadedPayload = [{ report_start_day: '2024-01-01', day_totals: mockDayTotals }];

  // Mock: octokit.request returns download_links envelope
  const octokit = {
    request: vi.fn(async () => ({
      data: { download_links: ['https://example.com/report.json'], report_start_day: '2024-01-01', report_end_day: '2024-01-28' }
    })),
  } as any;

  // Mock: global fetch returns the downloaded JSON
  global.fetch = vi.fn(async () => ({ json: async () => downloadedPayload })) as any;

  const result = await fetchCopilotOrgMetrics(octokit, 'my-org');

  expect(result[0].day).toBe('2024-01-15');
  expect(result[0].loc_added_sum).toBe(630);
  expect(result[0].pull_requests).toEqual(mockDayTotals[0].pull_requests);
  expect(result[0].totals_by_feature).toEqual(mockDayTotals[0].totals_by_feature);
});

it('writes raw JSON file to data/raw/copilot-org-metrics/', async () => { ... });
```

**`tests/fetchers/copilot-user-metrics.test.ts`**  
New test for per-user download pattern:
```typescript
it('fetches download_links, downloads each URL, returns user-day records', async () => {
  const mockUserRecords = [{
    day: '2024-01-15',
    user_id: 1001,
    user_login: 'dev1',
    loc_added_sum: 120,
    loc_suggested_to_add_sum: 200,
    used_agent: true,
    used_chat: true,
    used_cli: false,
    totals_by_ide: [{ ide: 'vscode', loc_added_sum: 120 }],
  }];

  const octokit = {
    request: vi.fn(async () => ({
      data: { download_links: ['https://example.com/users.json'], report_start_day: '2024-01-01', report_end_day: '2024-01-28' }
    })),
  } as any;

  global.fetch = vi.fn(async () => ({ json: async () => mockUserRecords })) as any;

  const result = await fetchCopilotUserMetrics(octokit, 'my-org');

  expect(result[0].user_login).toBe('dev1');
  expect(result[0].loc_added_sum).toBe(120);
  expect(result[0].used_agent).toBe(true);
  expect(result[0].totals_by_ide).toEqual(mockUserRecords[0].totals_by_ide);
});

it('writes raw JSON file to data/raw/copilot-user-metrics/', async () => { ... });
```

**`tests/fetchers/copilot-seats.test.ts`**  
New test for `assignee.*` field flattening:
```typescript
it('flattens assignee fields to top-level columns', async () => {
  const mockSeats = [{
    assignee: { login: 'dev1', id: 1001, type: 'User' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-10T00:00:00Z',
    last_activity_at: '2024-01-10T12:00:00Z',
    last_activity_editor: 'vscode',
    plan_type: 'business',
    pending_cancellation_date: null,
  }];

  const octokit = {
    rest: { copilot: { listCopilotSeats: vi.fn() } },
    paginate: vi.fn(async () => mockSeats),
  } as any;

  const result = await fetchCopilotSeats(octokit, 'my-org');

  expect(result[0].assignee_login).toBe('dev1');
  expect(result[0].assignee_id).toBe(1001);
  expect(result[0].assignee_type).toBe('User');
  expect(result[0].last_activity_editor).toBe('vscode');
  // Original nested assignee object should NOT be present as a key
  expect(result[0]).not.toHaveProperty('assignee');
});

it('writes raw JSON file to data/raw/copilot-seats/', async () => { ... });
```

---

### E2E Test Files

All E2E tests live in `tests/e2e/`. Same `playwright.config.ts` as existing codebase — no changes needed:
- `baseURL: 'http://localhost:3002'` (Grafana port)
- Chromium only, `retries: 1`, screenshots on failure, trace on first retry

Three spec files divided by concern:

---

**`tests/e2e/overview-dashboard.spec.ts`**

```typescript
const OVERVIEW_URL = '/d/overview/engineering-overview?orgId=1&from=now-28d&to=now';

test.describe('Overview Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(OVERVIEW_URL);
    await expect(page.locator('.dashboard-container, [class*="dashboard"]').first())
      .toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
  });

  test('dashboard title is correct', async ({ page }) => {
    await expect(page).toHaveTitle(/Engineering Overview/, { timeout: 15_000 });
  });

  test('data source banner shows data mode', async ({ page }) => {
    // Banner row contains one of the known mode labels
    const banner = page.locator('[data-panelid], [class*="panel"]')
      .filter({ hasText: /Live Data|Seed Data|Demo Environment/ }).first();
    await expect(banner).toBeVisible({ timeout: 10_000 });
  });

  test('DORA scorecard stat panels display numeric values', async ({ page }) => {
    const scorecardPanels = [
      'Deployment Frequency', 'Lead Time', 'Change Fail Rate', 'MTTR',
    ];
    for (const title of scorecardPanels) {
      const panel = page.locator('[data-panelid], [class*="panel"]')
        .filter({ hasText: title }).first();
      await expect(panel).toBeVisible({ timeout: 10_000 });
      const text = await panel.innerText();
      expect(/\d/.test(text), `${title} should show a number`).toBe(true);
    }
  });

  test('Copilot summary stat panels display numeric values', async ({ page }) => {
    const copilotStats = ['Active Copilot Seats', 'Acceptance Rate', 'Lines Accepted'];
    for (const title of copilotStats) {
      const panel = page.locator('[data-panelid], [class*="panel"]')
        .filter({ hasText: title }).first();
      await expect(panel).toBeVisible({ timeout: 10_000 });
      const text = await panel.innerText();
      expect(/\d/.test(text)).toBe(true);
    }
  });
});
```

---

**`tests/e2e/dora-dashboards.spec.ts`**

Covers the four DORA pillar dashboards (01–04) using `test.describe` blocks. Each pillar has:
1. Dashboard loads without error (`page.toHaveTitle`)
2. Data source banner visible
3. KPI stat card shows a numeric value (the primary DORA metric card)
4. Trend chart has canvas/SVG elements
5. Detail table has data rows using `[role="row"]:has([role="gridcell"])`

```typescript
// Scroll pattern mirrors existing dashboard.spec.ts:
await page.evaluate(async () => {
  const scrollContainer = document.querySelector('.scrollbar-view') ?? document.documentElement;
  const totalHeight = scrollContainer.scrollHeight;
  for (let i = 0; i < totalHeight; i += 500) {
    scrollContainer.scrollTop = i;
    await new Promise(r => setTimeout(r, 300));
  }
  scrollContainer.scrollTop = 0;
});
await page.waitForLoadState('networkidle');

// Table row assertion mirrors existing dashboard.spec.ts:
const rows = panel.locator('table tbody tr, [role="row"]:has([role="gridcell"])');
expect(await rows.count()).toBeGreaterThan(0);
```

Specific assertions per pillar:

| Dashboard | KPI Panel Title | Trend Panel | Table Panel |
|---|---|---|---|
| 01-deployment-frequency | `Deployment Frequency` | `Deployments per Week` | `Recent Deployments` |
| 02-lead-time | `Change Lead Time` | `Change Lead Time over Time` | `Slowest PRs` |
| 03-change-failure-rate | `Change Fail Rate` | `Change Fail Rate over Time` | `Open Incidents` |
| 04-mean-time-to-recovery | `MTTR` | `MTTR over Time` | `Recent Failures` |

---

**`tests/e2e/copilot-dashboards.spec.ts`**

Covers dashboards 05–07 with adapted scroll percentages (same `.scrollbar-view` pattern):

```typescript
// Dashboard 05: Copilot Adoption
test('seat utilization rate shows a percentage', async ({ page }) => {
  const panel = page.locator('[data-panelid], [class*="panel"]')
    .filter({ hasText: 'Seat Utilization Rate' }).first();
  await expect(panel).toBeVisible({ timeout: 10_000 });
  const text = await panel.innerText();
  expect(/\d+(\.\d+)?%?/.test(text)).toBe(true);
});

test('seat activity table has rows', async ({ page }) => {
  // Scroll to bottom ~65% like existing test
  await page.evaluate(() => {
    const sc = document.querySelector('.scrollbar-view') ?? document.documentElement;
    sc.scrollTop = sc.scrollHeight * 0.65;
  });
  await page.waitForLoadState('networkidle');
  const panel = page.locator('[data-panelid], [class*="panel"]')
    .filter({ hasText: 'Seat Activity Recency' }).first();
  const rows = panel.locator('table tbody tr, [role="row"]:has([role="gridcell"])');
  expect(await rows.count()).toBeGreaterThan(0);
});

// Dashboard 06: Copilot Code Impact
test('Lines Accepted stat shows a number', async ({ page }) => { ... });
test('leaderboard table has rows', async ({ page }) => { ... });

// Dashboard 07: DORA x Copilot
test('cohort comparison panel renders chart elements', async ({ page }) => {
  const panel = page.locator('[data-panelid], [class*="panel"]')
    .filter({ hasText: 'DORA Metrics Comparison' }).first();
  const chart = panel.locator('canvas, svg, [class*="graph"], [class*="chart"]');
  expect(await chart.count()).toBeGreaterThan(0);
});
```

---

### Full Unit Test File List

```
tests/
├── config.test.ts                      (updated — add DATA_MODE, DATA_SOURCE_LABEL)
├── seed-config.test.ts                 (updated — windowDays=28, copilotSeatCount)
├── schema-check.test.ts                (new — assertSchemaMatch, SchemaMismatchError)
├── bridge-resolver.test.ts             (updated — adapt column name; add squash fallback)
├── seed-generator.test.ts              (updated — copilotSeats, copilotOrgMetrics shapes)
├── dashboards.test.ts                  (updated — all 8 dashboards; describe.each pattern)
├── data-mode.test.ts                   (new — replaces data-source.test.ts)
└── fetchers/
    ├── pull-requests.test.ts           (updated — add file dump assertion)
    ├── deployments.test.ts             (updated — add file dump assertion)
    ├── issues.test.ts                  (updated — add file dump assertion)
    ├── workflow-runs.test.ts           (updated — add file dump assertion)
    ├── copilot-org-metrics.test.ts     (new — nested → flat aggregate, file dump)
    └── copilot-seats.test.ts           (new — assignee.* flattening, file dump)
```

### Full E2E Test File List

```
tests/e2e/
├── overview-dashboard.spec.ts          (new)
├── dora-dashboards.spec.ts             (new — covers dashboards 01–04)
└── copilot-dashboards.spec.ts          (new — covers dashboards 05–07)
```

### Phase 5 Validation Criteria

1. `npm test` (`npx vitest run`) — zero failures across all unit test files
2. All new test files follow the `mockPool-before-vi.mock` pattern
3. `dashboards.test.ts` passes for all 8 dashboard JSON files
4. `npm run test:e2e` — all three spec files pass against seeded PG + Grafana
5. Data source banner is visible and contains a mode label in every E2E test
6. No E2E test hardcodes panel positions or pixel offsets — all use `.filter({ hasText })` selectors

---

## Notes & Considerations

- **v1 Codebase**: The existing `src/` files should be deleted entirely before starting Phase 1. This is a full rebuild, not an incremental migration.
- **users-1-day / org-1-day**: These are documented stable endpoints as of API version `2026-03-10`. Use `octokit.request()` with proper TypeScript typing (not `as any`). Use `*-28-day/latest` for the primary 28-day sync; use `*-1-day` only if backfilling individual days.
- **Do NOT use `octokit.rest.copilot.usageMetricsForOrg`**: This is the retired `GET /orgs/{org}/copilot/metrics` endpoint — it returned direct JSON with only basic aggregates (no PR metrics, CLI metrics, agent metrics, LoC breakdowns) and was officially **retired April 2, 2026**. Any code calling it will receive errors. Use `octokit.rest.copilot.getUsageMetricsForOrg` instead.
- **Signed URLs expire**: Never store `download_links` in the DB. Always download and persist the NDJSON payload immediately after calling the report endpoint.
- **Enterprise endpoints optional**: `enterprises/{enterprise}/copilot/usage-metrics/reports/...` require elevated permissions not available in all environments. Skip gracefully with a logged warning if `GITHUB_ENTERPRISE` env var is not set or returns 403.
- **Real GitHub IDs**: `pull_requests.user_id` and `copilot_seats.assignee_id` must use real GitHub numeric IDs from the API. The v1 codebase used `hashString(login)` — this is wrong and must not be replicated.
- **Copilot Retention**: The Copilot Metrics API returns a maximum of 28 days. Grafana's default time range picker for Copilot dashboards should default to "Last 28 days."
- **Rate Limits**: A PAT has 5,000 req/hr. Initial sync may be expensive if the repo has many PRs. Use `octokit.paginate()` with rate limit backoff. Subsequent incremental syncs will be cheap.
- **Labels for DORA**: Change Fail Rate requires issues labeled `incident`. Rework Rate requires PRs labeled `hotfix`, `bugfix`, or `rollback`. Teams must adopt these conventions. The dashboard shows a warning annotation if no incident-labeled issues exist in the time range.
- **Grafana Version**: Pin to `11.0.0` in docker-compose to prevent selector drift in E2E tests. Grafana 11 renders table panels as `div[role=grid]`, not HTML `<table>` elements.
