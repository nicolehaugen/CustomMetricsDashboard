import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/pagination', () => ({
  withRateLimitRetry: vi.fn(async (fn: any) => fn()),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import * as fs from 'fs/promises';
import { fetchDeployments } from '../../src/github/deployments';

const mockDeployments = [
  {
    id: 1001,
    sha: 'abc123',
    ref: 'main',
    task: 'deploy',
    environment: 'production',
    description: 'Deploy v1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    creator: { login: 'deployer', id: 9001 },
    payload: {},
  },
];

const mockStatuses = [
  {
    state: 'success',
    description: 'Deployed!',
    environment: 'production',
    environment_url: 'https://prod.example.com',
    creator: { login: 'deployer', id: 9001 },
    created_at: '2024-01-01T00:05:00Z',
    updated_at: '2024-01-01T00:05:00Z',
  },
];

const mockOctokit = {
  rest: {
    repos: {
      listDeployments: vi.fn(),
      listDeploymentStatuses: vi.fn(),
    },
  },
  paginate: vi.fn(async (method: any) => {
    if (method === mockOctokit.rest.repos.listDeployments) return mockDeployments;
    return mockStatuses;
  }),
} as any;

describe('fetchDeployments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns mapped deployment records', async () => {
    const { deployments } = await fetchDeployments(mockOctokit, 'owner', 'repo');
    expect(deployments.length).toBe(1);
    expect(deployments[0].deployment_id).toBe(1001);
    expect(deployments[0].environment).toBe('production');
    expect(deployments[0].creator_login).toBe('deployer');
  });

  it('returns deployment statuses', async () => {
    const { statuses } = await fetchDeployments(mockOctokit, 'owner', 'repo');
    expect(statuses.length).toBe(1);
    expect(statuses[0].deployment_id).toBe(1001);
    expect(statuses[0].state).toBe('success');
  });

  it('writes raw JSON files to data/raw/', async () => {
    await fetchDeployments(mockOctokit, 'owner', 'repo');
    const calls = (fs.writeFile as any).mock.calls.map((c: any) => c[0]);
    expect(calls.some((p: string) => p.includes('deployments'))).toBe(true);
    expect(calls.some((p: string) => p.includes('deployment-statuses'))).toBe(true);
  });
});
