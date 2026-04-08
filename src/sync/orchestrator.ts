import { Pool } from 'pg';
import { getPool } from '../db/connection';
import { config } from '../config';
import { createOctokitClient } from '../github/client';
import { fetchDeployments } from '../github/deployments';
import { fetchPullRequests } from '../github/pull-requests';
import { fetchWorkflowRuns } from '../github/workflow-runs';
import { fetchIssues } from '../github/issues';
import { fetchCodeScanningAlerts } from '../github/code-scanning';
import { fetchCopilotUserActivity } from '../github/copilot-users';
import { getLastSyncedAt, updateSyncState } from './state';
import { resolveBridgeLinks } from './bridge-resolver';

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) || 1;
}

async function ensureUser(pool: Pool, login: string): Promise<number> {
  const result = await pool.query(
    `INSERT INTO users (github_user_id, login)
     VALUES ($1, $2)
     ON CONFLICT (github_user_id) DO UPDATE SET login = EXCLUDED.login
     RETURNING id`,
    [hashString(login), login]
  );
  return result.rows[0].id;
}

/**
 * Run a full sync of all GitHub data into PostgreSQL.
 * @param jobId - If provided, use this existing sync_jobs row. Otherwise create a new one.
 */
export async function runSync(jobId?: number): Promise<number> {
  const pool = getPool();
  const octokit = createOctokitClient();
  const { org, repo } = config.github;

  // Create sync job if not provided
  if (jobId === undefined) {
    const jobResult = await pool.query(
      `INSERT INTO sync_jobs (status, started_at) VALUES ('running', NOW()) RETURNING id`
    );
    jobId = jobResult.rows[0].id as number;
  }

  let totalRecords = 0;
  const errors: string[] = [];

  try {
    // --- Sync Pull Requests ---
    try {
      console.log('Syncing pull requests...');
      const prSince = await getLastSyncedAt('pull_requests');
      const prs = await fetchPullRequests(octokit, org, repo, prSince || undefined);
      for (const pr of prs) {
        const userId = pr.author_login ? await ensureUser(pool, pr.author_login) : null;
        await pool.query(
          `INSERT INTO pull_requests (number, author_user_id, created_at, merged_at, merge_commit_sha, title, state, labels, additions, deletions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (number) DO UPDATE SET
             author_user_id = EXCLUDED.author_user_id,
             merged_at = EXCLUDED.merged_at,
             merge_commit_sha = EXCLUDED.merge_commit_sha,
             title = EXCLUDED.title,
             state = EXCLUDED.state,
             labels = EXCLUDED.labels,
             additions = EXCLUDED.additions,
             deletions = EXCLUDED.deletions`,
          [pr.number, userId, pr.created_at, pr.merged_at, pr.merge_commit_sha, pr.title, pr.state, JSON.stringify(pr.labels), pr.additions, pr.deletions]
        );
        totalRecords++;
      }
      await updateSyncState('pull_requests', new Date());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error syncing pull_requests: ${msg}`);
      errors.push(`pull_requests: ${msg}`);
    }

    // --- Sync Deployments ---
    try {
      console.log('Syncing deployments...');
      const depSince = await getLastSyncedAt('deployments');
      const { deployments, statuses } = await fetchDeployments(octokit, org, repo, depSince || undefined);
      for (const dep of deployments) {
        const userId = dep.creator_login ? await ensureUser(pool, dep.creator_login) : null;
        await pool.query(
          `INSERT INTO deployments (github_deployment_id, environment, sha, ref, created_at, creator_user_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (github_deployment_id) DO UPDATE SET
             environment = EXCLUDED.environment,
             sha = EXCLUDED.sha,
             ref = EXCLUDED.ref,
             creator_user_id = EXCLUDED.creator_user_id`,
          [dep.github_deployment_id, dep.environment, dep.sha, dep.ref, dep.created_at, userId]
        );
        totalRecords++;
      }
      for (const status of statuses) {
        const depRow = await pool.query(
          'SELECT id FROM deployments WHERE github_deployment_id = $1',
          [status.github_deployment_id]
        );
        if (depRow.rows.length > 0) {
          await pool.query(
            `INSERT INTO deployment_statuses (deployment_id, state, created_at)
             SELECT $1, $2, $3
             WHERE NOT EXISTS (
               SELECT 1 FROM deployment_statuses
               WHERE deployment_id = $1 AND state = $2 AND created_at = $3
             )`,
            [depRow.rows[0].id, status.state, status.created_at]
          );
          totalRecords++;
        }
      }
      await updateSyncState('deployments', new Date());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error syncing deployments: ${msg}`);
      errors.push(`deployments: ${msg}`);
    }

    // --- Sync Workflow Runs ---
    try {
      console.log('Syncing workflow runs...');
      const wrSince = await getLastSyncedAt('workflow_runs');
      const runs = await fetchWorkflowRuns(octokit, org, repo, wrSince || undefined);
      for (const run of runs) {
        await pool.query(
          `INSERT INTO workflow_runs (github_run_id, workflow_name, conclusion, created_at, updated_at, run_started_at, head_sha)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (github_run_id) DO UPDATE SET
             conclusion = EXCLUDED.conclusion,
             updated_at = EXCLUDED.updated_at`,
          [run.github_run_id, run.workflow_name, run.conclusion, run.created_at, run.updated_at, run.run_started_at, run.head_sha]
        );
        totalRecords++;
      }
      await updateSyncState('workflow_runs', new Date());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error syncing workflow_runs: ${msg}`);
      errors.push(`workflow_runs: ${msg}`);
    }

    // --- Sync Issues ---
    try {
      console.log('Syncing issues...');
      const issSince = await getLastSyncedAt('issues');
      const issues = await fetchIssues(octokit, org, repo, issSince || undefined);
      for (const issue of issues) {
        const userId = issue.assignee_login ? await ensureUser(pool, issue.assignee_login) : null;
        await pool.query(
          `INSERT INTO issues (number, title, labels, state, created_at, closed_at, assignee_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (number) DO UPDATE SET
             title = EXCLUDED.title,
             labels = EXCLUDED.labels,
             state = EXCLUDED.state,
             closed_at = EXCLUDED.closed_at,
             assignee_user_id = EXCLUDED.assignee_user_id`,
          [issue.number, issue.title, JSON.stringify(issue.labels), issue.state, issue.created_at, issue.closed_at, userId]
        );
        totalRecords++;
      }
      await updateSyncState('issues', new Date());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error syncing issues: ${msg}`);
      errors.push(`issues: ${msg}`);
    }

    // --- Sync Code Scanning Alerts ---
    try {
      console.log('Syncing code scanning alerts...');
      const csaSince = await getLastSyncedAt('code_scanning_alerts');
      const alerts = await fetchCodeScanningAlerts(octokit, org, repo, csaSince || undefined);
      for (const alert of alerts) {
        await pool.query(
          `INSERT INTO code_scanning_alerts (alert_number, severity, state, created_at, fixed_at, tool_name)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (alert_number) DO UPDATE SET
             severity = EXCLUDED.severity,
             state = EXCLUDED.state,
             fixed_at = EXCLUDED.fixed_at`,
          [alert.alert_number, alert.severity, alert.state, alert.created_at, alert.fixed_at, alert.tool_name]
        );
        totalRecords++;
      }
      await updateSyncState('code_scanning_alerts', new Date());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error syncing code_scanning_alerts: ${msg}`);
      errors.push(`code_scanning_alerts: ${msg}`);
    }

    // --- Sync Copilot User Activity ---
    try {
      console.log('Syncing Copilot user activity...');
      const copSince = await getLastSyncedAt('copilot_user_activity');
      const activities = await fetchCopilotUserActivity(octokit, org, copSince || undefined);
      for (const act of activities) {
        const userId = await ensureUser(pool, act.login);
        await pool.query(
          `INSERT INTO copilot_user_activity
             (user_id, activity_date, is_active, metrics_json,
              last_activity_at, interaction_count, last_surface,
              used_coding_agent, used_code_review, completions_count,
              chat_interactions, acceptance_rate)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (user_id, activity_date) DO UPDATE SET
             is_active = EXCLUDED.is_active,
             metrics_json = EXCLUDED.metrics_json,
             last_activity_at = EXCLUDED.last_activity_at,
             interaction_count = EXCLUDED.interaction_count,
             last_surface = EXCLUDED.last_surface,
             used_coding_agent = EXCLUDED.used_coding_agent,
             used_code_review = EXCLUDED.used_code_review,
             completions_count = EXCLUDED.completions_count,
             chat_interactions = EXCLUDED.chat_interactions,
             acceptance_rate = EXCLUDED.acceptance_rate`,
          [userId, act.activity_date, act.is_active, JSON.stringify(act.metrics_json),
           act.last_activity_at, act.interaction_count, act.last_surface,
           act.used_coding_agent, act.used_code_review, act.completions_count,
           act.chat_interactions, act.acceptance_rate]
        );
        totalRecords++;
      }
      await updateSyncState('copilot_user_activity', new Date());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error syncing copilot_user_activity: ${msg}`);
      errors.push(`copilot_user_activity: ${msg}`);
    }

    // --- Record Data Source Metadata ---
    try {
      await pool.query(`DELETE FROM data_source_metadata`);
      await pool.query(
        `INSERT INTO data_source_metadata (source_type, repository, updated_at)
         VALUES ('github', $1, NOW())`,
        [`${org}/${repo}`]
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error recording data source metadata: ${msg}`);
      errors.push(`data_source_metadata: ${msg}`);
    }

    // --- Resolve Bridge Links ---
    try {
      console.log('Resolving deployment-PR bridge links...');
      const bridgeResolved = await resolveBridgeLinks(octokit, org, repo);
      totalRecords += bridgeResolved;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error syncing bridge_links: ${msg}`);
      errors.push(`bridge_links: ${msg}`);
    }

    // Update job status
    const finalStatus = errors.length > 0 ? 'completed' : 'completed';
    const errorMsg = errors.length > 0 ? `Partial errors: ${errors.join('; ')}` : null;

    await pool.query(
      `UPDATE sync_jobs SET status = $1, finished_at = NOW(), records_synced = $2, error_message = $3 WHERE id = $4`,
      [finalStatus, totalRecords, errorMsg, jobId]
    );

    console.log(`Sync complete! Job #${jobId}: ${totalRecords} records synced.`);
    if (errors.length > 0) {
      console.warn(`Partial errors encountered: ${errors.join('; ')}`);
    }
    return jobId;

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE sync_jobs SET status = 'failed', finished_at = NOW(), error_message = $1 WHERE id = $2`,
      [message, jobId]
    );
    console.error(`Sync failed (Job #${jobId}):`, message);
    throw error;
  }
}
