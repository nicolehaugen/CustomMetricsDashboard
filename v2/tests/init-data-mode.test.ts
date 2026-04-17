import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPool = { query: vi.fn() };

vi.mock('../src/db/connection', () => ({
  getPool: vi.fn(() => mockPool),
}));

vi.mock('../src/config', () => ({
  config: {
    dataMode: 'live',
    dataSourceLabel: 'octodemo/org',
    dataSourceUrl: 'https://github.com/octodemo',
    port: 3001,
  },
}));

import { initDataMode } from '../src/sync/init-data-mode';

describe('initDataMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a data_mode row using config values when table is empty', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await initDataMode(mockPool as any);

    expect(mockPool.query).toHaveBeenCalledOnce();
    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(params).toEqual(['live', 'octodemo/org', 'https://github.com/octodemo']);
  });

  it('does not throw when the table already has a row (idempotent)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(initDataMode(mockPool as any)).resolves.toBeUndefined();
    expect(mockPool.query).toHaveBeenCalledOnce();
  });

  it('propagates database errors', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(initDataMode(mockPool as any)).rejects.toThrow('DB connection lost');
  });
});
