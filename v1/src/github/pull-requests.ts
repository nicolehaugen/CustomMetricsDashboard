import { Octokit } from '@octokit/rest';
import { withRateLimitRetry } from './pagination';

export interface PullRequestRow {
  number: number;
  author_login: string | null;
  created_at: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  title: string | null;
  state: string;
  labels: Array<{ name: string }>;
  additions: number | null;
  deletions: number | null;
}

export async function fetchPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string,
  since?: Date
): Promise<PullRequestRow[]> {
  console.log(`Fetching pull requests for ${owner}/${repo}...`);

  const prs = await withRateLimitRetry(() =>
    octokit.paginate(octokit.rest.pulls.list, {
      owner,
      repo,
      state: 'closed' as const,
      sort: 'updated' as const,
      direction: 'desc' as const,
      per_page: 100,
    })
  );

  const results: PullRequestRow[] = [];

  for (const pr of prs) {
    if (!pr.merged_at) continue;
    if (since && new Date(pr.updated_at || pr.merged_at) < since) continue;

    let additions: number | null = null;
    let deletions: number | null = null;

    try {
      const detail = await withRateLimitRetry(() =>
        octokit.rest.pulls.get({ owner, repo, pull_number: pr.number })
      );
      additions = detail.data.additions;
      deletions = detail.data.deletions;
    } catch (err) {
      console.log(`  Warning: Could not fetch details for PR #${pr.number}`);
    }

    results.push({
      number: pr.number,
      author_login: pr.user?.login || null,
      created_at: pr.created_at,
      merged_at: pr.merged_at,
      merge_commit_sha: pr.merge_commit_sha || null,
      title: pr.title || null,
      state: pr.state,
      labels: (pr.labels || []).map((l: any) => ({ name: l.name || '' })),
      additions,
      deletions,
    });
  }

  console.log(`  Found ${results.length} merged PRs`);
  return results;
}
