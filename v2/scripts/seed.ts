import 'dotenv/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Pool } from 'pg';
import { config } from '../src/config';
import { SEED_CONFIG } from '../seed/config';
import { generateSeedData } from '../seed/generator';

async function main() {
  const verifyOnly = process.argv.includes('--verify-only');
  const pool = new Pool({
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user,
    password: config.pg.password,
  });

  if (verifyOnly) {
    await verifySeed(pool);
    await pool.end();
    return;
  }

  console.log('Generating seed data...');
  const data = generateSeedData(SEED_CONFIG);
  const today = new Date().toISOString().slice(0, 10);

  // Write raw files
  const rawBase = path.join('data', 'raw');
  const endpoints = [
    { name: 'pull-requests', records: data.pullRequests },
    { name: 'deployments', records: data.deployments },
    { name: 'deployment-statuses', records: data.deploymentStatuses },
    { name: 'issues', records: data.issues },
    { name: 'workflow-runs', records: data.workflowRuns },
    { name: 'copilot-org-metrics', records: data.copilotOrgMetrics },
    { name: 'copilot-user-metrics', records: data.copilotUserMetrics },
    { name: 'copilot-seats', records: data.copilotSeats },
  ];

  for (const ep of endpoints) {
    const dir = path.join(rawBase, ep.name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `seed-${today}.json`), JSON.stringify(ep.records, null, 2));
  }

  // Clear existing seed data
  console.log('Truncating tables...');
  await pool.query('TRUNCATE TABLE deployment_pull_requests, deployment_statuses, deployments, pull_requests, issues, workflow_runs, copilot_org_metrics, copilot_seats, copilot_user_metrics CASCADE');

  // Insert pull requests
  console.log(`Inserting ${data.pullRequests.length} pull requests...`);
  for (const pr of data.pullRequests) {
    await pool.query(
      `INSERT INTO pull_requests (number, title, state, body, created_at, updated_at, closed_at, merged_at,
        merge_commit_sha, draft, additions, deletions, changed_files, user_login, user_id,
        merged_by_login, merged_by_id, head_sha, head_ref, base_ref, labels, requested_reviewers, assignees)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (number) DO UPDATE SET
         state = EXCLUDED.state, merged_at = EXCLUDED.merged_at, updated_at = EXCLUDED.updated_at`,
      [pr.number, pr.title, pr.state, pr.body, pr.created_at, pr.updated_at, pr.closed_at, pr.merged_at,
       pr.merge_commit_sha, pr.draft, pr.additions, pr.deletions, pr.changed_files,
       pr.user_login, pr.user_id, pr.merged_by_login, pr.merged_by_id,
       pr.head_sha, pr.head_ref, pr.base_ref,
       JSON.stringify(pr.labels), JSON.stringify(pr.requested_reviewers), JSON.stringify(pr.assignees)]
    );
  }

  // Insert deployments
  console.log(`Inserting ${data.deployments.length} deployments...`);
  for (const d of data.deployments) {
    await pool.query(
      `INSERT INTO deployments (deployment_id, sha, ref, task, environment, description, created_at, updated_at, creator_login, creator_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (deployment_id) DO NOTHING`,
      [d.deployment_id, d.sha, d.ref, d.task, d.environment, d.description, d.created_at, d.updated_at, d.creator_login, d.creator_id, JSON.stringify(d.payload)]
    );
  }

  // Insert deployment statuses
  console.log(`Inserting ${data.deploymentStatuses.length} deployment statuses...`);
  for (const s of data.deploymentStatuses) {
    await pool.query(
      `INSERT INTO deployment_statuses (deployment_id, state, description, environment, environment_url, creator_login, creator_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT DO NOTHING`,
      [s.deployment_id, s.state, s.description, s.environment, s.environment_url, s.creator_login, s.creator_id, s.created_at, s.updated_at]
    );
  }

  // Insert issues
  console.log(`Inserting ${data.issues.length} issues...`);
  for (const issue of data.issues) {
    await pool.query(
      `INSERT INTO issues (number, title, state, body, created_at, updated_at, closed_at, user_login, user_id,
        assignee_login, assignee_id, labels, assignees, milestone, pull_request)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (number) DO NOTHING`,
      [issue.number, issue.title, issue.state, issue.body, issue.created_at, issue.updated_at, issue.closed_at,
       issue.user_login, issue.user_id, issue.assignee_login, issue.assignee_id,
       JSON.stringify(issue.labels), JSON.stringify(issue.assignees), null, null]
    );
  }

  // Insert workflow runs
  console.log(`Inserting ${data.workflowRuns.length} workflow runs...`);
  for (const run of data.workflowRuns) {
    await pool.query(
      `INSERT INTO workflow_runs (run_id, name, workflow_id, head_branch, head_sha, run_number, event, status,
        conclusion, created_at, updated_at, run_started_at, run_attempt, actor_login, actor_id,
        triggering_actor_login, triggering_actor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (run_id) DO NOTHING`,
      [run.run_id, run.name, run.workflow_id, run.head_branch, run.head_sha, run.run_number,
       run.event, run.status, run.conclusion, run.created_at, run.updated_at, run.run_started_at,
       run.run_attempt, run.actor_login, run.actor_id, run.triggering_actor_login, run.triggering_actor_id]
    );
  }

  // Insert copilot seats (TRUNCATE + INSERT)
  console.log(`Inserting ${data.copilotSeats.length} copilot seats...`);
  await pool.query('TRUNCATE TABLE copilot_seats');
  for (const seat of data.copilotSeats) {
    await pool.query(
      `INSERT INTO copilot_seats (assignee_login, assignee_id, assignee_type, created_at, updated_at,
        pending_cancellation_date, last_activity_at, last_activity_editor, plan_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (assignee_id) DO UPDATE SET last_activity_at = EXCLUDED.last_activity_at`,
      [seat.assignee_login, seat.assignee_id, seat.assignee_type, seat.created_at, seat.updated_at,
       seat.pending_cancellation_date, seat.last_activity_at, seat.last_activity_editor, seat.plan_type]
    );
  }

  // Insert copilot org metrics (TRUNCATE + INSERT)
  console.log(`Inserting ${data.copilotOrgMetrics.length} copilot org metric rows...`);
  await pool.query('TRUNCATE TABLE copilot_org_metrics');
  for (const m of data.copilotOrgMetrics) {
    await pool.query(
      `INSERT INTO copilot_org_metrics (day, organization_id, daily_active_users, weekly_active_users,
        monthly_active_users, monthly_active_agent_users, monthly_active_chat_users, daily_active_cli_users,
        code_acceptance_activity_count, code_generation_activity_count, user_initiated_interaction_count,
        loc_suggested_to_add_sum, loc_suggested_to_delete_sum, loc_added_sum, loc_deleted_sum,
        pull_requests, totals_by_feature, totals_by_ide, totals_by_language_feature,
        totals_by_language_model, totals_by_model_feature, totals_by_cli)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (day) DO NOTHING`,
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

  // Insert copilot user metrics (TRUNCATE + INSERT)
  console.log(`Inserting ${data.copilotUserMetrics.length} copilot user metric rows...`);
  await pool.query('TRUNCATE TABLE copilot_user_metrics');
  for (const m of data.copilotUserMetrics) {
    await pool.query(
      `INSERT INTO copilot_user_metrics (day, user_id, user_login, organization_id,
        user_initiated_interaction_count, code_generation_activity_count, code_acceptance_activity_count,
        loc_suggested_to_add_sum, loc_suggested_to_delete_sum, loc_added_sum, loc_deleted_sum,
        used_agent, used_chat, used_cli, used_copilot_code_review_active, used_copilot_code_review_passive,
        totals_by_ide, totals_by_feature, totals_by_language_feature, totals_by_language_model,
        totals_by_model_feature, totals_by_cli)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (day, user_login) DO NOTHING`,
      [m.day, m.user_id, m.user_login, m.organization_id,
       m.user_initiated_interaction_count, m.code_generation_activity_count, m.code_acceptance_activity_count,
       m.loc_suggested_to_add_sum, m.loc_suggested_to_delete_sum, m.loc_added_sum, m.loc_deleted_sum,
       m.used_agent, m.used_chat, m.used_cli, m.used_copilot_code_review_active, m.used_copilot_code_review_passive,
       JSON.stringify(m.totals_by_ide), JSON.stringify(m.totals_by_feature),
       JSON.stringify(m.totals_by_language_feature), JSON.stringify(m.totals_by_language_model),
       JSON.stringify(m.totals_by_model_feature), JSON.stringify(m.totals_by_cli)]
    );
  }

  // Insert data_mode banner
  await pool.query('TRUNCATE TABLE data_mode');
  await pool.query(
    `INSERT INTO data_mode (mode, source_label, source_url) VALUES ($1, $2, $3)`,
    [config.dataMode, config.dataSourceLabel || 'Synthetic seed data', config.dataSourceUrl ?? null]
  );

  // Run bridge resolver inline (only link PRs merged before the deployment was created)
  console.log('Running bridge resolver...');
  const { rows: deploymentRows } = await pool.query('SELECT deployment_id, sha, created_at FROM deployments');
  for (const dep of deploymentRows) {
    const { rows: prRows } = await pool.query(
      'SELECT number FROM pull_requests WHERE merge_commit_sha = $1 AND merged_at <= $2 AND merged_at IS NOT NULL',
      [dep.sha, dep.created_at]
    );
    for (const pr of prRows) {
      await pool.query(
        `INSERT INTO deployment_pull_requests (deployment_id, pr_number, match_type)
         VALUES ($1, $2, 'direct_sha')
         ON CONFLICT DO NOTHING`,
        [dep.deployment_id, pr.number]
      );
    }
  }

  console.log('Seed complete!');
  await verifySeed(pool);
  await pool.end();
}

async function verifySeed(pool: Pool) {
  const tables = ['pull_requests', 'deployments', 'deployment_statuses', 'issues', 'workflow_runs', 'copilot_org_metrics', 'copilot_user_metrics', 'copilot_seats', 'deployment_pull_requests'];
  console.log('\n=== Seed Verification ===');
  for (const table of tables) {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM ${table}`);
    console.log(`  ${table}: ${rows[0].count} rows`);
  }
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
