import { Octokit } from '@octokit/rest';
import { withRateLimitRetry } from './pagination';

export interface DeploymentRow {
  github_deployment_id: number;
  environment: string;
  sha: string;
  ref: string | null;
  created_at: string;
  creator_login: string | null;
}

export interface DeploymentStatusRow {
  github_deployment_id: number;
  state: string;
  created_at: string;
}

export async function fetchDeployments(
  octokit: Octokit,
  owner: string,
  repo: string,
  since?: Date
): Promise<{ deployments: DeploymentRow[]; statuses: DeploymentStatusRow[] }> {
  console.log(`Fetching deployments for ${owner}/${repo}...`);

  const allDeployments: DeploymentRow[] = [];
  const allStatuses: DeploymentStatusRow[] = [];

  const deployments = await withRateLimitRetry(() =>
    octokit.paginate(octokit.rest.repos.listDeployments, {
      owner,
      repo,
      per_page: 100,
    })
  );

  for (const dep of deployments) {
    if (since && new Date(dep.created_at) < since) continue;

    allDeployments.push({
      github_deployment_id: dep.id,
      environment: dep.environment || 'production',
      sha: dep.sha,
      ref: dep.ref || null,
      created_at: dep.created_at,
      creator_login: dep.creator?.login || null,
    });

    const statuses = await withRateLimitRetry(() =>
      octokit.paginate(octokit.rest.repos.listDeploymentStatuses, {
        owner,
        repo,
        deployment_id: dep.id,
        per_page: 100,
      })
    );

    for (const status of statuses) {
      allStatuses.push({
        github_deployment_id: dep.id,
        state: status.state,
        created_at: status.created_at,
      });
    }
  }

  console.log(`  Found ${allDeployments.length} deployments, ${allStatuses.length} statuses`);
  return { deployments: allDeployments, statuses: allStatuses };
}
