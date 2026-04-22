import { Octokit } from '@octokit/rest';
import { withRateLimitRetry } from './pagination';

export async function fetchDeployments(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ deployments: Record<string, unknown>[]; statuses: Record<string, unknown>[] }> {
  const rawDeployments = await withRateLimitRetry(() =>
    octokit.paginate(octokit.rest.repos.listDeployments, { owner, repo, per_page: 100 })
  );

  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const filtered = rawDeployments.filter(d => new Date(d.created_at) >= since);

  const deployments: Record<string, unknown>[] = filtered.map(d => ({
    id: d.id,
    sha: d.sha,
    ref: d.ref ?? null,
    task: d.task ?? null,
    environment: d.environment,
    description: d.description ?? null,
    created_at: d.created_at,
    updated_at: d.updated_at ?? null,
    creator: d.creator ?? null,
    payload: d.payload ?? null,
  }));

  const allStatuses: Record<string, unknown>[] = [];
  for (const d of filtered) {
    const statusList = await withRateLimitRetry(() =>
      octokit.paginate(octokit.rest.repos.listDeploymentStatuses, {
        owner, repo, deployment_id: d.id, per_page: 100,
      })
    );
    for (const s of statusList) {
      allStatuses.push({
        id: s.id,
        deployment_id: d.id,
        state: s.state,
        description: s.description ?? null,
        environment: s.environment ?? null,
        environment_url: s.environment_url ?? null,
        creator: s.creator ?? null,
        created_at: s.created_at,
        updated_at: s.updated_at ?? null,
      });
    }
  }

  return { deployments, statuses: allStatuses };
}
