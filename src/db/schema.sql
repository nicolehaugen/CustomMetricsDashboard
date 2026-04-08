-- DORA Metrics Dashboard — PostgreSQL Schema
-- Run with: psql -d dora_metrics -f src/db/schema.sql

-- ═══ Raw Event Tables ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  github_user_id BIGINT UNIQUE NOT NULL,
  login         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS copilot_user_activity (
  id                SERIAL PRIMARY KEY,
  user_id           INT REFERENCES users(id),
  activity_date     DATE NOT NULL,
  is_active         BOOLEAN NOT NULL,
  metrics_json      JSONB,
  -- Rich fields from GitHub Copilot Metrics API
  last_activity_at  TIMESTAMPTZ,
  interaction_count INT DEFAULT 0,
  last_surface      TEXT,           -- 'vscode', 'intellij', 'neovim', 'cli', 'dotcom'
  used_coding_agent BOOLEAN DEFAULT false,
  used_code_review  BOOLEAN DEFAULT false,
  completions_count INT DEFAULT 0,
  chat_interactions INT DEFAULT 0,
  acceptance_rate   REAL,
  UNIQUE (user_id, activity_date)
);

CREATE TABLE IF NOT EXISTS pull_requests (
  id                SERIAL PRIMARY KEY,
  number            INT UNIQUE NOT NULL,
  author_user_id    INT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL,
  merged_at         TIMESTAMPTZ,
  merge_commit_sha  TEXT,
  title             TEXT,
  state             TEXT NOT NULL,
  labels            JSONB,
  additions         INT,
  deletions         INT
);

CREATE TABLE IF NOT EXISTS deployments (
  id                  SERIAL PRIMARY KEY,
  github_deployment_id BIGINT UNIQUE NOT NULL,
  environment         TEXT NOT NULL,
  sha                 TEXT NOT NULL,
  ref                 TEXT,
  created_at          TIMESTAMPTZ NOT NULL,
  creator_user_id     INT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS deployment_statuses (
  id              SERIAL PRIMARY KEY,
  deployment_id   INT REFERENCES deployments(id),
  state           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id              SERIAL PRIMARY KEY,
  github_run_id   BIGINT UNIQUE NOT NULL,
  workflow_name   TEXT,
  conclusion      TEXT,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ,
  run_started_at  TIMESTAMPTZ,
  head_sha        TEXT
);

CREATE TABLE IF NOT EXISTS issues (
  id                SERIAL PRIMARY KEY,
  number            INT UNIQUE NOT NULL,
  title             TEXT,
  labels            JSONB,
  state             TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL,
  closed_at         TIMESTAMPTZ,
  assignee_user_id  INT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS code_scanning_alerts (
  id              SERIAL PRIMARY KEY,
  alert_number    INT UNIQUE NOT NULL,
  severity        TEXT,
  state           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,
  fixed_at        TIMESTAMPTZ,
  tool_name       TEXT
);

-- ═══ Bridge Tables ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS deployment_pull_requests (
  deployment_id   INT REFERENCES deployments(id),
  pull_request_id INT REFERENCES pull_requests(id),
  PRIMARY KEY (deployment_id, pull_request_id)
);

-- ═══ Operational Tables ═════════════════════════════════════

CREATE TABLE IF NOT EXISTS sync_state (
  resource_name   TEXT PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ,
  cursor          TEXT,
  etag            TEXT
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id              SERIAL PRIMARY KEY,
  status          TEXT NOT NULL DEFAULT 'running',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  error_message   TEXT,
  records_synced  INT DEFAULT 0
);

-- ═══ Indexes for Grafana Query Performance ══════════════════

CREATE INDEX IF NOT EXISTS idx_deployments_env_created ON deployments(environment, created_at);
CREATE INDEX IF NOT EXISTS idx_deployment_statuses_state ON deployment_statuses(deployment_id, state);
CREATE INDEX IF NOT EXISTS idx_pull_requests_merged ON pull_requests(merged_at) WHERE merged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_runs_conclusion ON workflow_runs(conclusion, created_at);
CREATE INDEX IF NOT EXISTS idx_issues_incident ON issues(created_at) WHERE labels @> '[{"name": "incident"}]';
CREATE INDEX IF NOT EXISTS idx_copilot_activity_date ON copilot_user_activity(activity_date, is_active);
