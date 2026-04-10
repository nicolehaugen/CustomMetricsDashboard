import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import * as fs from 'fs/promises';
import { fetchCopilotOrgMetrics } from '../../src/github/copilot-org-metrics';

const mockDayTotals = [
  {
    day: '2024-01-15',
    organization_id: 'org-1',
    daily_active_users: 45,
    loc_added_sum: 630,
    loc_suggested_to_add_sum: 1700,
    pull_requests: { total_created: 5, total_merged: 4, total_created_by_copilot: 1 },
    totals_by_feature: [{ feature: 'code_completion', loc_added_sum: 630 }],
    totals_by_ide: [{ ide: 'vscode', loc_added_sum: 630 }],
    totals_by_language_feature: [],
    totals_by_language_model: [],
    totals_by_model_feature: [],
    totals_by_cli: null,
  },
];

const ndjsonLine = JSON.stringify({ day_totals: mockDayTotals });

describe('fetchCopilotOrgMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () => ({
      text: async () => ndjsonLine,
    })) as any;
  });

  it('fetches download_links and parses NDJSON', async () => {
    const mockOctokit = {
      request: vi.fn().mockResolvedValue({
        data: { download_links: ['https://example.com/report.ndjson'] },
      }),
    } as any;

    const result = await fetchCopilotOrgMetrics(mockOctokit, 'my-org');
    expect(result.length).toBe(1);
    expect(result[0].day).toBe('2024-01-15');
    expect(result[0].daily_active_users).toBe(45);
    expect(result[0].loc_added_sum).toBe(630);
  });

  it('flattens day_totals array into individual records', async () => {
    const twoTotals = [
      { ...mockDayTotals[0], day: '2024-01-15' },
      { ...mockDayTotals[0], day: '2024-01-16' },
    ];
    global.fetch = vi.fn(async () => ({
      text: async () => JSON.stringify({ day_totals: twoTotals }),
    })) as any;

    const mockOctokit = {
      request: vi.fn().mockResolvedValue({
        data: { download_links: ['https://example.com/r.ndjson'] },
      }),
    } as any;

    const result = await fetchCopilotOrgMetrics(mockOctokit, 'my-org');
    expect(result.length).toBe(2);
  });

  it('writes raw JSON file to data/raw/copilot-org-metrics/', async () => {
    const mockOctokit = {
      request: vi.fn().mockResolvedValue({
        data: { download_links: ['https://example.com/r.ndjson'] },
      }),
    } as any;

    await fetchCopilotOrgMetrics(mockOctokit, 'my-org');
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('copilot-org-metrics'),
      expect.any(String)
    );
  });

  it('preserves pull_requests and totals_by_feature JSONB fields', async () => {
    const mockOctokit = {
      request: vi.fn().mockResolvedValue({
        data: { download_links: ['https://example.com/r.ndjson'] },
      }),
    } as any;

    const result = await fetchCopilotOrgMetrics(mockOctokit, 'my-org');
    expect(result[0].pull_requests).toEqual(mockDayTotals[0].pull_requests);
    expect(result[0].totals_by_feature).toEqual(mockDayTotals[0].totals_by_feature);
  });
});
