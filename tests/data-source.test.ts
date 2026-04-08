import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPool = {
  query: vi.fn(),
};

vi.mock('../src/db/connection', () => ({
  getPool: vi.fn(() => mockPool),
}));

import { default as router } from '../src/routes/data-source';

describe('data-source route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns seeded source type from database', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ source_type: 'seeded', repository: null, updated_at: '2026-01-01T00:00:00Z' }],
    });

    const req = {} as any;
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    const handler = router.stack.find((layer: any) => layer.route?.path === '/')?.route?.stack[0]?.handle;
    expect(handler).toBeDefined();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      source_type: 'seeded',
      repository: null,
      updated_at: '2026-01-01T00:00:00Z',
    });
  });

  it('returns github source type with repository', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ source_type: 'github', repository: 'octodemo/copilot_nodejs_basic-special-trout', updated_at: '2026-01-01T00:00:00Z' }],
    });

    const req = {} as any;
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    const handler = router.stack.find((layer: any) => layer.route?.path === '/')?.route?.stack[0]?.handle;
    expect(handler).toBeDefined();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      source_type: 'github',
      repository: 'octodemo/copilot_nodejs_basic-special-trout',
      updated_at: '2026-01-01T00:00:00Z',
    });
  });

  it('returns unknown when no metadata exists', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const req = {} as any;
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    const handler = router.stack.find((layer: any) => layer.route?.path === '/')?.route?.stack[0]?.handle;
    expect(handler).toBeDefined();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      source_type: 'unknown',
      repository: null,
      updated_at: null,
    });
  });

  it('returns 500 on database error', async () => {
    mockPool.query.mockRejectedValue(new Error('Connection refused'));

    const req = {} as any;
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    const handler = router.stack.find((layer: any) => layer.route?.path === '/')?.route?.stack[0]?.handle;
    expect(handler).toBeDefined();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Connection refused' });
  });
});
