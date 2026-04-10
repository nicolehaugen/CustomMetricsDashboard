import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

import { fetchWorkflowRuns } from '../../src/github/workflow-runs';

describe('fetchWorkflowRuns', () => {
  it('fetches and maps workflow runs', async () => {
    const mockRuns = [
      { id: 101, name: 'CI', conclusion: 'success', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:05:00Z', run_started_at: '2024-01-01T00:00:30Z', head_sha: 'sha1' },
    ];

    const octokit = {
      paginate: vi.fn(async () => mockRuns),
    } as any;

    const result = await fetchWorkflowRuns(octokit, 'owner', 'repo');
    expect(result).toHaveLength(1);
    expect(result[0].github_run_id).toBe(101);
    expect(result[0].workflow_name).toBe('CI');
    expect(result[0].conclusion).toBe('success');
  });
});
