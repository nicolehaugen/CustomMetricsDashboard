import { Octokit } from '@octokit/rest';
import { withRateLimitRetry } from './pagination';

export async function fetchWorkflowRuns(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<Record<string, unknown>[]> {
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const raw = await withRateLimitRetry(() =>
    octokit.paginate(octokit.rest.actions.listWorkflowRunsForRepo, {
      owner, repo, per_page: 100,
      created: `>${since.toISOString()}`,
    })
  );

  return raw.map(r => ({
    id: r.id,
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
    actor: r.actor ?? null,
    triggering_actor: r.triggering_actor ?? null,
  }));
}
