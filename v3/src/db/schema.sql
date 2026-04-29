-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SCHEMA: CustomMetricsDashboard v3                           ║
-- ║                                                              ║
-- ║  Column names match GitHub API field names exactly.          ║
-- ║  Scalar fields → typed columns.                              ║
-- ║  Nested objects/arrays → JSONB columns.                      ║
-- ║                                                              ║
-- ║  New API fields are auto-added by applyDrift() on each sync. ║
-- ║  This file is the floor, not the ceiling.                    ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ─── Infrastructure ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_jobs (
  id             SERIAL PRIMARY KEY,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'running',   -- running | success | failed
  records_synced JSONB,                              -- { "pull_requests": 42, ... }
  schema_drift   JSONB,                              -- auto-applied ALTER TABLE log
  error_message  TEXT
);

-- Key-value store for app metadata (org, repo, last_synced_at)
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index of every Grafana panel's rawSql, populated at server start.
-- Used by the "Drift not yet visualized" panel to find drift columns
-- that do not appear in any dashboard SQL.
CREATE TABLE IF NOT EXISTS dashboard_panel_sql (
  dashboard_uid  TEXT NOT NULL,
  panel_id       INT  NOT NULL,
  panel_title    TEXT,
  raw_sql        TEXT NOT NULL,
  indexed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (dashboard_uid, panel_id)
);

-- Index of every (table, column) pair declared in this schema.sql file,
-- populated at server start by parsing the file inside the container.
-- Used by the "Drift not yet in schema.sql" panel to find drift columns
-- that have been auto-applied at runtime but never codified into
-- version control.
CREATE TABLE IF NOT EXISTS schema_columns (
  table_name   TEXT NOT NULL,
  column_name  TEXT NOT NULL,
  indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_name, column_name)
);

-- User-managed list of (table, column, scope) entries to hide from the
-- drift detection tables on the Overview dashboard. Populated via the
-- `/drift/ignore` and `/drift/unignore` HTTP endpoints (clicked from
-- the dashboard's "Ignore" / "Unignore" cell links).
--   scope='schema'  → hide only from the "not yet in schema.sql" table
--   scope='panel'   → hide only from the "not yet visualized" table
-- NOTE: persistence is tied to the postgres volume — `docker compose
-- down -v` clears all ignores. There is no other backing store.
CREATE TABLE IF NOT EXISTS drift_ignores (
  table_name   TEXT NOT NULL,
  column_name  TEXT NOT NULL,
  scope        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_name, column_name, scope)
);

-- ─── DORA: Pull Requests ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS pull_requests (
  id               BIGINT PRIMARY KEY,
  number           INT NOT NULL UNIQUE,
  title            TEXT,
  state            TEXT NOT NULL,
  body             TEXT,
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  merged_at        TIMESTAMPTZ,
  merge_commit_sha TEXT,
  draft            BOOLEAN,
  additions        INT,
  deletions        INT,
  changed_files    INT,
  -- Nested objects stored as JSONB (source-faithful)
  "user"           JSONB,      -- { login, id, type, ... }
  merged_by        JSONB,      -- { login, id, ... }
  head             JSONB,      -- { sha, ref, ... }
  base             JSONB,      -- { ref, ... }
  -- Arrays stored as JSONB
  labels           JSONB,
  requested_reviewers JSONB,
  assignees        JSONB
);

CREATE INDEX IF NOT EXISTS idx_pr_merged_at   ON pull_requests(merged_at);
CREATE INDEX IF NOT EXISTS idx_pr_created_at  ON pull_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_pr_user_id     ON pull_requests((("user"->>'id')::bigint));

-- ─── DORA: Deployments ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS deployments (
  id          BIGINT PRIMARY KEY,
  sha         TEXT NOT NULL,
  ref         TEXT,
  task        TEXT,
  environment TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ,
  creator     JSONB,
  payload     JSONB
);

CREATE INDEX IF NOT EXISTS idx_dep_created_at   ON deployments(created_at);
CREATE INDEX IF NOT EXISTS idx_dep_environment  ON deployments(environment);
CREATE INDEX IF NOT EXISTS idx_dep_sha          ON deployments(sha);

