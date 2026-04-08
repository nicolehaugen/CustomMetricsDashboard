import { Octokit } from '@octokit/rest';
import { withRateLimitRetry } from './pagination';

export interface IssueRow {
  number: number;
  title: string | null;
  labels: Array<{ name: string }>;
  state: string;
  created_at: string;
  closed_at: string | null;
  assignee_login: string | null;
}

export async function fetchIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  since?: Date
): Promise<IssueRow[]> {
  console.log(`Fetching issues for ${owner}/${repo}...`);

  const issues = await withRateLimitRetry(() =>
    octokit.paginate(octokit.rest.issues.listForRepo, {
      owner,
      repo,
      state: 'all' as const,
      sort: 'updated' as const,
      direction: 'desc' as const,
      per_page: 100,
      ...(since ? { since: since.toISOString() } : {}),
    })
  );

  const results: IssueRow[] = (issues as any[])
    .filter((issue: any) => !issue.pull_request)
    .map((issue: any) => ({
      number: issue.number,
      title: issue.title || null,
      labels: (issue.labels || []).map((l: any) => ({ name: typeof l === 'string' ? l : l.name || '' })),
      state: issue.state,
      created_at: issue.created_at,
      closed_at: issue.closed_at || null,
      assignee_login: issue.assignee?.login || null,
    }));

  console.log(`  Found ${results.length} issues`);
  return results;
}
