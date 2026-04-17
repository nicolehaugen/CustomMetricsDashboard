import { Pool } from 'pg';
import { Octokit } from '@octokit/rest';
import { assertSchemaMatch } from './schema-check';
import { getLastSyncedAt, updateSyncState } from './state';
import { resolveBridge } from './bridge-resolver';
import { fetchPullRequests } from '../github/pull-requests';
import { fetchDeployments } from '../github/deployments';
import { fetchIssues } from '../github/issues';
import { fetchWorkflowRuns } from '../github/workflow-runs';
import { fetchCopilotOrgMetrics } from '../github/copilot-org-metrics';
import { fetchCopilotUserMetrics } from '../github/copilot-user-metrics';
import { fetchCopilotSeats } from '../github/copilot-seats';
import { config } from '../config';

export async function runSync(pool: Pool, octokit: Octokit): Promise<number> {
  const { rows: jobRows } = await pool.query(
    `INSERT INTO sync_jobs (status) VALUES ('running') RETURNING id`
  );
  const jobId: number = jobRows[0].id;

  try {
    await doSync(pool, octokit, jobId);
    await pool.query(
      `UPDATE sync_jobs SET status = 'success', finished_at = NOW() WHERE id = $1`,
      [jobId]
    );
    return jobId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE sync_jobs SET status = 'failed', finished_at = NOW(), error_message = $1 WHERE id = $2`,
      [message, jobId]
    );
    throw err;
  }
}

async function doSync(pool: Pool, octokit: Octokit, jobId: number): Promise<void> {
  const { org, repo } = config.github;
  const recordCounts: Record<string, number> = {};

  // ── 1. Set data_mode banner ──────────────────────────────────────────────
  const sourceLabel = config.dataSourceLabel || `${org}/${repo}`;
  await pool.query('DELETE FROM data_mode');
  await pool.query(
    `INSERT INTO data_mode (mode, source_label, source_url) VALUES ($1, $2, $3)`,
    [config.dataMode, sourceLabel, config.dataSourceUrl ?? null]
  );

  // ── 2. Copilot Seats (TRUNCATE + INSERT) ─────────────────────────────────
  console.log('[sync] Fetching copilot seats...');
  let seats: Awaited<ReturnType<typeof fetchCopilotSeats>> = [];
  try {
    seats = await fetchCopilotSeats(octokit, org);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e?.status === 403 || e?.status === 404) {
      console.warn(`[sync] Copilot seats skipped: HTTP ${e.status}`);
      recordCounts.copilot_seats_skipped = e.status as number;
    } else {
      throw err;
    }
  }
  const validSeats = seats.filter(s => s.assignee_id != null);
  if (seats.length > 0 && validSeats.length === 0) {
    console.warn('[sync] copilot_seats: all records have null assignee_id — skipping TRUNCATE to preserve existing data');
  }
  if (validSeats.length > 0) {
    await assertSchemaMatch('copilot_seats', {
      assignee_login: '', assignee_id: 0, assignee_type: null,
      created_at: null, updated_at: null, pending_cancellation_date: null,
      last_activity_at: null, last_activity_editor: null, plan_type: null,
    }, pool);
    await pool.query('TRUNCATE TABLE copilot_seats');
    for (const s of validSeats) {
      await pool.query(
        `INSERT INTO copilot_seats (assignee_login, assignee_id, assignee_type, created_at, updated_at,
          pending_cancellation_date, last_activity_at, last_activity_editor, plan_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (assignee_id) DO UPDATE SET
           last_activity_at = EXCLUDED.last_activity_at,
           last_activity_editor = EXCLUDED.last_activity_editor,
           updated_at = EXCLUDED.updated_at`,
        [s.assignee_login, s.assignee_id, s.assignee_type, s.created_at, s.updated_at,
         s.pending_cancellation_date, s.last_activity_at, s.last_activity_editor, s.plan_type]
      );
    }
    recordCounts.copilot_seats = validSeats.length;
    await updateSyncState('copilot_seats', pool);
  }

  // ── 3. Copilot Org Metrics (TRUNCATE + INSERT) ───────────────────────────
  console.log('[sync] Fetching copilot org metrics...');
  let orgMetrics: Awaited<ReturnType<typeof fetchCopilotOrgMetrics>> = [];
  try {
    orgMetrics = await fetchCopilotOrgMetrics(octokit, org);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e?.status === 403 || e?.status === 404) {
      console.warn(`[sync] Copilot org metrics skipped: HTTP ${e.status}`);
      recordCounts.copilot_org_metrics_skipped = e.status as number;
    } else {
      throw err;
    }
  }
  if (orgMetrics.length > 0) {
    await pool.query('TRUNCATE TABLE copilot_org_metrics');
    for (const m of orgMetrics) {
      await pool.query(
        `INSERT INTO copilot_org_metrics (day, organization_id, daily_active_users, weekly_active_users,
          monthly_active_users, monthly_active_agent_users, monthly_active_chat_users, daily_active_cli_users,
          code_acceptance_activity_count, code_generation_activity_count, user_initiated_interaction_count,
          loc_suggested_to_add_sum, loc_suggested_to_delete_sum, loc_added_sum, loc_deleted_sum,
          pull_requests, totals_by_feature, totals_by_ide, totals_by_language_feature,
          totals_by_language_model, totals_by_model_feature, totals_by_cli)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (day) DO UPDATE SET
           daily_active_users = EXCLUDED.daily_active_users,
           loc_added_sum = EXCLUDED.loc_added_sum,
           fetched_at = NOW()`,
        [m.day, m.organization_id, m.daily_active_users, m.weekly_active_users,
         m.monthly_active_users, m.monthly_active_agent_users, m.monthly_active_chat_users,
         m.daily_active_cli_users, m.code_acceptance_activity_count, m.code_generation_activity_count,
         m.user_initiated_interaction_count, m.loc_suggested_to_add_sum, m.loc_suggested_to_delete_sum,
         m.loc_added_sum, m.loc_deleted_sum,
         JSON.stringify(m.pull_requests), JSON.stringify(m.totals_by_feature),
         JSON.stringify(m.totals_by_ide), JSON.stringify(m.totals_by_language_feature),
         JSON.stringify(m.totals_by_language_model), JSON.stringify(m.totals_by_model_feature),
         JSON.stringify(m.totals_by_cli)]
      );
    }
    recordCounts.copilot_org_metrics = orgMetrics.length;
    await updateSyncState('copilot_org_metrics', pool);
  }

  // ── 4. Copilot User Metrics (TRUNCATE + INSERT) ──────────────────────────
  console.log('[sync] Fetching copilot user metrics...');
  let userMetrics: Awaited<ReturnType<typeof fetchCopilotUserMetrics>> = [];
  try {
    userMetrics = await fetchCopilotUserMetrics(octokit, org);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e?.status === 403 || e?.status === 404) {
      console.warn(`[sync] Copilot user metrics skipped: HTTP ${e.status}`);
      recordCounts.copilot_user_metrics_skipped = e.status as number;
    } else {
      throw err;
    }
  }
  if (userMetrics.length > 0) {
    await pool.query('TRUNCATE TABLE copilot_user_metrics');
    for (const u of userMetrics) {
      await pool.query(
        `INSERT INTO copilot_user_metrics (day, user_id, user_login, enterprise_id, organization_id,
          user_initiated_interaction_count, code_generation_activity_count, code_acceptance_activity_count,
          loc_suggested_to_add_sum, loc_suggested_to_delete_sum, loc_added_sum, loc_deleted_sum,
          used_agent, used_chat, used_cli, used_copilot_code_review_active, used_copilot_code_review_passive,
          used_copilot_coding_agent,
          totals_by_ide, totals_by_feature, totals_by_language_feature, totals_by_language_model,
          totals_by_model_feature, totals_by_cli)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
         ON CONFLICT (day, user_login) DO UPDATE SET
           loc_added_sum = EXCLUDED.loc_added_sum,
           fetched_at = NOW()`,
        [u.day, u.user_id, u.user_login, u.enterprise_id, u.organization_id,
         u.user_initiated_interaction_count, u.code_generation_activity_count,
         u.code_acceptance_activity_count, u.loc_suggested_to_add_sum, u.loc_suggested_to_delete_sum,
         u.loc_added_sum, u.loc_deleted_sum, u.used_agent, u.used_chat, u.used_cli,
         u.used_copilot_code_review_active, u.used_copilot_code_review_passive,
         u.used_copilot_coding_agent,
         JSON.stringify(u.totals_by_ide), JSON.stringify(u.totals_by_feature),
         JSON.stringify(u.totals_by_language_feature), JSON.stringify(u.totals_by_language_model),
         JSON.stringify(u.totals_by_model_feature), JSON.stringify(u.totals_by_cli)]
      );
    }
    recordCounts.copilot_user_metrics = userMetrics.length;
    await updateSyncState('copilot_user_metrics', pool);
  }

  // ── 5. Pull Requests (UPSERT, incremental) ──────────────────────────────
  console.log('[sync] Fetching pull requests...');
  const prSince = await getLastSyncedAt('pull_requests', pool);
  const prs = await fetchPullRequests(octokit, org, repo, prSince ?? undefined);
  for (const pr of prs) {
    await pool.query(
      `INSERT INTO pull_requests (number, title, state, body, created_at, updated_at, closed_at, merged_at,
        merge_commit_sha, draft, additions, deletions, changed_files, user_login, user_id,
        merged_by_login, merged_by_id, head_sha, head_ref, base_ref, labels, requested_reviewers, assignees)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (number) DO UPDATE SET
         state = EXCLUDED.state, merged_at = EXCLUDED.merged_at, updated_at = EXCLUDED.updated_at,
         additions = EXCLUDED.additions, deletions = EXCLUDED.deletions,
         merge_commit_sha = EXCLUDED.merge_commit_sha, fetched_at = NOW()`,
      [pr.number, pr.title, pr.state, pr.body, pr.created_at, pr.updated_at, pr.closed_at, pr.merged_at,
       pr.merge_commit_sha, pr.draft, pr.additions, pr.deletions, pr.changed_files,
       pr.user_login, pr.user_id, pr.merged_by_login, pr.merged_by_id,
       pr.head_sha, pr.head_ref, pr.base_ref,
       JSON.stringify(pr.labels), JSON.stringify(pr.requested_reviewers), JSON.stringify(pr.assignees)]
    );
  }
  recordCounts.pull_requests = prs.length;
  await updateSyncState('pull_requests', pool);

  // ── 6. Deployments (UPSERT, incremental) ────────────────────────────────
  console.log('[sync] Fetching deployments...');
  const depSince = await getLastSyncedAt('deployments', pool);
  const { deployments, statuses } = await fetchDeployments(octokit, org, repo, depSince ?? undefined);
  for (const d of deployments) {
    await pool.query(
      `INSERT INTO deployments (deployment_id, sha, ref, task, environment, description, created_at, updated_at, creator_login, creator_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (deployment_id) DO UPDATE SET updated_at = EXCLUDED.updated_at, fetched_at = NOW()`,
      [d.deployment_id, d.sha, d.ref, d.task, d.environment, d.description,
       d.created_at, d.updated_at, d.creator_login, d.creator_id, JSON.stringify(d.payload)]
    );
  }
  for (const s of statuses) {
    await pool.query(
      `INSERT INTO deployment_statuses (deployment_id, state, description, environment, environment_url, creator_login, creator_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT DO NOTHING`,
      [s.deployment_id, s.state, s.description, s.environment, s.environment_url,
       s.creator_login, s.creator_id, s.created_at, s.updated_at]
    );
  }
  recordCounts.deployments = deployments.length;
  recordCounts.deployment_statuses = statuses.length;
  await updateSyncState('deployments', pool);

  // ── 7. Issues (UPSERT, incremental) ─────────────────────────────────────
  console.log('[sync] Fetching issues...');
  const issueSince = await getLastSyncedAt('issues', pool);
  const issues = await fetchIssues(octokit, org, repo, issueSince ?? undefined);
  for (const i of issues) {
    await pool.query(
      `INSERT INTO issues (number, title, state, body, created_at, updated_at, closed_at,
        user_login, user_id, assignee_login, assignee_id, labels, assignees, milestone, pull_request)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (number) DO UPDATE SET
         state = EXCLUDED.state, closed_at = EXCLUDED.closed_at, updated_at = EXCLUDED.updated_at, fetched_at = NOW()`,
      [i.number, i.title, i.state, i.body, i.created_at, i.updated_at, i.closed_at,
       i.user_login, i.user_id, i.assignee_login, i.assignee_id,
       JSON.stringify(i.labels), JSON.stringify(i.assignees), JSON.stringify(i.milestone), JSON.stringify(i.pull_request)]
    );
  }
  recordCounts.issues = issues.length;
  await updateSyncState('issues', pool);

  // ── 8. Workflow Runs (UPSERT, incremental) ───────────────────────────────
  console.log('[sync] Fetching workflow runs...');
  const runSince = await getLastSyncedAt('workflow_runs', pool);
  const runs = await fetchWorkflowRuns(octokit, org, repo, runSince ?? undefined);
  for (const r of runs) {
    await pool.query(
      `INSERT INTO workflow_runs (run_id, name, workflow_id, head_branch, head_sha, run_number, event,
        status, conclusion, created_at, updated_at, run_started_at, run_attempt,
        actor_login, actor_id, triggering_actor_login, triggering_actor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (run_id) DO UPDATE SET
         status = EXCLUDED.status, conclusion = EXCLUDED.conclusion,
         updated_at = EXCLUDED.updated_at, fetched_at = NOW()`,
      [r.run_id, r.name, r.workflow_id, r.head_branch, r.head_sha, r.run_number, r.event,
       r.status, r.conclusion, r.created_at, r.updated_at, r.run_started_at, r.run_attempt,
       r.actor_login, r.actor_id, r.triggering_actor_login, r.triggering_actor_id]
    );
  }
  recordCounts.workflow_runs = runs.length;
  await updateSyncState('workflow_runs', pool);

  // ── 9. Bridge resolver ───────────────────────────────────────────────────
  console.log('[sync] Running bridge resolver...');
  const bridgeLinks = await resolveBridge(pool);
  recordCounts.deployment_pull_requests = bridgeLinks;

  // ── 10. Update job record counts ─────────────────────────────────────────
  await pool.query(
    `UPDATE sync_jobs SET records_synced = $1 WHERE id = $2`,
    [JSON.stringify(recordCounts), jobId]
  );

  console.log('[sync] Sync complete:', recordCounts);
}
