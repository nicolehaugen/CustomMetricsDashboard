import { Octokit } from '@octokit/rest';
import { getPool } from '../db/connection';
import { withRateLimitRetry } from '../github/pagination';

export async function resolveBridgeLinks(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<number> {
  const pool = getPool();
  let resolved = 0;

  // Get all deployments that don't have bridge links yet
  const deployments = await pool.query(`
    SELECT d.id, d.sha FROM deployments d
    WHERE NOT EXISTS (
      SELECT 1 FROM deployment_pull_requests dpr WHERE dpr.deployment_id = d.id
    )
  `);

  for (const dep of deployments.rows) {
    // 1. Direct SHA match: deployment.sha = pull_request.merge_commit_sha
    const directMatch = await pool.query(
      'SELECT id FROM pull_requests WHERE merge_commit_sha = $1',
      [dep.sha]
    );

    if (directMatch.rows.length > 0) {
      for (const pr of directMatch.rows) {
        await pool.query(
          `INSERT INTO deployment_pull_requests (deployment_id, pull_request_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [dep.id, pr.id]
        );
        resolved++;
      }
      continue;
    }

    // 2. Squash merge fallback — check recent PRs' commits
    const recentPRs = await pool.query(`
      SELECT id, number FROM pull_requests
      WHERE merged_at IS NOT NULL
      AND merged_at > NOW() - INTERVAL '30 days'
    `);

    for (const pr of recentPRs.rows) {
      try {
        const commits = await withRateLimitRetry(() =>
          octokit.rest.pulls.listCommits({
            owner,
            repo,
            pull_number: pr.number,
            per_page: 100,
          })
        );

        const shaMatch = commits.data.some((c: { sha: string }) => c.sha === dep.sha);
        if (shaMatch) {
          await pool.query(
            `INSERT INTO deployment_pull_requests (deployment_id, pull_request_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [dep.id, pr.id]
          );
          resolved++;
          break;
        }
      } catch {
        console.log(`  Warning: Could not fetch commits for PR #${pr.number}`);
      }
    }
  }

  console.log(`  Resolved ${resolved} deployment-PR links`);
  return resolved;
}
