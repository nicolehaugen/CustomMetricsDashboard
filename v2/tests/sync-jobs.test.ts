import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPool = { query: vi.fn() };

vi.mock('../src/db/connection', () => ({
  getPool: vi.fn(() => mockPool),
}));

vi.mock('../src/github/client', () => ({
  createOctokit: vi.fn(),
}));

vi.mock('../src/sync/orchestrator', () => ({
  runSync: vi.fn(() => Promise.resolve(1)),
}));

import router from '../src/routes/sync';

function getHandler(method: string, path: string) {
  return router.stack.find(
    (layer: any) => layer.route?.path === path && layer.route?.methods[method]
  )?.route?.stack[0]?.handle;
}

describe('GET /jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns recent sync jobs ordered by started_at DESC with default limit', async () => {
    const jobs = [
      { id: 2, status: 'completed', started_at: '2026-04-10T15:01:00Z', finished_at: '2026-04-10T15:02:00Z', records_synced: { pull_requests: 5 }, error_message: null },
      { id: 1, status: 'failed', started_at: '2026-04-10T14:00:00Z', finished_at: '2026-04-10T14:01:00Z', records_synced: null, error_message: 'timeout' },
    ];
    mockPool.query.mockResolvedValueOnce({ rows: jobs });

    const req = { query: {} } as any;
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    const handler = getHandler('get', '/jobs');
    expect(handler).toBeDefined();
    await handler(req, res);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY started_at DESC'),
      [10]
    );
    expect(res.json).toHaveBeenCalledWith(jobs);
  });

  it('respects ?limit query parameter', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const req = { query: { limit: '5' } } as any;
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    const handler = getHandler('get', '/jobs');
    await handler(req, res);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $1'),
      [5]
    );
  });

  it('caps limit at 50', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const req = { query: { limit: '100' } } as any;
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    const handler = getHandler('get', '/jobs');
    await handler(req, res);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $1'),
      [50]
    );
  });

  it('falls back to default 10 for invalid limit', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const req = { query: { limit: 'abc' } } as any;
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    const handler = getHandler('get', '/jobs');
    await handler(req, res);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $1'),
      [10]
    );
  });
});
