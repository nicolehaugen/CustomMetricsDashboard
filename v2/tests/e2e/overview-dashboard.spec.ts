import { test, expect } from '@playwright/test';

const OVERVIEW_URL = '/d/overview/engineering-overview?orgId=1&from=now-28d&to=now';

async function waitForPanels(page: any) {
  await page.waitForTimeout(3000); // let panel SQL queries complete
}

async function scrollDashboard(page: any) {
  await page.evaluate(async () => {
    const el = document.querySelector('.scrollbar-view') || document.documentElement;
    el.scrollTop = el.scrollHeight / 2;
    await new Promise(r => setTimeout(r, 500));
    el.scrollTop = el.scrollHeight;
    await new Promise(r => setTimeout(r, 500));
    el.scrollTop = 0;
  });
  await page.waitForTimeout(2000);
}

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
    const softPanels = ['MTTR (median hours)'];
    for (const title of panels) {
      const panel = page.locator('[data-panelid], [class*="panel"]').filter({ hasText: title }).first();
      await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
      const text = await panel.innerText();
      expect(/\d/.test(text), `"${title}" should show a number, got: ${text}`).toBe(true);
    }
    for (const title of softPanels) {
      const panel = page.locator('[data-panelid], [class*="panel"]').filter({ hasText: title }).first();
      await expect(panel, `"${title}" should be visible`).toBeVisible({ timeout: 15_000 });
    }
  });
});

