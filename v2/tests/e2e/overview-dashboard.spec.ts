import { test, expect } from '@playwright/test';
import { waitForPanels, scrollDashboard, findPanel } from './helpers';

const OVERVIEW_URL = '/d/overview/engineering-overview?orgId=1&from=now-28d&to=now';

test.describe('Overview Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(OVERVIEW_URL);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
    await waitForPanels(page);
  });

  test('page title includes Engineering Overview', async ({ page }) => {
    await expect(page).toHaveTitle(/Engineering Overview/i, { timeout: 15_000 });
  });

  test('all panels render — no-data count is 0', async ({ page }) => {
    await scrollDashboard(page);
    const noData = page.locator('[data-testid="no-data-message"], .panel-empty, [class*="noData"]');
    expect(await noData.count()).toBe(0);
  });

  test('key stat panels display numeric values', async ({ page }) => {
    const panels = [
      'Deployment Frequency',
      'Lead Time (median hours)',
      'Change Fail Rate',
      'Active Copilot Seats',
      'Acceptance Rate (%)',
      'Lines Accepted (28d)',
    ];
    // MTTR only has data when there's a recovery deployment after a failure
    const softPanels = ['MTTR (median)'];
    for (const title of panels) {
      const panel = findPanel(page, title);
      await panel.scrollIntoViewIfNeeded();
      await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
      const text = await panel.innerText();
      expect(/\d/.test(text), `"${title}" should show a number, got: ${text}`).toBe(true);
    }
    for (const title of softPanels) {
      const panel = findPanel(page, title);
      await panel.scrollIntoViewIfNeeded();
      await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
    }
  });
});

