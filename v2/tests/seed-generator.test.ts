import { describe, it, expect } from 'vitest';
import { generateSeedData } from '../seed/generator';
import { SEED_CONFIG } from '../seed/config';

const data = generateSeedData(SEED_CONFIG);

describe('seed generator', () => {
  it('generates the correct number of users', () => {
    expect(data.users.length).toBe(SEED_CONFIG.users);
  });

  it('generates unique user IDs', () => {
    const ids = new Set(data.users.map(u => u.id));
    expect(ids.size).toBe(data.users.length);
  });

  it('generates the correct number of pull requests', () => {
    expect(data.pullRequests.length).toBe(SEED_CONFIG.prs);
  });

  it('generates ~70% of PRs by copilot seat holders', () => {
    const seatIds = new Set(data.copilotSeats.map(s => s.assignee_id));
    const copilotPRs = data.pullRequests.filter(pr => seatIds.has(pr.user_id));
    const ratio = copilotPRs.length / data.pullRequests.length;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(0.9);
  });

  it('generates 28 rows of copilot org metrics', () => {
    expect(data.copilotOrgMetrics.length).toBe(28);
  });

  it('copilot org metrics have valid day values', () => {
    for (const row of data.copilotOrgMetrics) {
      expect(row.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.daily_active_users).toBeGreaterThan(0);
    }
  });

  it('copilot org metrics have loc_suggested >= loc_added', () => {
    for (const row of data.copilotOrgMetrics) {
      expect(row.loc_suggested_to_add_sum).toBeGreaterThanOrEqual(row.loc_added_sum);
    }
  });

  it('generates copilot seats with correct count', () => {
    expect(data.copilotSeats.length).toBe(SEED_CONFIG.copilotSeatCount);
  });

  it('copilot seats have valid assignee fields', () => {
    for (const seat of data.copilotSeats) {
      expect(seat.assignee_login).toBeTruthy();
      expect(seat.assignee_id).toBeGreaterThan(0);
      expect(seat.last_activity_at).toBeTruthy();
      expect(seat.last_activity_editor).toBeTruthy();
    }
  });

  it('PR user_ids are valid user IDs', () => {
    const userIds = new Set(data.users.map(u => u.id));
    for (const pr of data.pullRequests) {
      expect(userIds.has(pr.user_id)).toBe(true);
    }
  });

  it('copilot seat assignee_ids match copilot user IDs', () => {
    const seatIds = new Set(data.copilotSeats.map(s => s.assignee_id));
    const copilotUserIds = new Set(data.copilotUsers.map(u => u.id));
    for (const id of seatIds) {
      expect(copilotUserIds.has(id)).toBe(true);
    }
  });

  it('generates deployments', () => {
    expect(data.deployments.length).toBeGreaterThan(0);
  });

  it('deployment statuses reference valid deployment IDs', () => {
    const depIds = new Set(data.deployments.map(d => d.deployment_id));
    for (const s of data.deploymentStatuses) {
      expect(depIds.has(s.deployment_id)).toBe(true);
    }
  });

  it('generates incident-labeled issues', () => {
    const incidents = data.issues.filter(i =>
      Array.isArray(i.labels) && i.labels.some((l: any) => l.name === 'incident')
    );
    expect(incidents.length).toBeGreaterThan(0);
  });

  it('generates hotfix/bugfix/rollback PRs', () => {
    const rework = data.pullRequests.filter(pr =>
      Array.isArray(pr.labels) && pr.labels.some((l: any) =>
        ['hotfix', 'bugfix', 'rollback'].includes(l.name)
      )
    );
    expect(rework.length).toBeGreaterThan(0);
  });

  it('generates workflow runs', () => {
    expect(data.workflowRuns.length).toBeGreaterThan(100);
  });
});
