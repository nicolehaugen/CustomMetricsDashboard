-- ╔═══════════════════════════════════════════════════════╗
-- ║  SCHEMA: CustomMetricsDashboard (v2)                   ║
-- ╚═══════════════════════════════════════════════════════╝

-- ─── Infrastructure ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_state (
  resource       TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ,
  cursor         TEXT
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id             SERIAL PRIMARY KEY,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'running',
  records_synced JSONB,
  schema_drift   JSONB,
  error_message  TEXT
);

-- ─── DORA: Pull Requests ─────────────────────────────────

CREATE TABLE IF NOT EXISTS pull_requests (
  id                SERIAL PRIMARY KEY,
  number            INT NOT NULL UNIQUE,
  title             TEXT,
  state             TEXT NOT NULL,
  body              TEXT,
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  merged_at         TIMESTAMPTZ,
  merge_commit_sha  TEXT,
  draft             BOOLEAN,
  additions         INT,
  deletions         INT,
  changed_files     INT,
  user_login        TEXT,
  user_id           BIGINT,
  merged_by_login   TEXT,
  merged_by_id      BIGINT,
  head_sha          TEXT,
  head_ref          TEXT,
  base_ref          TEXT,
  labels            JSONB,
  requested_reviewers JSONB,
  assignees         JSONB,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_merged_at   ON pull_requests(merged_at);
CREATE INDEX IF NOT EXISTS idx_pr_created_at  ON pull_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_pr_user_id     ON pull_requests(user_id);

-- ─── DORA: Deployments ───────────────────────────────────

CREATE TABLE IF NOT EXISTS deployments (
  id                    SERIAL PRIMARY KEY,
  deployment_id         BIGINT NOT NULL UNIQUE,
  sha                   TEXT NOT NULL,
  ref                   TEXT,
  task                  TEXT,
  environment           TEXT NOT NULL,
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ,
  creator_login         TEXT,
  creator_id            BIGINT,
  payload               JSONB,
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dep_created_at   ON deployments(created_at);
CREATE INDEX IF NOT EXISTS idx_dep_environment  ON deployments(environment);
CREATE INDEX IF NOT EXISTS idx_dep_sha          ON deployments(sha);

-- ─── DORA: Deployment Statuses ───────────────────────────

CREATE TABLE IF NOT EXISTS deployment_statuses (
  id              SERIAL PRIMARY KEY,
  deployment_id   BIGINT NOT NULL REFERENCES deployments(deployment_id),
  state           TEXT NOT NULL,
  description     TEXT,
  environment     TEXT,
  environment_url TEXT,
  creator_login   TEXT,
  creator_id      BIGINT,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_depstatus_deployment_id ON deployment_statuses(deployment_id);
CREATE INDEX IF NOT EXISTS idx_depstatus_state         ON deployment_statuses(state);

-- ─── DORA: Deployment ↔ PR Bridge ────────────────────────

CREATE TABLE IF NOT EXISTS deployment_pull_requests (
  deployment_id  BIGINT NOT NULL REFERENCES deployments(deployment_id),
  pr_number      INT NOT NULL REFERENCES pull_requests(number),
  match_type     TEXT NOT NULL,
  PRIMARY KEY (deployment_id, pr_number)
);

-- ─── DORA: Issues (incidents) ────────────────────────────

CREATE TABLE IF NOT EXISTS issues (
  id             SERIAL PRIMARY KEY,
  number         INT NOT NULL UNIQUE,
  title          TEXT,
  state          TEXT NOT NULL,
  body           TEXT,
  created_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ,
  closed_at      TIMESTAMPTZ,
  user_login     TEXT,
  user_id        BIGINT,
  assignee_login TEXT,
  assignee_id    BIGINT,
  labels         JSONB,
  assignees      JSONB,
  milestone      JSONB,
  pull_request   JSONB,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at);
CREATE INDEX IF NOT EXISTS idx_issues_state      ON issues(state);

-- ─── DORA: Workflow Runs ─────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_runs (
  id               SERIAL PRIMARY KEY,
  run_id           BIGINT NOT NULL UNIQUE,
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
  actor_login      TEXT,
  actor_id         BIGINT,
  triggering_actor_login TEXT,
  triggering_actor_id    BIGINT,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_at  ON workflow_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_head_sha    ON workflow_runs(head_sha);

-- ─── Copilot: Org-Level Daily Metrics ───────────────────

CREATE TABLE IF NOT EXISTS copilot_org_metrics (
  id                                        SERIAL PRIMARY KEY,
  day                                       DATE NOT NULL UNIQUE,
  organization_id                           TEXT,
  daily_active_users                        INTEGER,
  weekly_active_users                       INTEGER,
  monthly_active_users                      INTEGER,
  monthly_active_agent_users                INTEGER,
  monthly_active_chat_users                 INTEGER,
  daily_active_cli_users                    INTEGER,
  daily_active_copilot_cloud_agent_users    INTEGER,
  weekly_active_copilot_cloud_agent_users   INTEGER,
  monthly_active_copilot_cloud_agent_users  INTEGER,
  code_acceptance_activity_count            INTEGER,
  code_generation_activity_count            INTEGER,
  user_initiated_interaction_count          INTEGER,
  loc_suggested_to_add_sum                  INTEGER,
  loc_suggested_to_delete_sum               INTEGER,
  loc_added_sum                             INTEGER,
  loc_deleted_sum                           INTEGER,
  pull_requests                             JSONB,
  totals_by_feature                         JSONB,
  totals_by_ide                             JSONB,
  totals_by_language_feature                JSONB,
  totals_by_language_model                  JSONB,
  totals_by_model_feature                   JSONB,
  totals_by_cli                             JSONB,
  raw_data                                  JSONB NOT NULL DEFAULT '{}',
  fetched_at                                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_org_metrics_day ON copilot_org_metrics(day);

-- ─── Copilot: Per-User Seat Data ─────────────────────────

CREATE TABLE IF NOT EXISTS copilot_seats (
  id                        SERIAL PRIMARY KEY,
  assignee_login            TEXT,
  assignee_id               BIGINT UNIQUE,
  assignee_type             TEXT,
  created_at                TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ,
  pending_cancellation_date DATE,
  last_activity_at          TIMESTAMPTZ,
  last_activity_editor      TEXT,
  plan_type                 TEXT,
  fetched_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_seats_assignee_id       ON copilot_seats(assignee_id);
CREATE INDEX IF NOT EXISTS idx_copilot_seats_last_activity_at  ON copilot_seats(last_activity_at);

-- ─── Copilot: Per-User Daily Metrics ────────────────────

CREATE TABLE IF NOT EXISTS copilot_user_metrics (
  id                               SERIAL PRIMARY KEY,
  day                              DATE NOT NULL,
  user_id                          BIGINT,
  user_login                       TEXT NOT NULL,
  enterprise_id                    TEXT,
  organization_id                  TEXT,
  user_initiated_interaction_count INTEGER,
  code_generation_activity_count   INTEGER,
  code_acceptance_activity_count   INTEGER,
  loc_suggested_to_add_sum         INTEGER,
  loc_suggested_to_delete_sum      INTEGER,
  loc_added_sum                    INTEGER,
  loc_deleted_sum                  INTEGER,
  used_agent                       BOOLEAN,
  used_chat                        BOOLEAN,
  used_cli                         BOOLEAN,
  used_copilot_coding_agent        BOOLEAN,
  used_copilot_code_review_active  BOOLEAN,
  used_copilot_code_review_passive BOOLEAN,
  used_copilot_coding_agent        BOOLEAN,
  totals_by_ide                    JSONB,
  totals_by_feature                JSONB,
  totals_by_language_feature       JSONB,
  totals_by_language_model         JSONB,
  totals_by_model_feature          JSONB,
  totals_by_cli                    JSONB,
  raw_data                         JSONB NOT NULL DEFAULT '{}',
  fetched_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_user_metrics_day        ON copilot_user_metrics(day);
CREATE INDEX IF NOT EXISTS idx_copilot_user_metrics_login       ON copilot_user_metrics(user_login);
CREATE UNIQUE INDEX IF NOT EXISTS idx_copilot_user_metrics_day_user ON copilot_user_metrics(day, user_login);

-- ─── Dashboard Config: Data Mode ─────────────────────────

CREATE TABLE IF NOT EXISTS data_mode (
  id           SERIAL PRIMARY KEY,
  mode         TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_url   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
