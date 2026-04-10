import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { withRateLimitRetry } from './pagination';

export interface PullRequestRecord {
  number: number;
  title: string | null;
  state: string;
  body: string | null;
  created_at: string;
  updated_at: string | null;
  closed_at: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  draft: boolean | null;
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  user_login: string | null;
  user_id: number | null;
  merged_by_login: string | null;
  merged_by_id: number | null;
  head_sha: string | null;
  head_ref: string | null;
  base_ref: string | null;
  labels: unknown;
  requested_reviewers: unknown;
  assignees: unknown;
}

export async function fetchPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string,
  since?: Date
): Promise<PullRequestRecord[]> {
  const rawPRs = await withRateLimitRetry(() =>
    octokit.paginate(octokit.rest.pulls.list, {
      owner,
      repo,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
    })
  );

  // Filter by since if provided
  const filtered = since
    ? rawPRs.filter(pr => new Date(pr.updated_at) >= since)
    : rawPRs;

  // Fetch detail (additions/deletions/changed_files) for each PR
  const records: PullRequestRecord[] = [];
  for (const pr of filtered) {
    const detail = await withRateLimitRetry(() =>
      octokit.rest.pulls.get({ owner, repo, pull_number: pr.number })
    );
    records.push({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      body: pr.body ?? null,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      closed_at: pr.closed_at ?? null,
      merged_at: pr.merged_at ?? null,
      merge_commit_sha: pr.merge_commit_sha ?? null,
      draft: pr.draft ?? null,
      additions: detail.data.additions,
      deletions: detail.data.deletions,
      changed_files: detail.data.changed_files,
      user_login: pr.user?.login ?? null,
      user_id: pr.user?.id ?? null,
      merged_by_login: (pr as any).merged_by?.login ?? null,
      merged_by_id: (pr as any).merged_by?.id ?? null,
      head_sha: pr.head?.sha ?? null,
      head_ref: pr.head?.ref ?? null,
      base_ref: pr.base?.ref ?? null,
      labels: pr.labels ?? null,
      requested_reviewers: pr.requested_reviewers ?? null,
      assignees: pr.assignees ?? null,
    });
  }

  // Save raw dump
  const dir = path.join('data', 'raw', 'pull-requests');
  await fs.mkdir(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  await fs.writeFile(path.join(dir, `${today}.json`), JSON.stringify(records, null, 2));

  return records;
}
