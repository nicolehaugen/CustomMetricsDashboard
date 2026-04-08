export interface User {
  id: number;
  github_user_id: number;
  login: string;
}

export interface CopilotUserActivity {
  id: number;
  user_id: number;
  activity_date: Date;
  is_active: boolean;
  metrics_json: Record<string, unknown> | null;
}

export interface PullRequest {
  id: number;
  number: number;
  author_user_id: number;
  created_at: Date;
  merged_at: Date | null;
  merge_commit_sha: string | null;
  title: string | null;
  state: string;
  labels: Array<{ name: string }> | null;
  additions: number | null;
  deletions: number | null;
}

export interface Deployment {
  id: number;
  github_deployment_id: number;
  environment: string;
  sha: string;
  ref: string | null;
  created_at: Date;
  creator_user_id: number | null;
}

export interface DeploymentStatus {
  id: number;
  deployment_id: number;
  state: string;
  created_at: Date;
}

export interface WorkflowRun {
  id: number;
  github_run_id: number;
  workflow_name: string | null;
  conclusion: string | null;
  created_at: Date;
  updated_at: Date | null;
  run_started_at: Date | null;
  head_sha: string | null;
}

export interface Issue {
  id: number;
  number: number;
  title: string | null;
  labels: Array<{ name: string }> | null;
  state: string;
  created_at: Date;
  closed_at: Date | null;
  assignee_user_id: number | null;
}

export interface CodeScanningAlert {
  id: number;
  alert_number: number;
  severity: string | null;
  state: string;
  created_at: Date;
  fixed_at: Date | null;
  tool_name: string | null;
}

export interface DeploymentPullRequest {
  deployment_id: number;
  pull_request_id: number;
}

export interface SyncState {
  resource_name: string;
  last_synced_at: Date | null;
  cursor: string | null;
  etag: string | null;
}

export interface SyncJob {
  id: number;
  status: 'running' | 'completed' | 'failed';
  started_at: Date;
  finished_at: Date | null;
  error_message: string | null;
  records_synced: number;
}
