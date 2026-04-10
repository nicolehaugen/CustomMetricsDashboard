import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

import { fetchPullRequests } from '../../src/github/pull-requests';

describe('fetchPullRequests', () => {
  it('fetches only merged PRs with additions/deletions', async () => {
    const mockPRs = [
      {
        number: 1, user: { login: 'dev1' }, created_at: '2024-01-01T00:00:00Z',
        merged_at: '2024-01-02T00:00:00Z', merge_commit_sha: 'sha1', title: 'PR 1',
        state: 'closed', labels: [{ name: 'feature' }],
        updated_at: '2024-01-02T00:00:00Z',
      },
      {
        number: 2, user: { login: 'dev2' }, created_at: '2024-01-03T00:00:00Z',
        merged_at: null, title: 'PR 2', state: 'closed', labels: [],
        updated_at: '2024-01-03T00:00:00Z',
      },
    ];

    const octokit = {
      rest: {
        pulls: {
          list: vi.fn(),
          get: vi.fn().mockResolvedValue({ data: { additions: 100, deletions: 20 } }),
        },
      },
      paginate: vi.fn(async () => mockPRs),
    } as any;

    const result = await fetchPullRequests(octokit, 'owner', 'repo');

    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(1);
    expect(result[0].additions).toBe(100);
    expect(result[0].deletions).toBe(20);
    expect(result[0].labels).toEqual([{ name: 'feature' }]);
  });
});
