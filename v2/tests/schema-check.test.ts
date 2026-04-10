import { describe, it, expect, vi } from 'vitest';
import { assertSchemaMatch, SchemaMismatchError } from '../src/sync/schema-check';

describe('assertSchemaMatch', () => {
  it('throws SchemaMismatchError when API key is missing from DB columns', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ column_name: 'id' }, { column_name: 'day' }],
      }),
    };
    const apiRecord = { day: '2024-01-01', new_field: 42 };
    await expect(
      assertSchemaMatch('copilot_org_metrics', apiRecord, mockPool as any)
    ).rejects.toThrow(SchemaMismatchError);
    await expect(
      assertSchemaMatch('copilot_org_metrics', apiRecord, mockPool as any)
    ).rejects.toThrow(/new_field/);
  });

  it('passes when all API keys exist in DB columns', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { column_name: 'id' },
          { column_name: 'day' },
          { column_name: 'fetched_at' },
          { column_name: 'daily_active_users' },
        ],
      }),
    };
    const apiRecord = { day: '2024-01-01', daily_active_users: 50 };
    await expect(
      assertSchemaMatch('copilot_org_metrics', apiRecord, mockPool as any)
    ).resolves.toBeUndefined();
  });

  it('passes when DB has extra infrastructure columns (id, fetched_at)', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { column_name: 'id' },
          { column_name: 'day' },
          { column_name: 'fetched_at' },
          { column_name: 'loc_added_sum' },
        ],
      }),
    };
    const apiRecord = { day: '2024-01-01', loc_added_sum: 300 };
    await expect(
      assertSchemaMatch('copilot_org_metrics', apiRecord, mockPool as any)
    ).resolves.toBeUndefined();
  });

  it('SchemaMismatchError has the correct name', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    try {
      await assertSchemaMatch('t', { missing: 1 }, mockPool as any);
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaMismatchError);
      expect((e as Error).name).toBe('SchemaMismatchError');
    }
  });
});
