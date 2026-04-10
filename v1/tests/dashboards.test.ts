import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardDir = join(currentDir, '..', 'grafana', 'dashboards');

function loadDashboard(filename: string) {
  const content = readFileSync(join(dashboardDir, filename), 'utf-8');
  return JSON.parse(content);
}

const pillarDashboards = [
  'deployment-frequency.json',
  'lead-time-for-changes.json',
  'change-failure-rate.json',
  'mean-time-to-recovery.json',
];

const copilotImpactDashboard = 'copilot-impact-overview.json';

describe('DORA pillar dashboards', () => {
  it('all expected dashboard files exist', () => {
    const files = readdirSync(dashboardDir);
    for (const f of [...pillarDashboards, copilotImpactDashboard]) {
      expect(files).toContain(f);
    }
  });

  describe.each(pillarDashboards)('%s', (filename) => {
    const dashboard = loadDashboard(filename);

    it('has a unique uid', () => {
      expect(dashboard.uid).toBeTruthy();
      expect(typeof dashboard.uid).toBe('string');
    });

    it('has a DORA-prefixed title', () => {
      expect(dashboard.title).toMatch(/^DORA:/);
    });

    it('has a dora tag', () => {
      expect(dashboard.tags).toContain('dora');
    });

    it('has a description', () => {
      expect(dashboard.description).toBeTruthy();
      expect(dashboard.description.length).toBeGreaterThan(20);
    });

    it('has a text panel as the first panel with supplementary info', () => {
      const firstPanel = dashboard.panels[0];
      expect(firstPanel.type).toBe('text');
      expect(firstPanel.options.mode).toBe('markdown');
      const content = firstPanel.options.content;
      expect(content.length).toBeGreaterThan(100);
    });

    it('has templating variables', () => {
      const vars = dashboard.templating.list.map((v: { name: string }) => v.name);
      expect(vars).toContain('environment');
    });

    it('has panels with unique ids', () => {
      const ids = dashboard.panels.map((p: { id: number }) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('has at least one data panel with a SQL query', () => {
      const dataPanels = dashboard.panels.filter(
        (p: { targets?: { rawSql?: string }[] }) =>
          p.targets && p.targets.length > 0 && p.targets[0].rawSql
      );
      expect(dataPanels.length).toBeGreaterThan(0);
    });
  });

  describe('copilot-impact-overview.json (Miscellaneous)', () => {
    const dashboard = loadDashboard(copilotImpactDashboard);

    it('has a unique uid', () => {
      expect(dashboard.uid).toBe('copilot-impact-overview');
    });

    it('has a title', () => {
      expect(dashboard.title).toBeTruthy();
    });

    it('has miscellaneous tag', () => {
      expect(dashboard.tags).toContain('miscellaneous');
    });

    it('has a text panel as the first panel', () => {
      const firstPanel = dashboard.panels[0];
      expect(firstPanel.type).toBe('text');
      expect(firstPanel.options.mode).toBe('markdown');
    });

    it('contains copilot-related panels', () => {
      const titles = dashboard.panels
        .map((p: { title: string }) => p.title)
        .filter((t: string) => t);
      const copilotRelated = titles.some(
        (t: string) => t.toLowerCase().includes('copilot') || t.toLowerCase().includes('adoption')
      );
      expect(copilotRelated).toBe(true);
    });

    it('has panels with unique ids', () => {
      const ids = dashboard.panels.map((p: { id: number }) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('all dashboards have unique uids', () => {
    it('no uid collisions across dashboards', () => {
      const allFiles = [...pillarDashboards, copilotImpactDashboard, 'dora-metrics.json'];
      const uids = allFiles.map((f) => loadDashboard(f).uid);
      expect(new Set(uids).size).toBe(uids.length);
    });
  });

  describe('panel coverage', () => {
    it('pillar dashboards cover all four DORA pillars', () => {
      const titles = pillarDashboards.map((f) => loadDashboard(f).title);
      expect(titles.some((t: string) => t.includes('Deployment Frequency'))).toBe(true);
      expect(titles.some((t: string) => t.includes('Lead Time'))).toBe(true);
      expect(titles.some((t: string) => t.includes('Change Failure Rate'))).toBe(true);
      expect(titles.some((t: string) => t.includes('Recovery'))).toBe(true);
    });
  });
});
