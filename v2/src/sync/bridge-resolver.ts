import { Pool } from 'pg';

export async function resolveBridge(pool: Pool): Promise<number> {
  let linked = 0;

  // Direct SHA match
  const { rows: directMatches } = await pool.query(`
    SELECT d.deployment_id, pr.number AS pr_number
    FROM deployments d
    JOIN pull_requests pr ON pr.merge_commit_sha = d.sha
    WHERE NOT EXISTS (
      SELECT 1 FROM deployment_pull_requests dpr
      WHERE dpr.deployment_id = d.deployment_id AND dpr.pr_number = pr.number
    )
  `);

  for (const row of directMatches) {
    await pool.query(
      `INSERT INTO deployment_pull_requests (deployment_id, pr_number, match_type)
       VALUES ($1, $2, 'direct_sha')
       ON CONFLICT DO NOTHING`,
      [row.deployment_id, row.pr_number]
    );
    linked++;
  }

  // Squash fallback: match deployment sha to PR head_sha
  const { rows: squashMatches } = await pool.query(`
    SELECT d.deployment_id, pr.number AS pr_number
    FROM deployments d
    JOIN pull_requests pr ON pr.head_sha = d.sha
    WHERE NOT EXISTS (
      SELECT 1 FROM deployment_pull_requests dpr
      WHERE dpr.deployment_id = d.deployment_id AND dpr.pr_number = pr.number
    )
  `);

  for (const row of squashMatches) {
    await pool.query(
      `INSERT INTO deployment_pull_requests (deployment_id, pr_number, match_type)
       VALUES ($1, $2, 'squash_fallback')
       ON CONFLICT DO NOTHING`,
      [row.deployment_id, row.pr_number]
    );
    linked++;
  }

  return linked;
}
