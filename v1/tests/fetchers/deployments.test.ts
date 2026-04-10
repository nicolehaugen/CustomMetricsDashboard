import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

import { fetchDeployments } from '../../src/github/deployments';

describe('fetchDeployments', () => {
  it('fetches deployments and their statuses', async () => {
    const mockDeployments = [
      { id: 1, environment: 'production', sha: 'abc123', ref: 'main', created_at: '2024-01-15T10:00:00Z', creator: { login: 'user1' } },
      { id: 2, environment: 'staging', sha: 'def456', ref: 'dev', created_at: '2024-01-16T10:00:00Z', creator: { login: 'user2' } },
    ];
    const mockStatuses: Record<number, any[]> = {
      1: [{ state: 'success', created_at: '2024-01-15T10:05:00Z' }],
      2: [{ state: 'failure', created_at: '2024-01-16T10:05:00Z' }],
    };

    const octokit = {
      rest: {
        repos: {
          listDeployments: vi.fn(),
          listDeploymentStatuses: vi.fn(),
        },
      },
      paginate: vi.fn(async (method: any, params?: any) => {
        if (method === octokit.rest.repos.listDeployments) return mockDeployments;
        if (method === octokit.rest.repos.listDeploymentStatuses) return mockStatuses[params?.deployment_id] || [];
        return [];
      }),
    } as any;

    const result = await fetchDeployments(octokit, 'owner', 'repo');

    expect(result.deployments).toHaveLength(2);
    expect(result.deployments[0].github_deployment_id).toBe(1);
    expect(result.deployments[0].environment).toBe('production');
    expect(result.statuses).toHaveLength(2);
    expect(result.statuses[0].state).toBe('success');
  });

  it('filters by since parameter', async () => {
    const mockDeployments = [
      { id: 1, environment: 'production', sha: 'abc', ref: 'main', created_at: '2024-01-10T00:00:00Z', creator: { login: 'u1' } },
      { id: 2, environment: 'production', sha: 'def', ref: 'main', created_at: '2024-01-20T00:00:00Z', creator: { login: 'u2' } },
    ];

    const octokit = {
      rest: {
        repos: {
          listDeployments: vi.fn(),
          listDeploymentStatuses: vi.fn(),
        },
      },
      paginate: vi.fn(async (method: any) => {
        if (method === octokit.rest.repos.listDeployments) return mockDeployments;
        return [];
      }),
    } as any;

    const since = new Date('2024-01-15T00:00:00Z');
    const result = await fetchDeployments(octokit, 'owner', 'repo', since);

    expect(result.deployments).toHaveLength(1);
    expect(result.deployments[0].github_deployment_id).toBe(2);
  });
});
