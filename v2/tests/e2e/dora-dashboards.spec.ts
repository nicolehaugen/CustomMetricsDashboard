import { test, expect } from '@playwright/test';
import { waitForPanels, scrollDashboard, findPanel } from './helpers';

const DORA_DASHBOARDS: {
  uid: string;
  slug: string;
  title: RegExp;
  stats: string[];
  softStats?: string[];
  charts: string[];
  tables: string[];
}[] = [
  {
    uid: 'deploy-freq',
    slug: 'deployment-frequency',
    title: /Deployment Frequency/i,
    stats: ['Deployment Frequency', 'Deployment Success Rate'],
    charts: ['Deployments per Week', 'Failed Deployments Timeline'],
    tables: ['Recent Deployments'],
  },
  {
    uid: 'lead-time',
    slug: 'lead-time',
    title: /Lead Time/i,
    stats: ['Change Lead Time (median hours)', 'P90 Lead Time (hours)'],
    charts: ['Change Lead Time over Time'],
    tables: ['Slowest PRs by Lead Time'],
  },
  {
    uid: 'change-fail',
    slug: 'change-failure-rate',
    title: /Change Fail/i,
    stats: ['Change Fail Rate (%)', 'Deployment Rework Rate (%)'],
    charts: ['Change Fail Rate over Time'],
    tables: ['Open Incidents'],
  },
  {
    uid: 'mttr',
    slug: 'mean-time-to-recovery',
    title: /Recovery/i,
    // MTTR requires a recovery deployment after a failure; may be empty if last deployment was a failure
    stats: ['Incidents Still Open'],
    softStats: ['MTTR (median)', 'P90 MTTR (hours)'],
    charts: ['MTTR over Time'],
    tables: ['Recent Failures with Recovery Time'],
  },
];

for (const dash of DORA_DASHBOARDS) {
  test.describe(`DORA: ${dash.uid}`, () => {
    const URL = `/d/${dash.uid}/?orgId=1&from=now-28d&to=now`;

    test.beforeEach(async ({ page }) => {
      await page.goto(URL);
      await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
      await waitForPanels(page);
    });

    test('page title matches', async ({ page }) => {
      await expect(page).toHaveTitle(dash.title, { timeout: 15_000 });
    });

    test('no-data panels count is at most 1', async ({ page }) => {
      await scrollDashboard(page);
      const noData = page.locator('[data-testid="no-data-message"], .panel-empty, [class*="noData"]');
      expect(await noData.count()).toBeLessThanOrEqual(1);
    });

    test('stat panels show numeric values', async ({ page }) => {
      for (const title of dash.stats) {
        const panel = findPanel(page, title);
        await panel.scrollIntoViewIfNeeded();
        await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
        const text = await panel.innerText();
        expect(/\d/.test(text), `"${title}" should show a number`).toBe(true);
      }
      // softStats: panels that may have no data in some scenarios (e.g., MTTR when no recovery deployment exists)
      for (const title of (dash.softStats ?? [])) {
        const panel = findPanel(page, title);
        await panel.scrollIntoViewIfNeeded();
        await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
      }
    });

    test('chart panels contain canvas or SVG', async ({ page }) => {
      // Scroll through the full page to trigger rendering of panels below the fold
      await scrollDashboard(page);
      for (const title of dash.charts) {
        const panel = findPanel(page, title);
        await panel.scrollIntoViewIfNeeded();
        await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
        const chart = panel.locator('canvas, svg, [class*="uplot"], [class*="graph"], [class*="chart"]');
        expect(await chart.count(), `"${title}" should render a chart`).toBeGreaterThan(0);
      }
    });

    test('table panels contain data rows', async ({ page }) => {
      await scrollDashboard(page);
      for (const title of dash.tables) {
        const panel = findPanel(page, title);
        await panel.scrollIntoViewIfNeeded();
        await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
        const rows = panel.locator('table tbody tr, [role="row"]:has([role="cell"])');
        // Open Incidents may legitimately be empty; others must have rows
        if (title !== 'Open Incidents') {
          expect(await rows.count(), `"${title}" should have rows`).toBeGreaterThan(0);
        }
      }
    });
  });
}

