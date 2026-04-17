// seed/generator.ts
import * as crypto from 'crypto';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomHex(len: number): string {
  return crypto.randomBytes(len).toString('hex');
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface SeedData {
  users: SeedUser[];
  copilotUsers: SeedUser[];
  pullRequests: PullRequestSeed[];
  deployments: DeploymentSeed[];
  deploymentStatuses: DeploymentStatusSeed[];
  issues: IssueSeed[];
  workflowRuns: WorkflowRunSeed[];
  copilotOrgMetrics: CopilotOrgMetricSeed[];
  copilotUserMetrics: CopilotUserMetricSeed[];
  copilotSeats: CopilotSeatSeed[];
}

export interface SeedUser {
  login: string;
  id: number;
}

export interface PullRequestSeed {
  number: number;
  title: string;
  state: string;
  body: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  draft: boolean;
  additions: number;
  deletions: number;
  changed_files: number;
  user_login: string;
  user_id: number;
  merged_by_login: string | null;
  merged_by_id: number | null;
  head_sha: string;
  head_ref: string;
  base_ref: string;
  labels: unknown[];
  requested_reviewers: unknown[];
  assignees: unknown[];
}

export interface DeploymentSeed {
  deployment_id: number;
  sha: string;
  ref: string;
  task: string;
  environment: string;
  description: string;
  created_at: string;
  updated_at: string;
  creator_login: string;
  creator_id: number;
  payload: unknown;
}

export interface DeploymentStatusSeed {
  deployment_id: number;
  state: string;
  description: string;
  environment: string;
  environment_url: string | null;
  creator_login: string;
  creator_id: number;
  created_at: string;
  updated_at: string;
}

export interface IssueSeed {
  number: number;
  title: string;
  state: string;
  body: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user_login: string;
  user_id: number;
  assignee_login: string | null;
  assignee_id: number | null;
  labels: unknown[];
  assignees: unknown[];
  milestone: null;
  pull_request: null;
}

export interface WorkflowRunSeed {
  run_id: number;
  name: string;
  workflow_id: number;
  head_branch: string;
  head_sha: string;
  run_number: number;
  event: string;
  status: string;
  conclusion: string;
  created_at: string;
  updated_at: string;
  run_started_at: string;
  run_attempt: number;
  actor_login: string;
  actor_id: number;
  triggering_actor_login: string;
  triggering_actor_id: number;
}

export interface CopilotOrgMetricSeed {
  day: string;
  organization_id: string;
  daily_active_users: number;
  weekly_active_users: number;
  monthly_active_users: number;
  monthly_active_agent_users: number;
  monthly_active_chat_users: number;
  daily_active_cli_users: number;
  code_acceptance_activity_count: number;
  code_generation_activity_count: number;
  user_initiated_interaction_count: number;
  loc_suggested_to_add_sum: number;
  loc_suggested_to_delete_sum: number;
  loc_added_sum: number;
  loc_deleted_sum: number;
  pull_requests: unknown;
  totals_by_feature: unknown;
  totals_by_ide: unknown;
  totals_by_language_feature: unknown;
  totals_by_language_model: unknown;
  totals_by_model_feature: unknown;
  totals_by_cli: unknown;
}

export interface CopilotUserMetricSeed {
  day: string;
  user_id: number;
  user_login: string;
  organization_id: string;
  user_initiated_interaction_count: number;
  code_generation_activity_count: number;
  code_acceptance_activity_count: number;
  loc_suggested_to_add_sum: number;
  loc_suggested_to_delete_sum: number;
  loc_added_sum: number;
  loc_deleted_sum: number;
  used_agent: boolean;
  used_chat: boolean;
  used_cli: boolean;
  used_copilot_code_review_active: boolean;
  used_copilot_code_review_passive: boolean;
  used_copilot_coding_agent: boolean;
  totals_by_ide: unknown;
  totals_by_feature: unknown;
  totals_by_language_feature: unknown;
  totals_by_language_model: unknown;
  totals_by_model_feature: unknown;
  totals_by_cli: unknown;
}

export interface CopilotSeatSeed {
  assignee_login: string;
  assignee_id: number;
  assignee_type: string;
  created_at: string;
  updated_at: string;
  pending_cancellation_date: null;
  last_activity_at: string;
  last_activity_editor: string;
  plan_type: string;
}

export function generateSeedData(config: {
  users: number;
  prs: number;
  deploymentsPerWeek: { min: number; max: number };
  deploymentSuccessRate: number;
  incidentRate: number;
  reworkRate: number;
  copilotSeatCount: number;
  windowDays: number;
  environments: string[];
}): SeedData {
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowDays * 24 * 60 * 60 * 1000);

  // Generate users
  const users: SeedUser[] = Array.from({ length: config.users }, (_, i) => ({
    login: `dev${String(i + 1).padStart(2, '0')}`,
    id: 10001 + i,
  }));

  const copilotUsers = users.slice(0, config.copilotSeatCount);
  const nonCopilotUsers = users.slice(config.copilotSeatCount);

  // Generate pull requests
  const pullRequests: PullRequestSeed[] = [];
  const mergedSHAs: string[] = [];

  for (let i = 0; i < config.prs; i++) {
    const isCopilotPR = Math.random() < 0.70;
    const author = isCopilotPR
      ? randomChoice(copilotUsers)
      : randomChoice(nonCopilotUsers.length > 0 ? nonCopilotUsers : copilotUsers);

    const createdAt = randomDate(windowStart, new Date(now.getTime() - 60 * 60 * 1000));
    const isOpen = Math.random() < 0.10;
    const isMerged = !isOpen;

    const mergedAt = isMerged
      ? new Date(createdAt.getTime() + randomInt(30, 72 * 60) * 60 * 1000)
      : null;
    const closedAt = isMerged ? mergedAt : (Math.random() < 0.02 ? new Date(createdAt.getTime() + randomInt(60, 120) * 60 * 1000) : null);

    const mergeCommitSha = isMerged ? randomHex(20) : null;
    if (mergeCommitSha) mergedSHAs.push(mergeCommitSha);

    const isHotfix = isMerged && Math.random() < config.reworkRate;
    const labels = isHotfix
      ? [{ id: 1, name: randomChoice(['hotfix', 'bugfix', 'rollback']), color: 'e11d48' }]
      : [];

    const additions = Math.floor(Math.exp(randomInt(20, 700) / 100) * 5); // skewed right distribution
    const deletions = Math.floor(additions * (0.1 + Math.random() * 0.8));

    pullRequests.push({
      number: 1000 + i,
      title: `${isHotfix ? 'fix: ' : 'feat: '}change ${i + 1}`,
      state: isOpen ? 'open' : 'closed',
      body: 'Seed PR body',
      created_at: createdAt.toISOString(),
      updated_at: (mergedAt ?? closedAt ?? createdAt).toISOString(),
      closed_at: closedAt?.toISOString() ?? null,
      merged_at: mergedAt?.toISOString() ?? null,
      merge_commit_sha: mergeCommitSha,
      draft: false,
      additions,
      deletions,
      changed_files: Math.ceil(additions / 20),
      user_login: author.login,
      user_id: author.id,
      merged_by_login: isMerged ? author.login : null,
      merged_by_id: isMerged ? author.id : null,
      head_sha: randomHex(20),
      head_ref: `feature/change-${i + 1}`,
      base_ref: 'main',
      labels,
      requested_reviewers: [],
      assignees: [],
    });
  }

  // Generate deployments
  const deployments: DeploymentSeed[] = [];
  const deploymentStatuses: DeploymentStatusSeed[] = [];
  let deploymentCounter = 50001;

  for (let week = 0; week < 4; week++) {
    const weekStart = new Date(windowStart.getTime() + week * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const deploysThisWeek = randomInt(config.deploymentsPerWeek.min, config.deploymentsPerWeek.max);

    for (let d = 0; d < deploysThisWeek; d++) {
      const env = randomChoice(config.environments);
      const sha = mergedSHAs.length > 0 ? randomChoice(mergedSHAs) : randomHex(20);
      const createdAt = randomDate(weekStart, weekEnd);
      const isSuccess = Math.random() < config.deploymentSuccessRate;
      const deployer = randomChoice(users);

      deployments.push({
        deployment_id: deploymentCounter,
        sha,
        ref: 'main',
        task: 'deploy',
        environment: env,
        description: `Deploy to ${env}`,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
        creator_login: deployer.login,
        creator_id: deployer.id,
        payload: {},
      });

      // Status: pending → success/failure
      const pendingAt = createdAt.toISOString();
      const finalAt = new Date(createdAt.getTime() + randomInt(2, 20) * 60 * 1000).toISOString();

      deploymentStatuses.push({
        deployment_id: deploymentCounter,
        state: 'pending',
        description: 'Deployment queued',
        environment: env,
        environment_url: null,
        creator_login: deployer.login,
        creator_id: deployer.id,
        created_at: pendingAt,
        updated_at: pendingAt,
      });

      deploymentStatuses.push({
        deployment_id: deploymentCounter,
        state: isSuccess ? 'success' : 'failure',
        description: isSuccess ? 'Deployment succeeded' : 'Deployment failed',
        environment: env,
        environment_url: isSuccess ? `https://${env}.example.com` : null,
        creator_login: deployer.login,
        creator_id: deployer.id,
        created_at: finalAt,
        updated_at: finalAt,
      });

      deploymentCounter++;
    }
  }

  // Generate issues
  const issues: IssueSeed[] = [];
  const issueCount = 25;
  for (let i = 0; i < issueCount; i++) {
    const isIncident = Math.random() < config.incidentRate;
    const author = randomChoice(users);
    const createdAt = randomDate(windowStart, now);
    const isClosed = Math.random() < 0.7;
    const closedAt = isClosed
      ? new Date(createdAt.getTime() + randomInt(30, 240) * 60 * 1000).toISOString()
      : null;

    issues.push({
      number: 2000 + i,
      title: isIncident ? `Incident: service degradation ${i}` : `Bug: issue ${i}`,
      state: isClosed ? 'closed' : 'open',
      body: 'Issue body',
      created_at: createdAt.toISOString(),
      updated_at: (closedAt ? new Date(closedAt) : createdAt).toISOString(),
      closed_at: closedAt,
      user_login: author.login,
      user_id: author.id,
      assignee_login: Math.random() < 0.5 ? randomChoice(users).login : null,
      assignee_id: Math.random() < 0.5 ? randomChoice(users).id : null,
      labels: isIncident ? [{ id: 10, name: 'incident', color: 'red' }] : [],
      assignees: [],
      milestone: null,
      pull_request: null,
    });
  }

  // Generate workflow runs
  const workflowRuns: WorkflowRunSeed[] = [];
  for (let i = 0; i < 200; i++) {
    const isSuccess = Math.random() < 0.80;
    const actor = randomChoice(users);
    const createdAt = randomDate(windowStart, now);

    workflowRuns.push({
      run_id: 80001 + i,
      name: randomChoice(['CI', 'Deploy', 'Test Suite', 'Lint']),
      workflow_id: randomInt(100, 200),
      head_branch: 'main',
      head_sha: randomHex(20),
      run_number: i + 1,
      event: randomChoice(['push', 'pull_request', 'workflow_dispatch']),
      status: 'completed',
      conclusion: isSuccess ? 'success' : randomChoice(['failure', 'cancelled']),
      created_at: createdAt.toISOString(),
      updated_at: new Date(createdAt.getTime() + randomInt(60, 1200) * 1000).toISOString(),
      run_started_at: createdAt.toISOString(),
      run_attempt: 1,
      actor_login: actor.login,
      actor_id: actor.id,
      triggering_actor_login: actor.login,
      triggering_actor_id: actor.id,
    });
  }

  // Generate copilot org metrics (28 days)
  const copilotOrgMetrics: CopilotOrgMetricSeed[] = [];
  for (let i = 0; i < 28; i++) {
    const day = new Date(windowStart.getTime() + i * 24 * 60 * 60 * 1000);
    const dayStr = day.toISOString().slice(0, 10);
    const dau = randomInt(55, 75);
    const suggested = randomInt(1500, 3500);
    const accepted = Math.floor(suggested * (0.25 + Math.random() * 0.15));

    copilotOrgMetrics.push({
      day: dayStr,
      organization_id: 'org-seed-001',
      daily_active_users: dau,
      weekly_active_users: Math.floor(dau * 1.4),
      monthly_active_users: Math.floor(dau * 2.1),
      monthly_active_agent_users: Math.floor(dau * 0.3),
      monthly_active_chat_users: Math.floor(dau * 0.6),
      daily_active_cli_users: randomInt(2, 8),
      code_acceptance_activity_count: randomInt(80, 200),
      code_generation_activity_count: randomInt(150, 400),
      user_initiated_interaction_count: randomInt(50, 150),
      loc_suggested_to_add_sum: suggested,
      loc_suggested_to_delete_sum: Math.floor(suggested * 0.3),
      loc_added_sum: accepted,
      loc_deleted_sum: Math.floor(accepted * 0.2),
      pull_requests: {
        total_created: randomInt(3, 8),
        total_reviewed: randomInt(5, 12),
        total_merged: randomInt(3, 7),
        total_created_by_copilot: randomInt(0, 2),
        total_reviewed_by_copilot: randomInt(1, 4),
        median_minutes_to_merge: randomInt(120, 1440),
        median_minutes_to_merge_copilot_authored: randomInt(60, 720),
        total_suggestions: randomInt(10, 50),
        total_applied_suggestions: randomInt(5, 25),
        total_copilot_suggestions: randomInt(5, 20),
        total_copilot_applied_suggestions: randomInt(2, 10),
      },
      totals_by_feature: [
        { feature: 'code_completion', loc_added_sum: Math.floor(accepted * 0.6), code_acceptance_activity_count: randomInt(50, 120) },
        { feature: 'chat_panel_ask_mode', loc_added_sum: Math.floor(accepted * 0.25), code_acceptance_activity_count: randomInt(20, 60) },
        { feature: 'agent_edit', loc_added_sum: Math.floor(accepted * 0.15), code_acceptance_activity_count: randomInt(10, 30) },
      ],
      totals_by_ide: [
        { ide: 'vscode', loc_added_sum: Math.floor(accepted * 0.65) },
        { ide: 'jetbrains', loc_added_sum: Math.floor(accepted * 0.25) },
        { ide: 'neovim', loc_added_sum: Math.floor(accepted * 0.10) },
      ],
      totals_by_language_feature: [
        { language: 'TypeScript', feature: 'code_completion', loc_added_sum: Math.floor(accepted * 0.4) },
        { language: 'Python', feature: 'code_completion', loc_added_sum: Math.floor(accepted * 0.2) },
      ],
      totals_by_language_model: [],
      totals_by_model_feature: [],
      totals_by_cli: {
        session_count: randomInt(5, 20),
        request_count: randomInt(20, 80),
        token_usage: randomInt(5000, 50000),
      },
    });
  }

  // Generate copilot seats
  const editors = ['vscode', 'jetbrains', 'neovim', 'vscode'];
  const copilotSeats: CopilotSeatSeed[] = copilotUsers.map(user => {
    const assignedAt = new Date(windowStart.getTime() - randomInt(1, 60) * 24 * 60 * 60 * 1000);
    const lastActivity = randomDate(windowStart, now);
    return {
      assignee_login: user.login,
      assignee_id: user.id,
      assignee_type: 'User',
      created_at: assignedAt.toISOString(),
      updated_at: lastActivity.toISOString(),
      pending_cancellation_date: null,
      last_activity_at: lastActivity.toISOString(),
      last_activity_editor: randomChoice(editors),
      plan_type: 'business',
    };
  });

  // Generate copilot user metrics (per copilot user, per day for 28 days)
  const copilotUserMetrics: CopilotUserMetricSeed[] = [];
  for (const user of copilotUsers) {
    for (let i = 0; i < config.windowDays; i++) {
      const day = new Date(windowStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dayStr = day.toISOString().slice(0, 10);
      const isActive = Math.random() < 0.75;
      if (!isActive) continue;
      const suggested = randomInt(50, 400);
      const accepted = Math.floor(suggested * (0.2 + Math.random() * 0.5));
      copilotUserMetrics.push({
        day: dayStr,
        user_id: user.id,
        user_login: user.login,
        organization_id: 'org-seed-001',
        user_initiated_interaction_count: randomInt(5, 30),
        code_generation_activity_count: randomInt(10, 80),
        code_acceptance_activity_count: randomInt(5, 50),
        loc_suggested_to_add_sum: suggested,
        loc_suggested_to_delete_sum: Math.floor(suggested * 0.2),
        loc_added_sum: accepted,
        loc_deleted_sum: Math.floor(accepted * 0.15),
        used_agent: Math.random() < 0.3,
        used_chat: Math.random() < 0.6,
        used_cli: Math.random() < 0.15,
        used_copilot_code_review_active: Math.random() < 0.2,
        used_copilot_code_review_passive: Math.random() < 0.4,
        used_copilot_coding_agent: Math.random() < 0.1,
        totals_by_ide: [{ ide: randomChoice(editors), loc_added_sum: accepted }],
        totals_by_feature: [{ feature: 'code_completion', loc_added_sum: accepted }],
        totals_by_language_feature: [],
        totals_by_language_model: [],
        totals_by_model_feature: [],
        totals_by_cli: {},
      });
    }
  }

  return {
    users,
    copilotUsers,
    pullRequests,
    deployments,
    deploymentStatuses,
    issues,
    workflowRuns,
    copilotOrgMetrics,
    copilotUserMetrics,
    copilotSeats,
  };
}
