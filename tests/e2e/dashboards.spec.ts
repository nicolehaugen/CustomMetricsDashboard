import { test, expect } from '@playwright/test';

const DASHBOARDS = [
  { name: 'Overview', uid: 'overview' },
  { name: 'Copilot Adoption', uid: 'edu-copilot-adoption' },
  { name: 'Per-User Copilot', uid: 'edu-per-user-copilot' },
  { name: 'Enterprise Copilot Leading Indicators', uid: 'edu-enterprise-leading' },
  { name: 'Organization Copilot Leading Indicators', uid: 'edu-organization-leading' },
  { name: 'Enterprise Lagging Indicators', uid: 'edu-enterprise-lagging' },
];

for (const dashboard of DASHBOARDS) {
  test(`${dashboard.name} dashboard renders`, async ({ page }, testInfo) => {
    // Anonymous auth is enabled — navigate directly, no login needed
    const response = await page.goto(`/d/${dashboard.uid}?orgId=1&kiosk`);
    expect(response?.ok()).toBeTruthy();

    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    // Verify we're not redirected to login
    await expect(page).not.toHaveURL(/\/login/i, { timeout: 5000 });

    const title = await page.title();
    expect(title.trim().length).toBeGreaterThan(0);
    expect(title).not.toMatch(/error|not found/i);

    const panels = page.locator('[data-panelid]');
    await expect(panels.first()).toBeVisible();
    expect(await panels.count()).toBeGreaterThan(0);

    // Capture a screenshot of the rendered dashboard
    await testInfo.attach(`${dashboard.uid}-screenshot`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
}
