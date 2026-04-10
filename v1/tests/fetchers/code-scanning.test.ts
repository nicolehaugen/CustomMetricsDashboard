import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

import { fetchCodeScanningAlerts } from '../../src/github/code-scanning';

describe('fetchCodeScanningAlerts', () => {
  it('returns empty array when code scanning not enabled (404)', async () => {
    const octokit = {
      paginate: vi.fn(async () => {
        throw Object.assign(new Error('Not Found'), { status: 404 });
      }),
    } as any;

    const result = await fetchCodeScanningAlerts(octokit, 'owner', 'repo');
    expect(result).toEqual([]);
  });

  it('maps alerts correctly', async () => {
    const mockAlerts = [
      {
        number: 1,
        rule: { security_severity_level: 'high' },
        state: 'open',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        fixed_at: null,
        tool: { name: 'CodeQL' },
      },
    ];

    const octokit = {
      paginate: vi.fn(async () => mockAlerts),
    } as any;

    const result = await fetchCodeScanningAlerts(octokit, 'owner', 'repo');
    expect(result).toHaveLength(1);
    expect(result[0].alert_number).toBe(1);
    expect(result[0].severity).toBe('high');
    expect(result[0].tool_name).toBe('CodeQL');
    expect(result[0].state).toBe('open');
  });
});
