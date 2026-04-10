import { Octokit } from '@octokit/rest';
import { withRateLimitRetry } from './pagination';

export interface WorkflowRunRow {
  github_run_id: number;
  workflow_name: string | null;
  conclusion: string | null;
  created_at: string;
  updated_at: string | null;
  run_started_at: string | null;
  head_sha: string | null;
}

export async function fetchWorkflowRuns(
  octokit: Octokit,
  owner: string,
  repo: string,
  since?: Date
): Promise<WorkflowRunRow[]> {
  console.log(`Fetching workflow runs for ${owner}/${repo}...`);

  const runs = await withRateLimitRetry(() =>
    octokit.paginate('GET /repos/{owner}/{repo}/actions/runs', {
      owner,
      repo,
      per_page: 100,
      ...(since ? { created: `>=${since.toISOString().split('T')[0]}` } : {}),
    } as any, (response: any) => response.data.workflow_runs || response.data)
  );

  const results: WorkflowRunRow[] = (runs as any[]).map((run: any) => ({
    github_run_id: run.id,
    workflow_name: run.name || null,
    conclusion: run.conclusion || null,
    created_at: run.created_at,
    updated_at: run.updated_at || null,
    run_started_at: run.run_started_at || null,
    head_sha: run.head_sha || null,
  }));

  console.log(`  Found ${results.length} workflow runs`);
  return results;
}
