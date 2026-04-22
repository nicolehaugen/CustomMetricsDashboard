import { Octokit } from '@octokit/rest';
import { withRateLimitRetry } from './pagination';

export async function fetchPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<Record<string, unknown>[]> {
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const rawPRs = await withRateLimitRetry(() =>
    octokit.paginate(octokit.rest.pulls.list, {
      owner, repo, state: 'all', sort: 'updated', direction: 'desc', per_page: 100,
    })
  );

  const filtered = rawPRs.filter(pr => new Date(pr.updated_at) >= since);

  const records: Record<string, unknown>[] = [];
  for (const pr of filtered) {
    const detail = await withRateLimitRetry(() =>
      octokit.rest.pulls.get({ owner, repo, pull_number: pr.number })
    );
    const d = detail.data;
    records.push({
      id: d.id,
      number: d.number,
      title: d.title,
      state: d.state,
      body: d.body ?? null,
      created_at: d.created_at,
      updated_at: d.updated_at,
      closed_at: d.closed_at ?? null,
      merged_at: d.merged_at ?? null,
      merge_commit_sha: d.merge_commit_sha ?? null,
      draft: d.draft ?? null,
      additions: d.additions,
      deletions: d.deletions,
      changed_files: d.changed_files,
      user: d.user ?? null,
      merged_by: d.merged_by ?? null,
      head: d.head ?? null,
      base: d.base ?? null,
      labels: d.labels ?? null,
      requested_reviewers: d.requested_reviewers ?? null,
      assignees: d.assignees ?? null,
    });
  }
  return records;
}