-- ─── DORA: Deployment Statuses ───────────────────────────────

CREATE TABLE IF NOT EXISTS deployment_statuses (
  id              BIGINT PRIMARY KEY,
  deployment_id   BIGINT NOT NULL REFERENCES deployments(id),
  state           TEXT NOT NULL,
  description     TEXT,
  environment     TEXT,
  environment_url TEXT,
  creator         JSONB,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_depstatus_deployment_id ON deployment_statuses(deployment_id);
CREATE INDEX IF NOT EXISTS idx_depstatus_state         ON deployment_statuses(state);

-- ─── DORA: Deployment ↔ PR Bridge ────────────────────────────

CREATE TABLE IF NOT EXISTS deployment_pr_links (
  deployment_id BIGINT NOT NULL REFERENCES deployments(id),
  pr_number     INT NOT NULL REFERENCES pull_requests(number),
  match_type    TEXT NOT NULL,
  PRIMARY KEY (deployment_id, pr_number)
);

-- ─── DORA: Issues (for incident tracking / CFR / MTTR) ───────

CREATE TABLE IF NOT EXISTS issues (
  id         BIGINT PRIMARY KEY,
  number     INT NOT NULL UNIQUE,
  title      TEXT,
  state      TEXT NOT NULL,
  body       TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,
  closed_at  TIMESTAMPTZ,
  "user"     JSONB,
  assignee   JSONB,
  labels     JSONB,
  assignees  JSONB,
  milestone  JSONB,
  pull_request JSONB
);

CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at);
CREATE INDEX IF NOT EXISTS idx_issues_state      ON issues(state);

-- ─── DORA: Workflow Runs ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_runs (
  id               BIGINT PRIMARY KEY,
  name             TEXT,
  workflow_id      BIGINT,
  head_branch      TEXT,
  head_sha         TEXT,
  run_number       INT,
  event            TEXT,
  status           TEXT,
  conclusion       TEXT,
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ,
  run_started_at   TIMESTAMPTZ,
  run_attempt      INT,
  actor            JSONB,
  triggering_actor JSONB
);

CREATE INDEX IF NOT EXISTS idx_workflow_created_at ON workflow_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_head_sha   ON workflow_runs(head_sha);

-- ─── Copilot: Enterprise-Level Daily Metrics ─────────────────

CREATE TABLE IF NOT EXISTS copilot_enterprise_daily (
  day                              DATE NOT NULL UNIQUE,
  enterprise_id                    TEXT,
  daily_active_users               BIGINT,
  weekly_active_users              BIGINT,
  monthly_active_users             BIGINT,
  -- drift: added 2026-04-28
  daily_active_copilot_cloud_agent_users   BIGINT,
  weekly_active_copilot_cloud_agent_users  BIGINT,
  monthly_active_copilot_cloud_agent_users BIGINT,
  -- drift: added 2026-04-29
  daily_active_copilot_code_review_users    BIGINT,
  daily_passive_copilot_code_review_users   BIGINT,
  weekly_active_copilot_code_review_users   BIGINT,
  weekly_passive_copilot_code_review_users  BIGINT,
  monthly_active_copilot_code_review_users  BIGINT,
  monthly_passive_copilot_code_review_users BIGINT,
  monthly_active_agent_users       BIGINT,
  monthly_active_chat_users        BIGINT,
  daily_active_cli_users           BIGINT,
  code_acceptance_activity_count   BIGINT,
  code_generation_activity_count   BIGINT,
  user_initiated_interaction_count BIGINT,
  loc_suggested_to_add_sum         BIGINT,
  loc_suggested_to_delete_sum      BIGINT,
  loc_added_sum                    BIGINT,
  loc_deleted_sum                  BIGINT,
  totals_by_feature                JSONB,
  totals_by_ide                    JSONB,
  totals_by_language_feature       JSONB,
  totals_by_language_model         JSONB,
  totals_by_model_feature          JSONB,
  totals_by_cli                    JSONB,
  pull_requests                    JSONB
);

