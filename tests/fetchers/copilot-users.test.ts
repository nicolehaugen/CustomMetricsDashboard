import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

import { fetchCopilotUserActivity } from '../../src/github/copilot-users';

describe('fetchCopilotUserActivity', () => {
  it('iterates over a date range', async () => {
    const octokit = {
      request: vi.fn(async () => ({
        data: [{ login: 'user1', user_initiated_interaction_count: 5 }, { login: 'user2', user_initiated_interaction_count: 3 }],
      })),
    } as any;

    const since = new Date();
    since.setDate(since.getDate() - 2);
    const result = await fetchCopilotUserActivity(octokit, 'test-org', since);

    // 3 days × 2 users = 6 records
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result[0].is_active).toBe(true);
    expect(octokit.request).toHaveBeenCalledTimes(3);
  });

  it('handles 404 gracefully for unavailable days', async () => {
    const octokit = {
      request: vi.fn(async () => {
        throw Object.assign(new Error('Not Found'), { status: 404 });
      }),
    } as any;

    const since = new Date();
    since.setDate(since.getDate() - 1);
    const result = await fetchCopilotUserActivity(octokit, 'test-org', since);
    expect(result).toEqual([]);
  });
});
