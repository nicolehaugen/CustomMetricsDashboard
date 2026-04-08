import { describe, it, expect } from 'vitest';
import { generateAllData } from '../seed/generator';

describe('seed generator', () => {
  const data = generateAllData();

  it('generates the configured number of users', () => {
    expect(data.users.length).toBe(18);
  });

  it('generates pull requests with valid fields', () => {
    expect(data.pullRequests.length).toBe(120);
    for (const pr of data.pullRequests) {
      expect(pr.number).toBeGreaterThan(0);
      expect(pr.state).toBeDefined();
      expect(pr.created_at).toBeInstanceOf(Date);
    }
  });

  it('generates deployments linked to PRs', () => {
    expect(data.deployments.length).toBeGreaterThan(0);
    expect(data.deploymentPullRequests.length).toBeGreaterThan(0);
  });

  it('generates ~15% failed deployments', () => {
    const failedStatuses = data.deploymentStatuses.filter(
      (s) => s.state === 'failure' || s.state === 'error',
    );
    const totalDeployments = data.deployments.length;
    const failRate = failedStatuses.length / totalDeployments;
    expect(failRate).toBeGreaterThan(0.05);
    expect(failRate).toBeLessThan(0.35);
  });

  it('generates copilot activity with ~70% active ratio', () => {
    expect(data.copilotUserActivity.length).toBeGreaterThan(0);
    const activeCount = data.copilotUserActivity.filter((a) => a.is_active).length;
    const ratio = activeCount / data.copilotUserActivity.length;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(0.9);
  });

  it('generates issues including incidents', () => {
    expect(data.issues.length).toBeGreaterThan(0);
    const incidents = data.issues.filter((i) =>
      i.labels && i.labels.some((l) => l.name === 'incident'),
    );
    expect(incidents.length).toBeGreaterThan(0);
  });

  it('generates code scanning alerts', () => {
    expect(data.codeScanningAlerts.length).toBeGreaterThan(0);
  });

  it('generates workflow runs', () => {
    expect(data.workflowRuns.length).toBeGreaterThan(0);
  });

  it('has rework PRs (hotfix/bugfix/rollback labels)', () => {
    const reworkPRs = data.pullRequests.filter((pr) =>
      pr.labels && pr.labels.some((l) => ['hotfix', 'bugfix', 'rollback'].includes(l.name)),
    );
    expect(reworkPRs.length).toBeGreaterThan(0);
  });
});
