import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

import { fetchIssues } from '../../src/github/issues';

describe('fetchIssues', () => {
  it('excludes pull requests from issue results', async () => {
    const mockIssues = [
      { number: 1, title: 'Bug', labels: [{ name: 'bug' }], state: 'open', created_at: '2024-01-01T00:00:00Z', closed_at: null, assignee: null },
      { number: 2, title: 'PR', labels: [], state: 'closed', created_at: '2024-01-02T00:00:00Z', closed_at: '2024-01-03T00:00:00Z', assignee: { login: 'dev1' }, pull_request: { url: 'https://...' } },
    ];

    const octokit = {
      rest: { issues: { listForRepo: vi.fn() } },
      paginate: vi.fn(async () => mockIssues),
    } as any;

    const result = await fetchIssues(octokit, 'owner', 'repo');
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(1);
    expect(result[0].title).toBe('Bug');
  });
});
