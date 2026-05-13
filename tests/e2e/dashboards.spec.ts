import { test, expect, type Page } from '@playwright/test';

const DASHBOARDS = [
  { name: 'Overview', uid: 'overview' },
  { name: 'Copilot Adoption', uid: 'edu-copilot-adoption' },
  { name: 'Per-User Copilot', uid: 'edu-per-user-copilot' },
  { name: 'Enterprise Copilot Leading Indicators', uid: 'edu-enterprise-leading' },
  { name: 'Organization Copilot Leading Indicators', uid: 'edu-organization-leading' },
  { name: 'Enterprise Lagging Indicators', uid: 'edu-enterprise-lagging' },
];

async function login(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('load');
  await page.fill('[name="user"]', 'admin');
  await page.fill('[name="password"]', 'admin');
  await page.click('[type="submit"]');
  await page.waitForLoadState('load');
  await page.waitForTimeout(1000);
  await expect(page).not.toHaveURL(/\/login/i);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

for (const dashboard of DASHBOARDS) {
  test(`${dashboard.name} dashboard renders`, async ({ page }) => {
    const response = await page.goto(`/d/${dashboard.uid}?orgId=1`);
    expect(response?.ok()).toBeTruthy();

    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    const title = await page.title();
    expect(title.trim().length).toBeGreaterThan(0);
    expect(title).not.toMatch(/error|not found/i);

    const panels = page.locator('[data-panelid]');
    await expect(panels.first()).toBeVisible();
    expect(await panels.count()).toBeGreaterThan(0);
  });
}
