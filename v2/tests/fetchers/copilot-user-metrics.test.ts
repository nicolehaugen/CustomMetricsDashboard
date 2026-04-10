import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import * as fs from 'fs/promises';
import { fetchCopilotUserMetrics } from '../../src/github/copilot-user-metrics';

const mockUserRecord = {
  day: '2024-01-15',
  user_id: 42,
  user_login: 'dev1',
  enterprise_id: null,
  organization_id: 'org-1',
  user_initiated_interaction_count: 10,
  code_generation_activity_count: 8,
  code_acceptance_activity_count: 6,
  loc_suggested_to_add_sum: 200,
  loc_suggested_to_delete_sum: 50,
  loc_added_sum: 150,
  loc_deleted_sum: 30,
  used_agent: true,
  used_chat: false,
  used_cli: false,
  used_copilot_code_review_active: false,
  used_copilot_code_review_passive: true,
  totals_by_ide: [{ ide: 'vscode', loc_added_sum: 150 }],
  totals_by_feature: [{ feature: 'code_completion', loc_added_sum: 150 }],
  totals_by_language_feature: [],
  totals_by_language_model: [],
  totals_by_model_feature: [],
  totals_by_cli: null,
};

const ndjsonLine = JSON.stringify(mockUserRecord);

describe('fetchCopilotUserMetrics', () => {
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

    const result = await fetchCopilotUserMetrics(mockOctokit, 'my-org');
    expect(result.length).toBe(1);
    expect(result[0].day).toBe('2024-01-15');
    expect(result[0].user_login).toBe('dev1');
    expect(result[0].loc_added_sum).toBe(150);
  });

  it('handles multiple NDJSON lines', async () => {
    const twoLines = [
      JSON.stringify({ ...mockUserRecord, day: '2024-01-15', user_login: 'dev1' }),
      JSON.stringify({ ...mockUserRecord, day: '2024-01-16', user_login: 'dev2' }),
    ].join('\n');

    global.fetch = vi.fn(async () => ({
      text: async () => twoLines,
    })) as any;

    const mockOctokit = {
      request: vi.fn().mockResolvedValue({
        data: { download_links: ['https://example.com/r.ndjson'] },
      }),
    } as any;

    const result = await fetchCopilotUserMetrics(mockOctokit, 'my-org');
    expect(result.length).toBe(2);
    expect(result[0].user_login).toBe('dev1');
    expect(result[1].user_login).toBe('dev2');
  });

  it('handles null assignee fields gracefully', async () => {
    const nullRecord = JSON.stringify({
      ...mockUserRecord,
      user_id: null,
      enterprise_id: null,
      organization_id: null,
    });
    global.fetch = vi.fn(async () => ({
      text: async () => nullRecord,
    })) as any;

    const mockOctokit = {
      request: vi.fn().mockResolvedValue({
        data: { download_links: ['https://example.com/r.ndjson'] },
      }),
    } as any;

    const result = await fetchCopilotUserMetrics(mockOctokit, 'my-org');
    expect(result[0].user_id).toBeNull();
    expect(result[0].enterprise_id).toBeNull();
    expect(result[0].organization_id).toBeNull();
  });

  it('returns empty array when download_links is empty', async () => {
    const mockOctokit = {
      request: vi.fn().mockResolvedValue({
        data: { download_links: [] },
      }),
    } as any;

    const result = await fetchCopilotUserMetrics(mockOctokit, 'my-org');
    expect(result).toEqual([]);
  });

  it('writes raw JSON file to data/raw/copilot-user-metrics/', async () => {
    const mockOctokit = {
      request: vi.fn().mockResolvedValue({
        data: { download_links: ['https://example.com/r.ndjson'] },
      }),
    } as any;

    await fetchCopilotUserMetrics(mockOctokit, 'my-org');
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('copilot-user-metrics'),
      expect.any(String)
    );
  });

  it('preserves totals_by_ide and totals_by_feature JSONB fields', async () => {
    const mockOctokit = {
      request: vi.fn().mockResolvedValue({
        data: { download_links: ['https://example.com/r.ndjson'] },
      }),
    } as any;

    const result = await fetchCopilotUserMetrics(mockOctokit, 'my-org');
    expect(result[0].totals_by_ide).toEqual(mockUserRecord.totals_by_ide);
    expect(result[0].totals_by_feature).toEqual(mockUserRecord.totals_by_feature);
  });
});
