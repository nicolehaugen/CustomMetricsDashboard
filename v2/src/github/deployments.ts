import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { withRateLimitRetry } from './pagination';

export interface DeploymentRecord {
  deployment_id: number;
  sha: string;
  ref: string | null;
  task: string | null;
  environment: string;
  description: string | null;
  created_at: string;
  updated_at: string | null;
  creator_login: string | null;
  creator_id: number | null;
  payload: unknown;
}

export interface DeploymentStatusRecord {
  deployment_id: number;
  state: string;
  description: string | null;
  environment: string | null;
  environment_url: string | null;
  creator_login: string | null;
  creator_id: number | null;
  created_at: string;
  updated_at: string | null;
}

export async function fetchDeployments(
  octokit: Octokit,
  owner: string,
  repo: string,
  since?: Date
): Promise<{ deployments: DeploymentRecord[]; statuses: DeploymentStatusRecord[] }> {
  const rawDeployments = await withRateLimitRetry(() =>
    octokit.paginate(octokit.rest.repos.listDeployments, {
      owner,
      repo,
      per_page: 100,
    })
  );

  const filtered = since
    ? rawDeployments.filter(d => new Date(d.created_at) >= since)
    : rawDeployments;

  const deployments: DeploymentRecord[] = filtered.map(d => ({
    deployment_id: d.id,
    sha: d.sha,
    ref: d.ref ?? null,
    task: d.task ?? null,
    environment: d.environment,
    description: d.description ?? null,
    created_at: d.created_at,
    updated_at: d.updated_at ?? null,
    creator_login: d.creator?.login ?? null,
    creator_id: d.creator?.id ?? null,
    payload: d.payload ?? null,
  }));

  // Fetch statuses for each deployment
  const allStatuses: DeploymentStatusRecord[] = [];
  for (const d of filtered) {
    const statusList = await withRateLimitRetry(() =>
      octokit.paginate(octokit.rest.repos.listDeploymentStatuses, {
        owner,
        repo,
        deployment_id: d.id,
        per_page: 100,
      })
    );
    for (const s of statusList) {
      allStatuses.push({
        deployment_id: d.id,
        state: s.state,
        description: s.description ?? null,
        environment: s.environment ?? null,
        environment_url: s.environment_url ?? null,
        creator_login: s.creator?.login ?? null,
        creator_id: s.creator?.id ?? null,
        created_at: s.created_at,
        updated_at: s.updated_at ?? null,
      });
    }
  }

  // Save raw dumps
  const today = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const depDir = path.join('data', 'raw', 'deployments');
  await fs.mkdir(depDir, { recursive: true });
  await fs.writeFile(path.join(depDir, `${today}.json`), JSON.stringify(deployments, null, 2));

  const statusDir = path.join('data', 'raw', 'deployment-statuses');
  await fs.mkdir(statusDir, { recursive: true });
  await fs.writeFile(path.join(statusDir, `${today}.json`), JSON.stringify(allStatuses, null, 2));

  return { deployments, statuses: allStatuses };
}
