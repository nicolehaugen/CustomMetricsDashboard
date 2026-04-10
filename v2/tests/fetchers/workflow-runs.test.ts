import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { fetchWorkflowRuns } from '../../src/github/workflow-runs';

const mockRuns = [
  {
    id: 80001,
    name: 'CI',
    workflow_id: 101,
    head_branch: 'main',
    head_sha: 'abc123',
    run_number: 1,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:10:00Z',
    run_started_at: '2024-01-01T00:00:05Z',
    run_attempt: 1,
    actor: { login: 'dev1', id: 1001 },
    triggering_actor: { login: 'dev1', id: 1001 },
  },
];

const mockOctokit = {
  rest: { actions: { listWorkflowRunsForRepo: vi.fn() } },
  paginate: vi.fn(async () => mockRuns),
} as any;

describe('fetchWorkflowRuns', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps run fields correctly', async () => {
    const result = await fetchWorkflowRuns(mockOctokit, 'owner', 'repo');
    expect(result.length).toBe(1);
    expect(result[0].run_id).toBe(80001);
    expect(result[0].actor_login).toBe('dev1');
    expect(result[0].conclusion).toBe('success');
  });

  it('writes raw JSON file', async () => {
    const { writeFile } = await import('fs/promises');
    await fetchWorkflowRuns(mockOctokit, 'owner', 'repo');
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('workflow-runs'),
      expect.any(String)
    );
  });
});
