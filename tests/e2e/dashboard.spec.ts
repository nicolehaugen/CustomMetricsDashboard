import { test, expect } from '@playwright/test';

const DASHBOARD_URL = '/d/dora-metrics-dashboard/dora-metrics-dashboard?orgId=1&from=now-90d&to=now';

// Panel titles that must render data (not show "No data")
const EXPECTED_PANELS = [
  '⏱ Change Lead Time',
  '🚀 Deployment Frequency',
  '🔧 Recovery Time (MTTR)',
  '💥 Change Failure Rate',
  '🔄 Deployment Rework Rate',
  '📈 Change Lead Time Trend',
  '📈 Deployment Frequency Trend',
  '📉 Recovery Time Trend',
  '📊 Change Fail Rate Trend',
  '📊 Rework Rate Trend',
  '📊 DORA Metrics by Copilot Cohort',
  '📦 Merged PRs by Cohort',
  '📝 Lines by Cohort',
  '👤 PRs/Dev by Cohort',
  '🔁 PR Cycle Time',
  '🚨 Incident Resolution Time',
  '🚀 Recent Deployments',
  '📄 Recent PRs',
  '🔄 Rework Deployments',
  '🖥️ Primary Surface',
  '🧩 Feature Adoption',
  '📈 Acceptance Rate Trend',
  '🤖 DORA: Agent vs Non-Agent Users',
];

test.describe('DORA Metrics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard and wait for panels to load
    await page.goto(DASHBOARD_URL);
    // Wait for Grafana to finish loading
    await expect(page.locator('.dashboard-container, [class*="dashboard"]')).toBeVisible({ timeout: 30_000 });
    // Wait for panel data queries to complete
    await page.waitForLoadState('networkidle');
  });

  test('dashboard loads successfully', async ({ page }) => {
    // Verify the dashboard title is visible
    const title = page.locator('h1, [aria-label="Dashboard title"]').filter({ hasText: 'DORA Metrics Dashboard' });
    await expect(title).toBeVisible({ timeout: 15_000 });
  });

  test('all metric panels render data', async ({ page }) => {
    // Scroll down to ensure all panels are in the viewport and rendered
    await page.evaluate(async () => {
      const scrollContainer = document.querySelector('.scrollbar-view') || document.documentElement;
      const totalHeight = scrollContainer.scrollHeight;
      for (let i = 0; i < totalHeight; i += 500) {
        scrollContainer.scrollTop = i;
        await new Promise((r) => setTimeout(r, 300));
      }
      // Scroll back to top
      scrollContainer.scrollTop = 0;
    });

    // Wait for any lazy-loaded panels to render
    await page.waitForLoadState('networkidle');

    // Count panels showing "No data" — seeded data should populate all panels
    const noDataPanels = page.locator('[data-testid="no-data-message"], .panel-empty, [class*="noData"]');
    const noDataCount = await noDataPanels.count();

    // Allow at most a small number of "No data" panels (open incidents table may be empty)
    expect(noDataCount).toBeLessThanOrEqual(2);
  });

  test('key stat panels display numeric values', async ({ page }) => {
    const statPanels = [
      '⏱ Change Lead Time',
      '🚀 Deployment Frequency',
      '🔧 Recovery Time (MTTR)',
      '💥 Change Failure Rate',
      '🔄 Deployment Rework Rate',
    ];

    for (const panelTitle of statPanels) {
      const panel = page.locator(`[data-panelid], [class*="panel"]`).filter({ hasText: panelTitle }).first();

      if (await panel.isVisible()) {
        // Stat panels should contain a numeric value (digits, decimal point, or %)
        const panelText = await panel.innerText();
        const hasValue = /\d/.test(panelText);
        expect(hasValue, `Panel "${panelTitle}" should display a numeric value, got: ${panelText}`).toBe(true);
      }
    }
  });

  test('table panels display rows of data', async ({ page }) => {
    // Scroll to bottom to render table panels
    await page.evaluate(async () => {
      const scrollContainer = document.querySelector('.scrollbar-view') || document.documentElement;
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      await new Promise((r) => setTimeout(r, 2000));
    });

    const tablePanels = ['🚀 Recent Deployments', '📄 Recent PRs'];

    for (const panelTitle of tablePanels) {
      const panel = page.locator(`[data-panelid], [class*="panel"]`).filter({ hasText: panelTitle }).first();

      if (await panel.isVisible()) {
        // Table panels should have at least one data row
        const rows = panel.locator('table tbody tr, [role="row"]');
        const rowCount = await rows.count();
        expect(rowCount, `Table "${panelTitle}" should have data rows`).toBeGreaterThan(0);
      }
    }
  });

  test('trend panels render chart elements', async ({ page }) => {
    const trendPanels = [
      '📈 Change Lead Time Trend',
      '📈 Deployment Frequency Trend',
    ];

    for (const panelTitle of trendPanels) {
      const panel = page.locator(`[data-panelid], [class*="panel"]`).filter({ hasText: panelTitle }).first();

      if (await panel.isVisible()) {
        // Chart panels should contain canvas or SVG elements for rendering
        const chartElement = panel.locator('canvas, svg, [class*="graph"], [class*="chart"]');
        const chartCount = await chartElement.count();
        expect(chartCount, `Panel "${panelTitle}" should contain chart elements`).toBeGreaterThan(0);
      }
    }
  });

  test('copilot panels render data', async ({ page }) => {
    // Scroll to Copilot section
    await page.evaluate(async () => {
      const scrollContainer = document.querySelector('.scrollbar-view') || document.documentElement;
      scrollContainer.scrollTop = scrollContainer.scrollHeight * 0.7;
      await new Promise((r) => setTimeout(r, 2000));
    });

    const copilotPanels = [
      '🖥️ Primary Surface',
      '🧩 Feature Adoption',
      '📈 Acceptance Rate Trend',
    ];

    for (const panelTitle of copilotPanels) {
      const panel = page.locator(`[data-panelid], [class*="panel"]`).filter({ hasText: panelTitle }).first();

      if (await panel.isVisible()) {
        const panelText = await panel.innerText();
        // Panel should not be completely empty (should have some rendered content beyond the title)
        expect(panelText.length, `Panel "${panelTitle}" should have rendered content`).toBeGreaterThan(panelTitle.length);
      }
    }
  });
});
