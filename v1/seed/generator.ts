import { SEED_CONFIG } from './config';

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomDate(start: Date, end: Date): Date {
  if (start >= end) return new Date(start);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateSha(): string {
  const hex = '0123456789abcdef';
  return Array.from({ length: 40 }, () => hex[Math.floor(Math.random() * 16)]).join('');
}

/** Returns a value in [min, max] skewed toward min (higher skew = more skew). */
function skewedRandom(min: number, max: number, skew: number): number {
  return min + Math.pow(Math.random(), skew) * (max - min);
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMultiple<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

// ── Seed Data Types ───────────────────────────────────────────────────────────

export interface SeedUser {
  id: number;
  github_user_id: number;
  login: string;
}

export interface SeedPullRequest {
  id: number;
  number: number;
  author_user_id: number;
  created_at: Date;
  merged_at: Date | null;
  merge_commit_sha: string | null;
  title: string;
  state: string;
  labels: Array<{ name: string }>;
  additions: number;
  deletions: number;
}

export interface SeedDeployment {
  id: number;
  github_deployment_id: number;
  environment: string;
  sha: string;
  ref: string;
  created_at: Date;
  creator_user_id: number;
}

export interface SeedDeploymentStatus {
  id: number;
  deployment_id: number;
  state: string;
  created_at: Date;
}

export interface SeedDeploymentPullRequest {
  deployment_id: number;
  pull_request_id: number;
}

export interface SeedIssue {
  id: number;
  number: number;
  title: string;
  labels: Array<{ name: string }>;
  state: string;
  created_at: Date;
  closed_at: Date | null;
  assignee_user_id: number;
}

export interface SeedWorkflowRun {
  id: number;
  github_run_id: number;
  workflow_name: string;
  conclusion: string;
  created_at: Date;
  updated_at: Date;
  run_started_at: Date;
  head_sha: string;
}

export interface SeedCodeScanningAlert {
  id: number;
  alert_number: number;
  severity: string;
  state: string;
  created_at: Date;
  fixed_at: Date | null;
  tool_name: string;
}

export interface SeedCopilotUserActivity {
  id: number;
  user_id: number;
  activity_date: string;
  is_active: boolean;
  metrics_json: Record<string, unknown>;
  last_activity_at: Date | null;
  interaction_count: number;
  last_surface: string | null;
  used_coding_agent: boolean;
  used_code_review: boolean;
  completions_count: number;
  chat_interactions: number;
  acceptance_rate: number | null;
}

export interface GeneratedData {
  users: SeedUser[];
  pullRequests: SeedPullRequest[];
  deployments: SeedDeployment[];
  deploymentStatuses: SeedDeploymentStatus[];
  deploymentPullRequests: SeedDeploymentPullRequest[];
  issues: SeedIssue[];
  workflowRuns: SeedWorkflowRun[];
  codeScanningAlerts: SeedCodeScanningAlert[];
  copilotUserActivity: SeedCopilotUserActivity[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const USERNAMES = [
  'mona-octocat', 'sarah-dev', 'john-platform', 'alex-sre', 'chris-backend',
  'sam-cloud', 'pat-frontend', 'taylor-devops', 'jordan-ml', 'casey-infra',
  'morgan-security', 'riley-data', 'quinn-api', 'avery-test', 'blake-ci',
  'drew-deploy', 'jamie-mobile', 'skyler-docs',
];

const PR_TITLES = [
  'feat: add user authentication flow',
  'fix: resolve database connection timeout',
  'chore: update dependencies to latest',
  'feat: implement search functionality',
  'fix: correct pagination offset logic',
  'refactor: extract service layer from controller',
  'feat: add API rate limiting middleware',
  'fix: handle null pointer in JSON parser',
  'test: add unit tests for auth module',
  'feat: implement webhook event handlers',
  'fix: resolve race condition in job queue',
  'feat: add dark mode theme support',
  'perf: optimize database query performance',
  'feat: implement file upload endpoint',
  'fix: correct timezone handling in scheduler',
  'ci: update GitHub Actions workflow config',
  'feat: add notification delivery system',
  'fix: resolve memory leak in cache layer',
  'feat: implement Redis caching layer',
  'refactor: clean up error handling patterns',
  'feat: add health check endpoint',
  'fix: prevent duplicate webhook deliveries',
  'docs: update API reference documentation',
  'feat: implement RBAC permissions system',
  'fix: resolve SSL certificate validation issue',
];

const INCIDENT_TITLES = [
  'Incident: Service degradation detected',
  'Incident: API error rate elevated',
  'Incident: Database connection pool exhausted',
  'Incident: Deployment rollback required',
  'Incident: Memory usage spike in production',
  'Incident: Request latency above SLA threshold',
  'Incident: Auth service intermittent failures',
  'Incident: CDN cache invalidation failure',
];

const WORKFLOW_NAMES = [
  'CI', 'build-and-test', 'lint-and-format', 'security-scan', 'deploy-pipeline',
];

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'warning'];

const SCAN_TOOLS = ['CodeQL', 'dependabot', 'secret-scanning'];

// ── Generator Functions ───────────────────────────────────────────────────────

function generateUsers(): SeedUser[] {
  return USERNAMES.slice(0, SEED_CONFIG.counts.users).map((login, i) => ({
    id: i + 1,
    github_user_id: 1_000_000 + i * 1000 + randomBetween(1, 999),
    login,
  }));
}

function generatePullRequests(
  users: SeedUser[],
  startDate: Date,
  endDate: Date,
): SeedPullRequest[] {
  const prs: SeedPullRequest[] = [];
  const { pullRequests: count, hotfixRatio } = SEED_CONFIG.counts;
  const prEndDate = addDays(endDate, -5); // leave room for merge

  for (let i = 0; i < count; i++) {
    const createdAt = randomDate(startDate, prEndDate);
    const isMerged = Math.random() < 0.88;
    // Cycle time 1h–120h (5 days), skewed short (median ~12h)
    const cycleHours = skewedRandom(1, 120, 3.5);
    const mergedAt = isMerged ? addHours(createdAt, cycleHours) : null;
    const sha = isMerged ? generateSha() : null;

    const isHotfix = Math.random() < hotfixRatio;
    const labels: Array<{ name: string }> = [];
    if (isHotfix) {
      labels.push({ name: pickRandom(['hotfix', 'bugfix', 'rollback']) });
    }
    if (Math.random() < 0.3) labels.push({ name: 'enhancement' });
    if (Math.random() < 0.15) labels.push({ name: 'documentation' });

    prs.push({
      id: i + 1,
      number: i + 1,
      author_user_id: pickRandom(users).id,
      created_at: createdAt,
      merged_at: mergedAt,
      merge_commit_sha: sha,
      title: pickRandom(PR_TITLES),
      state: isMerged ? 'merged' : 'closed',
      labels,
      additions: randomBetween(10, 500),
      deletions: randomBetween(5, 200),
    });
  }

  return prs;
}

interface DeploymentResult {
  deployments: SeedDeployment[];
  deploymentStatuses: SeedDeploymentStatus[];
  deploymentPullRequests: SeedDeploymentPullRequest[];
  failedProductionDeployments: Array<{
    deployment: SeedDeployment;
    status: SeedDeploymentStatus;
  }>;
}

function generateDeploymentsAndRelated(
  users: SeedUser[],
  mergedPrs: SeedPullRequest[],
  _startDate: Date,
  endDate: Date,
): DeploymentResult {
  // Walk through merged PRs chronologically, creating deployments in batches
  const sorted = [...mergedPrs].sort(
    (a, b) => a.merged_at!.getTime() - b.merged_at!.getTime(),
  );

  const deployments: SeedDeployment[] = [];
  const statuses: SeedDeploymentStatus[] = [];
  const bridge: SeedDeploymentPullRequest[] = [];
  const failedProd: Array<{
    deployment: SeedDeployment;
    status: SeedDeploymentStatus;
  }> = [];

  let deployId = 1;
  let statusId = 1;
  let ghDeployId = 500_000;
  let prIdx = 0;

  while (prIdx < sorted.length) {
    const batchSize = Math.min(randomBetween(1, 2), sorted.length - prIdx);
    const batch = sorted.slice(prIdx, prIdx + batchSize);
    prIdx += batchSize;

    const lastMerge = batch[batch.length - 1].merged_at!;
    const deployDelay = randomFloat(0.5, 4); // deploy 0.5–4h after last merge
    const deployAt = addHours(lastMerge, deployDelay);
    if (deployAt > endDate) continue;

    const sha = batch[batch.length - 1].merge_commit_sha!;

    // 60% production only, 25% staging only, 15% both environments
    const roll = Math.random();
    const envs: string[] =
      roll < 0.6
        ? ['production']
        : roll < 0.85
          ? ['staging']
          : ['staging', 'production'];

    for (const env of envs) {
      // staging deploys slightly before production when deploying to both
      const envDeployAt =
        env === 'staging' && envs.length > 1
          ? addMinutes(deployAt, -randomBetween(10, 60))
          : deployAt;

      const deploy: SeedDeployment = {
        id: deployId,
        github_deployment_id: ghDeployId++,
        environment: env,
        sha,
        ref: 'refs/heads/main',
        created_at: envDeployAt,
        creator_user_id: pickRandom(users).id,
      };
      deployments.push(deploy);

      for (const pr of batch) {
        bridge.push({ deployment_id: deployId, pull_request_id: pr.id });
      }

      // ~85% success, ~15% failure/error
      const isFailed = Math.random() < 0.15;
      const status: SeedDeploymentStatus = {
        id: statusId++,
        deployment_id: deployId,
        state: isFailed ? pickRandom(['failure', 'error']) : 'success',
        created_at: addMinutes(envDeployAt, randomBetween(2, 15)),
      };
      statuses.push(status);

      if (isFailed && env === 'production') {
        failedProd.push({ deployment: deploy, status });

        // Recovery deployment within 0.5–12 hours
        deployId++;
        const recoveryAt = addHours(envDeployAt, randomFloat(0.5, 12));
        const recovery: SeedDeployment = {
          id: deployId,
          github_deployment_id: ghDeployId++,
          environment: 'production',
          sha: generateSha(),
          ref: 'refs/heads/main',
          created_at: recoveryAt,
          creator_user_id: pickRandom(users).id,
        };
        deployments.push(recovery);
        statuses.push({
          id: statusId++,
          deployment_id: deployId,
          state: 'success',
          created_at: addMinutes(recoveryAt, randomBetween(2, 10)),
        });
      }

      deployId++;
    }
  }

  return {
    deployments,
    deploymentStatuses: statuses,
    deploymentPullRequests: bridge,
    failedProductionDeployments: failedProd,
  };
}

function generateIssues(
  failedProdDeployments: Array<{
    deployment: SeedDeployment;
    status: SeedDeploymentStatus;
  }>,
  users: SeedUser[],
  startingIssueNumber: number,
): SeedIssue[] {
  const now = new Date();
  const recentThreshold = addDays(now, -14);

  const issues = failedProdDeployments.map(({ deployment }, i) => {
    const createdAt = addHours(deployment.created_at, randomFloat(0, 24));
    const isRecent = createdAt > recentThreshold;
    const leaveOpen = isRecent && Math.random() < 0.4;
    const closedAt = leaveOpen ? null : addHours(createdAt, randomFloat(1, 48));

    return {
      id: i + 1,
      number: startingIssueNumber + i,
      title: `${pickRandom(INCIDENT_TITLES)} (${deployment.sha.substring(0, 7)})`,
      labels: [{ name: 'incident' }],
      state: leaveOpen ? 'open' : 'closed',
      created_at: createdAt,
      closed_at: closedAt,
      assignee_user_id: pickRandom(users).id,
    };
  });

  // Guarantee at least one open incident exists
  if (issues.length > 0 && !issues.some((iss) => iss.state === 'open')) {
    const last = issues[issues.length - 1];
    last.state = 'open';
    last.closed_at = null;
    // Move creation date to recent period so it appears in the dashboard time range
    last.created_at = addDays(now, -randomBetween(1, 7));
  }

  return issues;
}

function generateWorkflowRuns(prs: SeedPullRequest[]): SeedWorkflowRun[] {
  const runs: SeedWorkflowRun[] = [];
  let runId = 1;
  let ghRunId = 1_000_000;

  for (const pr of prs) {
    const numRuns = randomBetween(2, 3);
    for (let j = 0; j < numRuns; j++) {
      const startedAt = addMinutes(pr.created_at, randomBetween(1, 120));
      const durationMin = randomBetween(2, 30);
      const conclusion = Math.random() < 0.89 ? 'success' : 'failure';

      runs.push({
        id: runId++,
        github_run_id: ghRunId++,
        workflow_name: pickRandom(WORKFLOW_NAMES),
        conclusion,
        created_at: startedAt,
        updated_at: addMinutes(startedAt, durationMin),
        run_started_at: startedAt,
        head_sha: pr.merge_commit_sha || generateSha(),
      });
    }
  }

  return runs;
}

function generateCodeScanningAlerts(
  startDate: Date,
  endDate: Date,
): SeedCodeScanningAlert[] {
  const count = randomBetween(25, 40);
  return Array.from({ length: count }, (_, i) => {
    const createdAt = randomDate(startDate, endDate);
    const isFixed = Math.random() < 0.6;
    return {
      id: i + 1,
      alert_number: i + 1,
      severity: pickRandom(SEVERITIES),
      state: isFixed ? 'fixed' : 'open',
      created_at: createdAt,
      fixed_at: isFixed ? addHours(createdAt, randomFloat(2, 720)) : null,
      tool_name: pickRandom(SCAN_TOOLS),
    };
  });
}

const COPILOT_SURFACES = ['vscode', 'vscode', 'vscode', 'vscode', 'vscode', 'vscode',
  'intellij', 'intellij', 'neovim', 'cli', 'dotcom'] as const;

function generateCopilotActivity(
  users: SeedUser[],
  startDate: Date,
  numDays: number,
): SeedCopilotUserActivity[] {
  const activities: SeedCopilotUserActivity[] = [];
  let activityId = 1;

  // Designate ~copilotActiveRatio of users as Copilot users;
  // the rest get no activity records and appear as "Copilot Inactive" in cohort queries.
  const copilotUserCount = Math.round(users.length * SEED_CONFIG.counts.copilotActiveRatio);
  const copilotUsers = users.slice(0, copilotUserCount);

  // Assign each copilot user persistent traits
  const userTraits = copilotUsers.map(user => ({
    user,
    primarySurface: pickRandom(COPILOT_SURFACES),
    usesAgent: Math.random() < 0.30,       // ~30% use coding agent
    usesCodeReview: Math.random() < 0.40,   // ~40% use code review
    baseAcceptanceRate: randomFloat(0.20, 0.55), // each dev has a stable acceptance rate
    activityLevel: randomFloat(0.6, 0.95),  // probability of being active on any day
  }));

  for (let day = 0; day < numDays; day++) {
    const date = addDays(startDate, day);
    const dateStr = date.toISOString().split('T')[0];

    for (const traits of userTraits) {
      const isActive = Math.random() < traits.activityLevel;

      if (isActive) {
        const completions = randomBetween(5, 80);
        const chatCount = randomBetween(0, 25);
        const interactionCount = completions + chatCount + randomBetween(0, 10);
        const acceptanceRate = Math.round(
          (traits.baseAcceptanceRate + randomFloat(-0.08, 0.08)) * 100
        ) / 100;
        // Some days user switches surface (10% chance)
        const surface = Math.random() < 0.10
          ? pickRandom(COPILOT_SURFACES)
          : traits.primarySurface;
        // Agent/review usage varies day-to-day even for users who have the feature
        const usedAgentToday = traits.usesAgent && Math.random() < 0.4;
        const usedReviewToday = traits.usesCodeReview && Math.random() < 0.5;

        activities.push({
          id: activityId++,
          user_id: traits.user.id,
          activity_date: dateStr,
          is_active: true,
          last_activity_at: addHours(date, randomBetween(8, 22)),
          interaction_count: interactionCount,
          last_surface: surface,
          used_coding_agent: usedAgentToday,
          used_code_review: usedReviewToday,
          completions_count: completions,
          chat_interactions: chatCount,
          acceptance_rate: Math.max(0, Math.min(1, acceptanceRate)),
          metrics_json: {
            completions_count: completions,
            suggestions_count: Math.round(completions / Math.max(acceptanceRate, 0.1)),
            acceptance_rate: acceptanceRate,
            active_time_minutes: randomBetween(30, 480),
            last_surface_used: surface,
            used_copilot_coding_agent: usedAgentToday,
            used_copilot_code_review: usedReviewToday,
            chat_interactions: chatCount,
          },
        });
      } else {
        activities.push({
          id: activityId++,
          user_id: traits.user.id,
          activity_date: dateStr,
          is_active: false,
          last_activity_at: null,
          interaction_count: 0,
          last_surface: null,
          used_coding_agent: false,
          used_code_review: false,
          completions_count: 0,
          chat_interactions: 0,
          acceptance_rate: null,
          metrics_json: {},
        });
      }
    }
  }

  return activities;
}

// ── Main Export ────────────────────────────────────────────────────────────────

export function generateAllData(): GeneratedData {
  const endDate = new Date();
  const startDate = addDays(endDate, -SEED_CONFIG.timeRange.startDays);

  const users = generateUsers();
  const pullRequests = generatePullRequests(users, startDate, endDate);
  const mergedPrs = pullRequests.filter((pr) => pr.merged_at !== null);

  const {
    deployments,
    deploymentStatuses,
    deploymentPullRequests,
    failedProductionDeployments,
  } = generateDeploymentsAndRelated(users, mergedPrs, startDate, endDate);

  const issues = generateIssues(
    failedProductionDeployments,
    users,
    pullRequests.length + 1,
  );
  const workflowRuns = generateWorkflowRuns(pullRequests);
  const codeScanningAlerts = generateCodeScanningAlerts(startDate, endDate);
  const copilotUserActivity = generateCopilotActivity(
    users,
    startDate,
    SEED_CONFIG.timeRange.startDays,
  );

  return {
    users,
    pullRequests,
    deployments,
    deploymentStatuses,
    deploymentPullRequests,
    issues,
    workflowRuns,
    codeScanningAlerts,
    copilotUserActivity,
  };
}
