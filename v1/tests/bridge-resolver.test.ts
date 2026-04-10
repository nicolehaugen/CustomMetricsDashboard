import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPool = {
  query: vi.fn(),
};

vi.mock('../src/db/connection', () => ({
  getPool: vi.fn(() => mockPool),
}));

vi.mock('../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

import { resolveBridgeLinks } from '../src/sync/bridge-resolver';

describe('bridge-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves direct SHA match', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, sha: 'abc123' }] }) // unlinked deployments
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // direct SHA match
      .mockResolvedValueOnce({ rows: [] }); // insert bridge link

    const mockOctokit = {} as any;
    const result = await resolveBridgeLinks(mockOctokit, 'owner', 'repo');
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 when no unlinked deployments exist', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const mockOctokit = {} as any;
    const result = await resolveBridgeLinks(mockOctokit, 'owner', 'repo');
    expect(result).toBe(0);
  });
});
