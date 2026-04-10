import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import * as fs from 'fs/promises';
import { fetchPullRequests } from '../../src/github/pull-requests';

const mockPRs = [
  {
    number: 1,
    title: 'Test PR',
    state: 'closed',
    body: 'body',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    closed_at: '2024-01-02T00:00:00Z',
    merged_at: '2024-01-02T00:00:00Z',
    merge_commit_sha: 'abc123',
    draft: false,
    user: { login: 'dev1', id: 1001 },
    head: { sha: 'headsha', ref: 'feature/x' },
    base: { ref: 'main' },
    labels: [],
    requested_reviewers: [],
    assignees: [],
    merged_by: { login: 'dev1', id: 1001 },
  },
];

const mockOctokit = {
  rest: {
    pulls: {
      list: vi.fn(),
      get: vi.fn().mockResolvedValue({
        data: { additions: 10, deletions: 5, changed_files: 3 },
      }),
    },
  },
  paginate: vi.fn(async () => mockPRs),
} as any;

describe('fetchPullRequests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns mapped pull request records', async () => {
    const result = await fetchPullRequests(mockOctokit, 'owner', 'repo');
    expect(result.length).toBe(1);
    expect(result[0].number).toBe(1);
    expect(result[0].user_login).toBe('dev1');
    expect(result[0].user_id).toBe(1001);
    expect(result[0].additions).toBe(10);
    expect(result[0].deletions).toBe(5);
  });

  it('writes raw JSON file to data/raw/pull-requests/', async () => {
    await fetchPullRequests(mockOctokit, 'owner', 'repo');
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('pull-requests'),
      expect.any(String)
    );
  });

  it('fetches individual PR detail for additions/deletions', async () => {
    await fetchPullRequests(mockOctokit, 'owner', 'repo');
    expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 1,
    });
  });
});
