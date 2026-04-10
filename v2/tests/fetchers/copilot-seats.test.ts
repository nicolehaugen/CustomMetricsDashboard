import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import * as fs from 'fs/promises';
import { fetchCopilotSeats } from '../../src/github/copilot-seats';

const mockSeats = [
  {
    assignee: { login: 'dev1', id: 1001, type: 'User' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-10T00:00:00Z',
    last_activity_at: '2024-01-10T12:00:00Z',
    last_activity_editor: 'vscode',
    plan_type: 'business',
    pending_cancellation_date: null,
  },
];

// Simulate Octokit's paginate: calls the map function with the API wrapper response
// (the real GitHub API returns { total_seats, seats: [...] }, not a flat array)
const mockOctokit = {
  rest: { copilot: { listCopilotSeats: vi.fn() } },
  paginate: vi.fn(async (_method: any, _params: any, mapFn?: any) => {
    if (mapFn) {
      return mapFn({ data: { total_seats: mockSeats.length, seats: mockSeats } });
    }
    return mockSeats;
  }),
} as any;

describe('fetchCopilotSeats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flattens assignee.login to assignee_login', async () => {
    const result = await fetchCopilotSeats(mockOctokit, 'my-org');
    expect(result[0].assignee_login).toBe('dev1');
  });

  it('flattens assignee.id to assignee_id', async () => {
    const result = await fetchCopilotSeats(mockOctokit, 'my-org');
    expect(result[0].assignee_id).toBe(1001);
  });

  it('flattens assignee.type to assignee_type', async () => {
    const result = await fetchCopilotSeats(mockOctokit, 'my-org');
    expect(result[0].assignee_type).toBe('User');
  });

  it('does not include nested assignee object', async () => {
    const result = await fetchCopilotSeats(mockOctokit, 'my-org');
    expect(result[0]).not.toHaveProperty('assignee');
  });

  it('preserves last_activity_editor and plan_type', async () => {
    const result = await fetchCopilotSeats(mockOctokit, 'my-org');
    expect(result[0].last_activity_editor).toBe('vscode');
    expect(result[0].plan_type).toBe('business');
  });

  it('writes raw JSON file to data/raw/copilot-seats/', async () => {
    await fetchCopilotSeats(mockOctokit, 'my-org');
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('copilot-seats'),
      expect.any(String)
    );
  });

  it('passes a map function to paginate that extracts seats from the API wrapper', async () => {
    await fetchCopilotSeats(mockOctokit, 'my-org');
    const [, , mapFn] = mockOctokit.paginate.mock.calls[0];
    expect(mapFn).toBeDefined();
    const extracted = mapFn({ data: { total_seats: 1, seats: [mockSeats[0]] } });
    expect(extracted).toEqual([mockSeats[0]]);
  });

  it('returns empty array when wrapper has no seats', async () => {
    mockOctokit.paginate.mockImplementationOnce(async (_m: any, _p: any, mapFn?: any) =>
      mapFn ? mapFn({ data: { total_seats: 0 } }) : []
    );
    const result = await fetchCopilotSeats(mockOctokit, 'my-org');
    expect(result).toHaveLength(0);
  });
});
