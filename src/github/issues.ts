import { Octokit } from '@octokit/rest';
import { withRateLimitRetry } from './pagination';

export async function fetchIssues(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<Record<string, unknown>[]> {
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const raw = await withRateLimitRetry(() =>
    octokit.paginate(octokit.rest.issues.listForRepo, {
      owner, repo, state: 'all', sort: 'updated', direction: 'desc',
      per_page: 100, since: since.toISOString(),
    })
  );

  return raw
    .filter(i => !i.pull_request)
    .map(i => ({
      id: i.id,
      number: i.number,
      title: i.title,
      state: i.state,
      body: i.body ?? null,
      created_at: i.created_at,
      updated_at: i.updated_at ?? null,
      closed_at: i.closed_at ?? null,
      user: i.user ?? null,
      assignee: i.assignee ?? null,
      labels: i.labels ?? null,
      assignees: i.assignees ?? null,
      milestone: i.milestone ?? null,
      pull_request: i.pull_request ?? null,
    }));
}
