import dotenv from 'dotenv';
dotenv.config();

import { Pool, PoolClient } from 'pg';
import { generateAllData, GeneratedData } from '../seed/generator';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'dora_metrics',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

const verifyOnly = process.argv.includes('--verify-only');

// ── Truncate ──────────────────────────────────────────────────────────────────

async function truncateAll(client: PoolClient): Promise<void> {
  console.log('⏳ Truncating existing data...');
  await client.query(`
    TRUNCATE
      deployment_pull_requests,
      deployment_statuses,
      code_scanning_alerts,
      workflow_runs,
      issues,
      deployments,
      pull_requests,
      copilot_user_activity,
      users
    CASCADE
  `);
}

// ── Insert ────────────────────────────────────────────────────────────────────

async function insertData(
  client: PoolClient,
  data: GeneratedData,
): Promise<void> {
  console.log('⏳ Inserting seed data...');

  // Users
  for (const u of data.users) {
    await client.query(
      'INSERT INTO users (id, github_user_id, login) VALUES ($1, $2, $3)',
      [u.id, u.github_user_id, u.login],
    );
  }
  console.log(`  ✓ ${data.users.length} users`);

  // Pull Requests
  for (const pr of data.pullRequests) {
    await client.query(
      `INSERT INTO pull_requests
         (id, number, author_user_id, created_at, merged_at, merge_commit_sha,
          title, state, labels, additions, deletions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        pr.id,
        pr.number,
        pr.author_user_id,
        pr.created_at,
        pr.merged_at,
        pr.merge_commit_sha,
        pr.title,
        pr.state,
        JSON.stringify(pr.labels),
        pr.additions,
        pr.deletions,
      ],
    );
  }
  console.log(`  ✓ ${data.pullRequests.length} pull requests`);

  // Copilot User Activity
  for (const a of data.copilotUserActivity) {
    await client.query(
      `INSERT INTO copilot_user_activity
         (id, user_id, activity_date, is_active, metrics_json,
          last_activity_at, interaction_count, last_surface,
          used_coding_agent, used_code_review, completions_count,
          chat_interactions, acceptance_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [a.id, a.user_id, a.activity_date, a.is_active, JSON.stringify(a.metrics_json),
       a.last_activity_at, a.interaction_count, a.last_surface,
       a.used_coding_agent, a.used_code_review, a.completions_count,
       a.chat_interactions, a.acceptance_rate],
    );
  }
  console.log(`  ✓ ${data.copilotUserActivity.length} copilot activity records`);

  // Deployments
  for (const d of data.deployments) {
    await client.query(
      `INSERT INTO deployments
         (id, github_deployment_id, environment, sha, ref, created_at, creator_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [d.id, d.github_deployment_id, d.environment, d.sha, d.ref, d.created_at, d.creator_user_id],
    );
  }
  console.log(`  ✓ ${data.deployments.length} deployments`);

  // Deployment Statuses
  for (const ds of data.deploymentStatuses) {
    await client.query(
      `INSERT INTO deployment_statuses (id, deployment_id, state, created_at)
       VALUES ($1,$2,$3,$4)`,
      [ds.id, ds.deployment_id, ds.state, ds.created_at],
    );
  }
  console.log(`  ✓ ${data.deploymentStatuses.length} deployment statuses`);

  // Deployment ↔ Pull Request bridge
  for (const dpr of data.deploymentPullRequests) {
    await client.query(
      `INSERT INTO deployment_pull_requests (deployment_id, pull_request_id)
       VALUES ($1,$2)`,
      [dpr.deployment_id, dpr.pull_request_id],
    );
  }
  console.log(`  ✓ ${data.deploymentPullRequests.length} deployment↔PR links`);

  // Issues
  for (const iss of data.issues) {
    await client.query(
      `INSERT INTO issues
         (id, number, title, labels, state, created_at, closed_at, assignee_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        iss.id,
        iss.number,
        iss.title,
        JSON.stringify(iss.labels),
        iss.state,
        iss.created_at,
        iss.closed_at,
        iss.assignee_user_id,
      ],
    );
  }
  console.log(`  ✓ ${data.issues.length} issues`);

  // Workflow Runs
  for (const wr of data.workflowRuns) {
    await client.query(
      `INSERT INTO workflow_runs
         (id, github_run_id, workflow_name, conclusion, created_at, updated_at, run_started_at, head_sha)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        wr.id,
        wr.github_run_id,
        wr.workflow_name,
        wr.conclusion,
        wr.created_at,
        wr.updated_at,
        wr.run_started_at,
        wr.head_sha,
      ],
    );
  }
  console.log(`  ✓ ${data.workflowRuns.length} workflow runs`);

  // Code Scanning Alerts
  for (const csa of data.codeScanningAlerts) {
    await client.query(
      `INSERT INTO code_scanning_alerts
         (id, alert_number, severity, state, created_at, fixed_at, tool_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [csa.id, csa.alert_number, csa.severity, csa.state, csa.created_at, csa.fixed_at, csa.tool_name],
    );
  }
  console.log(`  ✓ ${data.codeScanningAlerts.length} code scanning alerts`);
}

// ── Reset Sequences ───────────────────────────────────────────────────────────

async function resetSequences(client: PoolClient): Promise<void> {
  const tables = [
    'users',
    'pull_requests',
    'deployments',
    'deployment_statuses',
    'issues',
    'workflow_runs',
    'code_scanning_alerts',
    'copilot_user_activity',
  ];
  for (const table of tables) {
    await client.query(
      `SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 1))`,
    );
  }
}

// ── Verification ──────────────────────────────────────────────────────────────

async function verify(): Promise<void> {
  console.log('\n📊 DORA Metrics Verification');
  console.log('─'.repeat(55));

  // Change Lead Time (median hours: PR created → production deployment)
  const clt = await pool.query(`
    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (d.created_at - pr.created_at)) / 3600
    ) AS median_hours
    FROM pull_requests pr
    JOIN deployment_pull_requests dpr ON pr.id = dpr.pull_request_id
    JOIN deployments d ON dpr.deployment_id = d.id
    WHERE d.environment = 'production' AND pr.merged_at IS NOT NULL
  `);
  const leadTime = clt.rows[0]?.median_hours;
  console.log(
    `✓ Change Lead Time:           median ${leadTime != null ? Number(leadTime).toFixed(1) : 'N/A'} hours`,
  );

  // Deployment Frequency (production deploys per week)
  const df = await pool.query(`
    SELECT ROUND(
      COUNT(*)::numeric / GREATEST(
        EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 604800, 1
      ), 1
    ) AS per_week
    FROM deployments
    WHERE environment = 'production'
  `);
  console.log(
    `✓ Deployment Frequency:       ${df.rows[0]?.per_week ?? 'N/A'}/week`,
  );

  // Failed Deployment Recovery Time (median hours)
  const fdrt = await pool.query(`
    WITH failed AS (
      SELECT d.id, d.created_at
      FROM deployments d
      JOIN deployment_statuses ds ON d.id = ds.deployment_id
      WHERE ds.state IN ('failure', 'error') AND d.environment = 'production'
    ),
    recovery AS (
      SELECT f.id,
             MIN(d2.created_at) AS recovery_at,
             f.created_at AS failed_at
      FROM failed f
      JOIN deployments d2
        ON d2.environment = 'production' AND d2.created_at > f.created_at
      JOIN deployment_statuses ds2
        ON d2.id = ds2.deployment_id AND ds2.state = 'success'
      GROUP BY f.id, f.created_at
    )
    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (recovery_at - failed_at)) / 3600
    ) AS median_hours
    FROM recovery
  `);
  const recoveryTime = fdrt.rows[0]?.median_hours;
  console.log(
    `✓ Failed Deploy Recovery:     median ${recoveryTime != null ? Number(recoveryTime).toFixed(1) : 'N/A'} hours`,
  );

  // Change Fail Rate (% of production deployments that failed)
  const cfr = await pool.query(`
    SELECT ROUND(
      100.0 * COUNT(*) FILTER (WHERE ds.state IN ('failure', 'error'))
      / NULLIF(COUNT(*), 0), 1
    ) AS fail_pct
    FROM deployments d
    JOIN deployment_statuses ds ON d.id = ds.deployment_id
    WHERE d.environment = 'production'
  `);
  console.log(
    `✓ Change Fail Rate:           ${cfr.rows[0]?.fail_pct ?? 'N/A'}%`,
  );

  // Deployment Rework Rate (% of merged PRs with hotfix/bugfix/rollback labels)
  const drr = await pool.query(`
    SELECT ROUND(
      100.0 * COUNT(*) FILTER (
        WHERE labels @> '[{"name":"hotfix"}]'::jsonb
           OR labels @> '[{"name":"bugfix"}]'::jsonb
           OR labels @> '[{"name":"rollback"}]'::jsonb
      ) / NULLIF(COUNT(*), 0), 1
    ) AS rework_pct
    FROM pull_requests
    WHERE merged_at IS NOT NULL
  `);
  console.log(
    `✓ Deployment Rework Rate:     ${drr.rows[0]?.rework_pct ?? 'N/A'}%`,
  );

  // Summary counts
  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS user_count,
      (SELECT COUNT(*) FROM users u
       WHERE EXISTS (
         SELECT 1 FROM copilot_user_activity ca
         WHERE ca.user_id = u.id AND ca.is_active = true
       )) AS copilot_active_users,
      (SELECT COUNT(*) FROM pull_requests) AS pr_count,
      (SELECT COUNT(*) FROM deployments) AS deploy_count,
      (SELECT COUNT(*) FROM issues WHERE labels @> '[{"name":"incident"}]'::jsonb) AS incident_count
  `);
  const c = counts.rows[0];
  console.log(
    `✓ Users (Copilot Active):     ${c.copilot_active_users}/${c.user_count} (${Math.round((100 * Number(c.copilot_active_users)) / Number(c.user_count))}%)`,
  );
  console.log(`✓ Total PRs:                  ${c.pr_count}`);
  console.log(`✓ Total Deployments:          ${c.deploy_count}`);
  console.log(`✓ Incident Issues:            ${c.incident_count}`);

  console.log('─'.repeat(55));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    if (!verifyOnly) {
      console.log('🌱 DORA Metrics — Seed Data Generator\n');
      const data = generateAllData();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await truncateAll(client);
        await insertData(client, data);
        await resetSequences(client);
        await client.query('COMMIT');
        console.log('\n✅ Seed data inserted successfully');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    await verify();
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
