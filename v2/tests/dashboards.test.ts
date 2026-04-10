import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dashboardDir = join(__dirname, '..', 'grafana', 'dashboards');

const ALL_DASHBOARDS = [
  '00-overview.json',
  '01-deployment-frequency.json',
  '02-lead-time.json',
  '03-change-failure-rate.json',
  '04-mean-time-to-recovery.json',
  '05-copilot-adoption.json',
  '06-copilot-code-impact.json',
  '07-dora-vs-copilot.json',
];

const DORA_PILLAR_DASHBOARDS = ALL_DASHBOARDS.slice(1, 5);
const COPILOT_DASHBOARDS = ALL_DASHBOARDS.slice(5);

function loadDashboard(filename: string): any {
  const content = readFileSync(join(dashboardDir, filename), 'utf-8');
  return JSON.parse(content);
}

describe('dashboard files exist', () => {
  it('all 8 dashboard files are present', () => {
    const existing = readdirSync(dashboardDir);
    for (const filename of ALL_DASHBOARDS) {
      expect(existing).toContain(filename);
    }
  });
});

describe.each(ALL_DASHBOARDS)('%s — common structure', (filename) => {
  let dashboard: any;

  it('is valid JSON', () => {
    expect(() => { dashboard = loadDashboard(filename); }).not.toThrow();
  });

  it('has a non-empty uid', () => {
    dashboard = loadDashboard(filename);
    expect(dashboard.uid).toBeTruthy();
  });

  it('has a non-empty title', () => {
    dashboard = loadDashboard(filename);
    expect(dashboard.title).toBeTruthy();
  });

  it('has at least one panel', () => {
    dashboard = loadDashboard(filename);
    expect(dashboard.panels.length).toBeGreaterThan(0);
  });

  it('first panel is the data source banner (stat panel querying data_mode)', () => {
    dashboard = loadDashboard(filename);
    const banner = dashboard.panels[0];
    expect(banner.type).toBe('stat');
    expect(banner.title).toBe('Data Source');
    const sql = banner.targets?.[0]?.rawSql ?? '';
    expect(sql).toContain('data_mode');
  });

  it('second panel is the last synced stat panel', () => {
    dashboard = loadDashboard(filename);
    const panel = dashboard.panels[1];
    expect(panel.type).toBe('stat');
    expect(panel.title).toBe('Last Synced');
    const sql = panel.targets?.[0]?.rawSql ?? '';
    expect(sql).toContain('sync_jobs');
  });

  it('all panels have non-empty descriptions', () => {
    dashboard = loadDashboard(filename);
    for (const panel of dashboard.panels) {
      expect(panel.description, `panel "${panel.title}" has empty description`).toBeTruthy();
    }
  });

  it('panel IDs are unique within the dashboard', () => {
    dashboard = loadDashboard(filename);
    const ids = dashboard.panels.map((p: any) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('at least one panel has a rawSql target', () => {
    dashboard = loadDashboard(filename);
    const hasSql = dashboard.panels.some((p: any) =>
      Array.isArray(p.targets) && p.targets.some((t: any) => t.rawSql)
    );
    expect(hasSql).toBe(true);
  });
});

describe('DORA pillar dashboards', () => {
  it.each(DORA_PILLAR_DASHBOARDS)('%s has dora tag', (filename) => {
    const d = loadDashboard(filename);
    expect(d.tags).toContain('dora');
  });

  it.each(DORA_PILLAR_DASHBOARDS)('%s has environment template variable', (filename) => {
    const d = loadDashboard(filename);
    const vars = d.templating?.list ?? [];
    const envVar = vars.find((v: any) => v.name === 'environment');
    expect(envVar, `${filename} missing $environment template variable`).toBeTruthy();
  });
});

describe('Copilot dashboards', () => {
  it.each(COPILOT_DASHBOARDS)('%s has copilot tag', (filename) => {
    const d = loadDashboard(filename);
    expect(d.tags).toContain('copilot');
  });
});

describe('cross-dashboard uniqueness', () => {
  it('all UIDs are unique across all 8 dashboards', () => {
    const uids = ALL_DASHBOARDS.map(f => loadDashboard(f).uid);
    const unique = new Set(uids);
    expect(unique.size).toBe(uids.length);
  });
});
