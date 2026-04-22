import { test, expect } from '@playwright/test';

const DASHBOARDS = [
  { name: 'Overview', uid: 'v3-overview' },
  { name: 'Deployment Frequency', uid: 'edu-deployment-frequency' },
  { name: 'Lead Time', uid: 'edu-lead-time' },
  { name: 'Change Failure Rate', uid: 'edu-change-failure-rate' },
  { name: 'MTTR', uid: 'edu-mean-time-to-recovery' },
  { name: 'Copilot Adoption', uid: 'edu-copilot-adoption' },
  { name: 'Copilot Code Impact', uid: 'edu-copilot-code-impact' },
  { name: 'DORA vs Copilot', uid: 'edu-dora-vs-copilot' },
  { name: 'Per-User Copilot', uid: 'edu-per-user-copilot' },
];

// Login once and reuse session
test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3006/login');
  await page.waitForLoadState('load');
  await page.fill('[name="user"]', 'admin');
  await page.fill('[name="password"]', 'admin');
  await page.click('[type="submit"]');
  await page.waitForLoadState('load');
  await page.waitForTimeout(1000);
});

for (const dashboard of DASHBOARDS) {
  test(`${dashboard.name} dashboard loads data`, async ({ page }) => {
    await page.goto(`http://localhost:3006/d/${dashboard.uid}?orgId=1`);
    await page.waitForLoadState('load');
    await page.waitForTimeout(6000);

    // Dashboard should load without crashing
    await expect(page).not.toHaveTitle(/Error/);
    await expect(page).not.toHaveTitle(/Not found/);

    // At least one panel should not show "No data"
    const noDataPanels = await page.locator('text=No data').count();
    const totalPanels = await page.locator('[data-panelid]').count();

    // Either we have data in some panels, or no panels errored
    if (totalPanels > 0) {
      expect(noDataPanels).toBeLessThan(totalPanels);
    }

    // Overview dashboard: check sync job data exists
    if (dashboard.uid === 'v3-overview') {
      const successCount = await page.locator('text=success').count();
      const cellCount = await page.locator('[role="cell"]').count();
      expect(successCount + cellCount).toBeGreaterThan(0);
    }
  });
}
