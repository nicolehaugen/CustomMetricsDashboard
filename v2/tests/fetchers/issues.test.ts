import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { fetchIssues } from '../../src/github/issues';

const mockIssues = [
  {
    number: 1,
    title: 'Incident: outage',
    state: 'closed',
    body: 'body',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    closed_at: '2024-01-02T00:00:00Z',
    user: { login: 'dev1', id: 1001 },
    assignee: null,
    labels: [{ id: 1, name: 'incident', color: 'red' }],
    assignees: [],
    milestone: null,
    // no pull_request field = pure issue
  },
  {
    number: 2,
    title: 'Fix something',
    state: 'open',
    body: 'body',
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
    closed_at: null,
    user: { login: 'dev2', id: 1002 },
    assignee: null,
    labels: [],
    assignees: [],
    milestone: null,
    pull_request: { url: 'https://...' }, // this should be filtered OUT
  },
];

const mockOctokit = {
  rest: { issues: { listForRepo: vi.fn() } },
  paginate: vi.fn(async () => mockIssues),
} as any;

describe('fetchIssues', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters out pull requests from issues list', async () => {
    const result = await fetchIssues(mockOctokit, 'owner', 'repo');
    expect(result.length).toBe(1);
    expect(result[0].number).toBe(1);
  });

  it('maps issue fields correctly', async () => {
    const result = await fetchIssues(mockOctokit, 'owner', 'repo');
    expect(result[0].user_login).toBe('dev1');
    expect(result[0].user_id).toBe(1001);
    expect(result[0].state).toBe('closed');
  });

  it('writes raw JSON file', async () => {
    const { writeFile } = await import('fs/promises');
    await fetchIssues(mockOctokit, 'owner', 'repo');
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('issues'),
      expect.any(String)
    );
  });
});
