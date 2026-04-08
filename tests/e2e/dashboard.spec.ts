import { test, expect } from '@playwright/test';

const DASHBOARD_URL = '/d/dora-metrics-dashboard/dora-metrics-dashboard?orgId=1&from=now-90d&to=now';

test.describe('DORA Metrics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard and wait for panels to load
    await page.goto(DASHBOARD_URL);
    // Wait for Grafana to finish loading (use .first() to avoid strict mode violation when
    // multiple elements match [class*="dashboard"] in Grafana 10+)
    await expect(page.locator('.dashboard-container, [class*="dashboard"]').first()).toBeVisible({ timeout: 30_000 });
    // Wait for panel data queries to complete
    await page.waitForLoadState('networkidle');
  });

  test('dashboard loads successfully', async ({ page }) => {
    // Verify the dashboard title is visible.
    // In Grafana 10+, the title is shown in the breadcrumb nav, not in an h1.
    // Checking the page/tab title is the most reliable cross-version approach.
    await expect(page).toHaveTitle(/DORA Metrics Dashboard/, { timeout: 15_000 });
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

      await expect(panel, `Panel "${panelTitle}" should be visible`).toBeVisible({ timeout: 10_000 });
      // Stat panels should contain a numeric value (digits, decimal point, or %)
      const panelText = await panel.innerText();
      const hasValue = /\d/.test(panelText);
      expect(hasValue, `Panel "${panelTitle}" should display a numeric value, got: ${panelText}`).toBe(true);
    }
  });

  test('table panels display rows of data', async ({ page }) => {
    // Table panels sit at grid row y=63 out of 96 total rows (~65% down the page).
    // Scrolling to 100% overshoots and leaves the table panels above the viewport.
    const TABLE_PANELS_SCROLL_PCT = 0.65;

    await page.evaluate((pct) => {
      const scrollContainer = document.querySelector('.scrollbar-view') ?? document.documentElement;
      scrollContainer.scrollTop = scrollContainer.scrollHeight * pct;
    }, TABLE_PANELS_SCROLL_PCT);
    // Wait for any lazy-loaded panel queries to complete after scrolling
    await page.waitForLoadState('networkidle');

    const tablePanels = ['🚀 Recent Deployments', '📄 Recent PRs'];

    for (const panelTitle of tablePanels) {
      const panel = page.locator(`[data-panelid], [class*="panel"]`).filter({ hasText: panelTitle }).first();

      await expect(panel, `Table panel "${panelTitle}" should be visible`).toBeVisible({ timeout: 10_000 });
      // Table panels should have at least one data row.
      // Grafana 10+ renders tables as a grid (role="grid") with rows (role="row")
      // containing cells (role="gridcell"), not as traditional <table> elements.
      const rows = panel.locator('table tbody tr, [role="row"]:has([role="gridcell"])');
      const rowCount = await rows.count();
      expect(rowCount, `Table "${panelTitle}" should have data rows`).toBeGreaterThan(0);
    }
  });

  test('trend panels render chart elements', async ({ page }) => {
    const trendPanels = [
      '📈 Change Lead Time Trend',
      '📈 Deployment Frequency Trend',
    ];

    for (const panelTitle of trendPanels) {
      const panel = page.locator(`[data-panelid], [class*="panel"]`).filter({ hasText: panelTitle }).first();

      await expect(panel, `Panel "${panelTitle}" should be visible`).toBeVisible({ timeout: 10_000 });
      // Chart panels should contain canvas or SVG elements for rendering
      const chartElement = panel.locator('canvas, svg, [class*="graph"], [class*="chart"]');
      const chartCount = await chartElement.count();
      expect(chartCount, `Panel "${panelTitle}" should contain chart elements`).toBeGreaterThan(0);
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

      await expect(panel, `Panel "${panelTitle}" should be visible`).toBeVisible({ timeout: 10_000 });
      const panelText = await panel.innerText();
      // Panel should not be completely empty (should have some rendered content beyond the title)
      expect(panelText.length, `Panel "${panelTitle}" should have rendered content`).toBeGreaterThan(panelTitle.length);
    }
  });
});