CREATE INDEX IF NOT EXISTS idx_copent_day ON copilot_enterprise_daily(day);

-- ─── Copilot: Organization-Level Daily Metrics ───────────────

CREATE TABLE IF NOT EXISTS copilot_organization_daily (
  day                              DATE NOT NULL,
  organization_id                  TEXT,
  daily_active_users               BIGINT,
  weekly_active_users              BIGINT,
  monthly_active_users             BIGINT,
  daily_active_copilot_cloud_agent_users   BIGINT,
  weekly_active_copilot_cloud_agent_users  BIGINT,
  monthly_active_copilot_cloud_agent_users BIGINT,
  -- drift: added 2026-04-29
  daily_active_copilot_code_review_users    BIGINT,
  daily_passive_copilot_code_review_users   BIGINT,
  weekly_active_copilot_code_review_users   BIGINT,
  weekly_passive_copilot_code_review_users  BIGINT,
  monthly_active_copilot_code_review_users  BIGINT,
  monthly_passive_copilot_code_review_users BIGINT,
  monthly_active_agent_users       BIGINT,
  monthly_active_chat_users        BIGINT,
  daily_active_cli_users           BIGINT,
  code_acceptance_activity_count   BIGINT,
  code_generation_activity_count   BIGINT,
  user_initiated_interaction_count BIGINT,
  loc_suggested_to_add_sum         BIGINT,
  loc_suggested_to_delete_sum      BIGINT,
  loc_added_sum                    BIGINT,
  loc_deleted_sum                  BIGINT,
  totals_by_feature                JSONB,
  totals_by_ide                    JSONB,
  totals_by_language_feature       JSONB,
  totals_by_language_model         JSONB,
  totals_by_model_feature          JSONB,
  totals_by_cli                    JSONB,
  pull_requests                    JSONB,
  PRIMARY KEY (day, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_coporg_day ON copilot_organization_daily(day);

-- ─── Copilot: Per-User Daily Metrics ─────────────────────────

CREATE TABLE IF NOT EXISTS copilot_user_daily (
  day                              DATE NOT NULL,
  user_login                       TEXT NOT NULL,
  "user"                           JSONB,
  enterprise_id                    TEXT,
  organization_id                  TEXT,
  user_initiated_interaction_count BIGINT,
  code_generation_activity_count   BIGINT,
  code_acceptance_activity_count   BIGINT,
  loc_suggested_to_add_sum         BIGINT,
  loc_suggested_to_delete_sum      BIGINT,
  loc_added_sum                    BIGINT,
  loc_deleted_sum                  BIGINT,
  used_agent                       BOOLEAN,
  used_chat                        BOOLEAN,
  used_cli                         BOOLEAN,
  used_copilot_coding_agent        BOOLEAN,
  used_copilot_code_review_active  BOOLEAN,
  used_copilot_code_review_passive BOOLEAN,
  -- drift: added 2026-04-29
  used_copilot_cloud_agent         BOOLEAN,
  totals_by_ide                    JSONB,
  totals_by_feature                JSONB,
  totals_by_language_feature       JSONB,
  totals_by_language_model         JSONB,
  totals_by_model_feature          JSONB,
  totals_by_cli                    JSONB,
  PRIMARY KEY (day, user_login)
);

CREATE INDEX IF NOT EXISTS idx_copuser_day   ON copilot_user_daily(day);
CREATE INDEX IF NOT EXISTS idx_copuser_login ON copilot_user_daily(user_login);

-- ─── Copilot: Seat Assignments (org-scoped) ───────────────────

CREATE TABLE IF NOT EXISTS copilot_seats (
  assignee                  JSONB,
  created_at                TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ,
  pending_cancellation_date DATE,
  last_activity_at          TIMESTAMPTZ,
  last_activity_editor      TEXT,
  plan_type                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_copseats_last_activity ON copilot_seats(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_copseats_assignee_id   ON copilot_seats(((assignee->>'id')::bigint));
