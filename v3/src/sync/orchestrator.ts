import 'dotenv/config';
import { getPool } from '../db/connection';
import { loadColumns, applyDrift, insertRows, DriftEntry } from '../db/insert';
import { createOctokit } from '../github/client';
import { resolveBridge } from './bridge-resolver';
import { fetchPullRequests } from '../github/pull-requests';
import { fetchDeployments } from '../github/deployments';
import { fetchIssues } from '../github/issues';
import { fetchWorkflowRuns } from '../github/workflow-runs';
import { fetchCopilotEnterpriseMetrics } from '../github/copilot-enterprise-metrics';
import { fetchCopilotUserMetrics } from '../github/copilot-user-metrics';
import { fetchCopilotSeats } from '../github/copilot-seats';
import { config } from '../config';

const DATA_TABLES = [
  'pull_requests', 'deployments', 'deployment_statuses', 'deployment_pr_links',
  'issues', 'workflow_runs',
  'copilot_enterprise_daily', 'copilot_user_daily', 'copilot_seats',
];

export async function runSync(): Promise<void> {
  const pool = getPool();
  const octokit = createOctokit();
  const { org, repo, enterprise } = config.github;

  const { rows: jobRows } = await pool.query(
    `INSERT INTO sync_jobs (status) VALUES ('running') RETURNING id`
  );
  const jobId: number = jobRows[0].id;

  try {
    const columnMap: Record<string, Set<string>> = {};
    for (const table of DATA_TABLES) {
      columnMap[table] = await loadColumns(table, pool);
    }

    console.log('[sync] Fetching GitHub data...');
    const prs = await fetchPullRequests(octokit, org, repo);
    console.log(`[sync] PRs: ${prs.length}`);

    const { deployments, statuses } = await fetchDeployments(octokit, org, repo);
    console.log(`[sync] Deployments: ${deployments.length}, Statuses: ${statuses.length}`);

    const issuesList = await fetchIssues(octokit, org, repo);
    console.log(`[sync] Issues: ${issuesList.length}`);

    const runs = await fetchWorkflowRuns(octokit, org, repo);
    console.log(`[sync] Workflow runs: ${runs.length}`);

    let enterpriseMetrics: Record<string, unknown>[] = [];
    try {
      enterpriseMetrics = await fetchCopilotEnterpriseMetrics(octokit, enterprise);
      console.log(`[sync] Copilot enterprise metrics: ${enterpriseMetrics.length}`);
    } catch (err: any) {
      console.warn(`[sync] Copilot enterprise metrics skipped: ${err?.status ?? err?.message}`);
    }

    let userMetrics: Record<string, unknown>[] = [];
    try {
      userMetrics = await fetchCopilotUserMetrics(octokit, enterprise);
      console.log(`[sync] Copilot user metrics: ${userMetrics.length}`);
    } catch (err: any) {
      console.warn(`[sync] Copilot user metrics skipped: ${err?.status ?? err?.message}`);
    }

    let seats: Record<string, unknown>[] = [];
    try {
      seats = await fetchCopilotSeats(octokit, org);
      console.log(`[sync] Copilot seats: ${seats.length}`);
    } catch (err: any) {
      console.warn(`[sync] Copilot seats skipped: ${err?.status ?? err?.message}`);
    }

    const driftLog: DriftEntry[] = [];
    const recordCounts: Record<string, number> = {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const drift = async (table: string, records: Record<string, unknown>[]) => {
        if (records.length === 0) return;
        const d = await applyDrift(table, records[0], columnMap[table], client as any);
        if (d) driftLog.push(d);
      };

      // Pull Requests
      await drift('pull_requests', prs);
      await client.query('TRUNCATE pull_requests CASCADE');
      await insertRows('pull_requests', prs, columnMap['pull_requests'], client as any);
      recordCounts.pull_requests = prs.length;

      // Deployments
      await drift('deployments', deployments);
      await client.query('TRUNCATE deployments CASCADE');
      await insertRows('deployments', deployments, columnMap['deployments'], client as any);
      recordCounts.deployments = deployments.length;

      // Deployment Statuses (cascaded with deployments truncate)
      await drift('deployment_statuses', statuses);
      await insertRows('deployment_statuses', statuses, columnMap['deployment_statuses'], client as any);
      recordCounts.deployment_statuses = statuses.length;

      // Issues
      await drift('issues', issuesList);
      await client.query('TRUNCATE issues');
      await insertRows('issues', issuesList, columnMap['issues'], client as any);
      recordCounts.issues = issuesList.length;

      // Workflow Runs
      await drift('workflow_runs', runs);
      await client.query('TRUNCATE workflow_runs');
      await insertRows('workflow_runs', runs, columnMap['workflow_runs'], client as any);
      recordCounts.workflow_runs = runs.length;

      // Copilot Enterprise Daily
      if (enterpriseMetrics.length > 0) {
        await drift('copilot_enterprise_daily', enterpriseMetrics);
        await client.query('TRUNCATE copilot_enterprise_daily');
        await insertRows('copilot_enterprise_daily', enterpriseMetrics, columnMap['copilot_enterprise_daily'], client as any);
        recordCounts.copilot_enterprise_daily = enterpriseMetrics.length;
      }

      // Copilot User Daily
      if (userMetrics.length > 0) {
        await drift('copilot_user_daily', userMetrics);
        await client.query('TRUNCATE copilot_user_daily');
        await insertRows('copilot_user_daily', userMetrics, columnMap['copilot_user_daily'], client as any);
        recordCounts.copilot_user_daily = userMetrics.length;
      }

      // Copilot Seats
      if (seats.length > 0) {
        await drift('copilot_seats', seats);
        await client.query('TRUNCATE copilot_seats');
        await insertRows('copilot_seats', seats, columnMap['copilot_seats'], client as any);
        recordCounts.copilot_seats = seats.length;
      }

      // Bridge: link deployments to PRs
      const bridgeCount = await resolveBridge(client as any);
      recordCounts.deployment_pr_links = bridgeCount;

      // Update app_config
      const upsert = (key: string, value: string) =>
        client.query(
          `INSERT INTO app_config (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, value]
        );
      await upsert('org', org);
      await upsert('repo', repo);
      await upsert('enterprise', enterprise);
      await upsert('last_synced_at', new Date().toISOString());

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await pool.query(
      `UPDATE sync_jobs SET status = 'success', finished_at = NOW(),
       records_synced = $1, schema_drift = $2 WHERE id = $3`,
      [JSON.stringify(recordCounts), driftLog.length > 0 ? JSON.stringify(driftLog) : null, jobId]
    );
    console.log('[sync] Done:', recordCounts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE sync_jobs SET status = 'failed', finished_at = NOW(), error_message = $1 WHERE id = $2`,
      [message, jobId]
    );
    console.error('[sync] Failed:', message);
    throw err;
  }
}

if (require.main === module) {
  runSync().catch(() => process.exit(1));
}
