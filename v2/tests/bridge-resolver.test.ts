import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPool = { query: vi.fn() };

vi.mock('../src/db/connection', () => ({
  getPool: vi.fn(() => mockPool),
}));

import { resolveBridge } from '../src/sync/bridge-resolver';

describe('resolveBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts direct_sha bridge links when deployment sha matches PR merge_commit_sha', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ deployment_id: 1, pr_number: 100 }],
      }) // direct matches
      .mockResolvedValueOnce({ rows: [] }) // INSERT direct
      .mockResolvedValueOnce({ rows: [] }) // squash matches
      ;

    const count = await resolveBridge(mockPool as any);
    expect(count).toBe(1);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("'direct_sha'"),
      [1, 100]
    );
  });

  it('inserts squash_fallback links when deployment sha matches PR head_sha', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] }) // no direct matches
      .mockResolvedValueOnce({
        rows: [{ deployment_id: 2, pr_number: 200 }],
      }) // squash matches
      .mockResolvedValueOnce({ rows: [] }); // INSERT squash

    const count = await resolveBridge(mockPool as any);
    expect(count).toBe(1);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("'squash_fallback'"),
      [2, 200]
    );
  });

  it('returns 0 when no matches found', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const count = await resolveBridge(mockPool as any);
    expect(count).toBe(0);
  });
});
