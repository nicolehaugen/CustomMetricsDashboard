import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { withRateLimitRetry } from './pagination';

export interface WorkflowRunRecord {
  run_id: number;
  name: string | null;
  workflow_id: number | null;
  head_branch: string | null;
  head_sha: string | null;
  run_number: number | null;
  event: string | null;
  status: string | null;
  conclusion: string | null;
  created_at: string;
  updated_at: string | null;
  run_started_at: string | null;
  run_attempt: number | null;
  actor_login: string | null;
  actor_id: number | null;
  triggering_actor_login: string | null;
  triggering_actor_id: number | null;
}

export async function fetchWorkflowRuns(
  octokit: Octokit,
  owner: string,
  repo: string,
  since?: Date
): Promise<WorkflowRunRecord[]> {
  const raw = await withRateLimitRetry(() =>
    octokit.paginate(octokit.rest.actions.listWorkflowRunsForRepo, {
      owner,
      repo,
      per_page: 100,
      ...(since ? { created: `>${since.toISOString()}` } : {}),
    })
  );

  const records: WorkflowRunRecord[] = raw.map(r => ({
    run_id: r.id,
    name: r.name ?? null,
    workflow_id: r.workflow_id ?? null,
    head_branch: r.head_branch ?? null,
    head_sha: r.head_sha ?? null,
    run_number: r.run_number ?? null,
    event: r.event ?? null,
    status: r.status ?? null,
    conclusion: r.conclusion ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at ?? null,
    run_started_at: r.run_started_at ?? null,
    run_attempt: r.run_attempt ?? null,
    actor_login: r.actor?.login ?? null,
    actor_id: r.actor?.id ?? null,
    triggering_actor_login: r.triggering_actor?.login ?? null,
    triggering_actor_id: r.triggering_actor?.id ?? null,
  }));

  const dir = path.join('data', 'raw', 'workflow-runs');
  await fs.mkdir(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  await fs.writeFile(path.join(dir, `${today}.json`), JSON.stringify(records, null, 2));

  return records;
}
