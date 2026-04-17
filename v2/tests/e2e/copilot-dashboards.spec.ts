import { test, expect } from '@playwright/test';
import { waitForPanels, scrollDashboard, findPanel } from './helpers';

const COPILOT_DASHBOARDS = [
  {
    uid: 'copilot-adopt',
    title: /Copilot Adoption/i,
    // These stats require copilot_seats API — may show "No data" if org has no Copilot license
    stats: [] as string[],
    softStats: ['Total Seats', 'Active Seats (28d)', 'Seat Utilization Rate (%)'],
    charts: ['Daily Active Users', 'Last Active Editor Distribution'],
    // Seat Activity Recency requires copilot_seats — skip row count check if no Copilot
    tables: [] as string[],
    softTables: ['Seat Activity Recency'],
  },
  {
    uid: 'copilot-impact',
    title: /Copilot Code Impact/i,
    // These stats require copilot_org_metrics/user_metrics — may show "No data" if org has no Copilot
    stats: [] as string[],
    softStats: ['Lines Accepted (28d)', 'Acceptance Rate (%)', 'Copilot-Attributed PRs'],
    charts: ['Lines Accepted vs Suggested over Time', 'Acceptance Rate Trend'],
    // "Top 10 by Lines Added" uses copilot_user_metrics — allow no rows
    tables: [] as string[],
    softTables: ['Top 10 by Lines Added (Copilot Users)'],
  },
  {
    uid: 'dora-copilot',
    title: /DORA.*Copilot|Copilot.*DORA/i,
    stats: [] as string[],
    softStats: [] as string[],
    charts: [
      'Change Lead Time: Copilot vs Non-Copilot',
      'Merged PRs by Cohort (weekly)',
    ],
    tables: [] as string[],
    softTables: [] as string[],
  },
  {
    uid: 'edu-per-user-copilot',
    title: /Per-User Copilot Metrics/i,
    stats: [] as string[],
    softStats: [
      'Total Interactions (28d)',
      'Code Generation Activities (28d)',
      'Code Acceptance Activities (28d)',
      'Active Days (28d)',
      'Lines Suggested (28d)',
      'Lines Accepted (28d)',
      'Acceptance Rate (%)',
    ],
    charts: ['Daily Activity Trend', 'Weekly PR Review Time Trend'],
    tables: [] as string[],
    softTables: ['Recent PRs Merged by This User'],
    url: '/d/edu-per-user-copilot/?orgId=1&from=now-28d&to=now&var-user_login=dev01',
  },
];

for (const dash of COPILOT_DASHBOARDS) {
  test.describe(`Copilot: ${dash.uid}`, () => {
    const URL = dash.url ?? `/d/${dash.uid}/?orgId=1&from=now-28d&to=now`;

    test.beforeEach(async ({ page }) => {
      await page.goto(URL);
      await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
      await waitForPanels(page);
    });

    test('page title matches', async ({ page }) => {
      await expect(page).toHaveTitle(dash.title, { timeout: 15_000 });
    });

    test('no-data panels count is at most 2', async ({ page }) => {
      await scrollDashboard(page);
      const noData = page.locator('[data-testid="no-data-message"], .panel-empty, [class*="noData"]');
      // Allow ≤2: copilot_user_metrics "Top 10" panel may be low-count
      expect(await noData.count()).toBeLessThanOrEqual(2);
    });

    test('stat panels show numeric values', async ({ page }) => {
      for (const title of dash.stats) {
        const panel = findPanel(page, title);
        await panel.scrollIntoViewIfNeeded();
        await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
        const text = await panel.innerText();
        expect(/\d/.test(text), `"${title}" should show a number, got: ${text}`).toBe(true);
      }
      // softStats: panels that require Copilot API data — only check visibility, not numeric value
      for (const title of (dash.softStats ?? [])) {
        const panel = findPanel(page, title);
        await panel.scrollIntoViewIfNeeded();
        await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
      }
    });

    test('chart panels contain canvas or SVG', async ({ page }) => {
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
      if (dash.tables.length === 0 && (dash.softTables ?? []).length === 0) return;
      await scrollDashboard(page);
      for (const title of dash.tables) {
        const panel = findPanel(page, title);
        await panel.scrollIntoViewIfNeeded();
        await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
        const rows = panel.locator('table tbody tr, [role="row"]:has([role="cell"])');
        expect(await rows.count(), `"${title}" should have rows`).toBeGreaterThan(0);
      }
      // softTables: require Copilot API data — only check visibility, not row count
      for (const title of (dash.softTables ?? [])) {
        const panel = findPanel(page, title);
        await panel.scrollIntoViewIfNeeded();
        await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
      }
    });
  });
}
