import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

test('overview data source banner uses live/not-synced color mappings', async () => {
  const dashboardPath = join(process.cwd(), 'grafana', 'dashboards', '01-overview.json');
  const dashboard = JSON.parse(readFileSync(dashboardPath, 'utf8'));
  const panel = dashboard.panels.find((p: { id: number }) => p.id === 10);

  expect(panel).toBeTruthy();
  expect(panel.fieldConfig.defaults.color.mode).toBe('thresholds');
  expect(panel.fieldConfig.defaults.thresholds.steps[0].color).toBe('dark-red');
  expect(panel.fieldConfig.defaults.mappings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'regex',
        options: expect.objectContaining({
          pattern: '^Live: [^/]+/[^/]+$',
          result: expect.objectContaining({ color: '#73BF69' }),
        }),
      }),
      expect.objectContaining({
        type: 'regex',
        options: expect.objectContaining({
          pattern: '^Not yet synced$',
          result: expect.objectContaining({ color: '#FF9830' }),
        }),
      }),
    ]),
  );
});
