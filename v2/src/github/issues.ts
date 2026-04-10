import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { withRateLimitRetry } from './pagination';

export interface IssueRecord {
  number: number;
  title: string | null;
  state: string;
  body: string | null;
  created_at: string;
  updated_at: string | null;
  closed_at: string | null;
  user_login: string | null;
  user_id: number | null;
  assignee_login: string | null;
  assignee_id: number | null;
  labels: unknown;
  assignees: unknown;
  milestone: unknown;
  pull_request: unknown;
}

export async function fetchIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  since?: Date
): Promise<IssueRecord[]> {
  const raw = await withRateLimitRetry(() =>
    octokit.paginate(octokit.rest.issues.listForRepo, {
      owner,
      repo,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
      ...(since ? { since: since.toISOString() } : {}),
    })
  );

  // Filter out pull requests (issues API returns PRs too)
  const issues = raw.filter(i => !i.pull_request);

  const records: IssueRecord[] = issues.map(i => ({
    number: i.number,
    title: i.title,
    state: i.state,
    body: i.body ?? null,
    created_at: i.created_at,
    updated_at: i.updated_at ?? null,
    closed_at: i.closed_at ?? null,
    user_login: i.user?.login ?? null,
    user_id: i.user?.id ?? null,
    assignee_login: i.assignee?.login ?? null,
    assignee_id: i.assignee?.id ?? null,
    labels: i.labels ?? null,
    assignees: i.assignees ?? null,
    milestone: i.milestone ?? null,
    pull_request: i.pull_request ?? null,
  }));

  const dir = path.join('data', 'raw', 'issues');
  await fs.mkdir(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  await fs.writeFile(path.join(dir, `${today}.json`), JSON.stringify(records, null, 2));

  return records;
}
