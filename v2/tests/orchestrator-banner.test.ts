import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config', () => ({
  config: {
    github: { org: 'testorg', repo: 'testrepo', enterprise: null },
    dataMode: 'live',
    dataSourceLabel: '',
    dataSourceUrl: null,
  },
}));
vi.mock('../src/github/pull-requests', () => ({ fetchPullRequests: vi.fn(() => Promise.resolve([])) }));
vi.mock('../src/github/deployments', () => ({ fetchDeployments: vi.fn(() => Promise.resolve({ deployments: [], statuses: [] })) }));
vi.mock('../src/github/issues', () => ({ fetchIssues: vi.fn(() => Promise.resolve([])) }));
vi.mock('../src/github/workflow-runs', () => ({ fetchWorkflowRuns: vi.fn(() => Promise.resolve([])) }));
vi.mock('../src/github/copilot-org-metrics', () => ({ fetchCopilotOrgMetrics: vi.fn(() => Promise.resolve([])) }));
vi.mock('../src/github/copilot-user-metrics', () => ({ fetchCopilotUserMetrics: vi.fn(() => Promise.resolve([])) }));
vi.mock('../src/github/copilot-seats', () => ({ fetchCopilotSeats: vi.fn(() => Promise.resolve([])) }));
vi.mock('../src/sync/schema-check', () => ({ assertSchemaMatch: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/sync/state', () => ({
  getLastSyncedAt: vi.fn(() => Promise.resolve(null)),
  updateSyncState: vi.fn(() => Promise.resolve()),
}));
vi.mock('../src/sync/bridge-resolver', () => ({ resolveBridge: vi.fn(() => Promise.resolve(0)) }));

import { config } from '../src/config';
import { runSync } from '../src/sync/orchestrator';

const mockPool = { query: vi.fn() };

function getDataModeInsertCall() {
  return mockPool.query.mock.calls.find(([sql]: any[]) =>
    typeof sql === 'string' && sql.includes('INSERT INTO data_mode')
  );
}

describe('orchestrator banner — source_label fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.query.mockResolvedValue({ rows: [{ id: 1 }] });
    // Reset to defaults
    (config as any).dataSourceLabel = '';
    (config as any).dataMode = 'live';
  });

  it('uses org/repo as source_label when DATA_SOURCE_LABEL is empty', async () => {
    (config as any).dataSourceLabel = '';
    await runSync(mockPool as any, {} as any);

    const call = getDataModeInsertCall();
    expect(call).toBeDefined();
    // params: [mode, source_label, source_url]
    expect(call![1][1]).toBe('testorg/testrepo');
  });

  it('preserves explicit DATA_SOURCE_LABEL when set', async () => {
    (config as any).dataSourceLabel = 'octodemo/bootstrap';
    await runSync(mockPool as any, {} as any);

    const call = getDataModeInsertCall();
    expect(call).toBeDefined();
    expect(call![1][1]).toBe('octodemo/bootstrap');
  });

  it('passes the configured data mode to data_mode table', async () => {
    (config as any).dataMode = 'seed';
    await runSync(mockPool as any, {} as any);

    const call = getDataModeInsertCall();
    expect(call).toBeDefined();
    expect(call![1][0]).toBe('seed');
  });
});

