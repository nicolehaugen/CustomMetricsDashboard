import { Page } from '@playwright/test';

/**
 * Wait for Grafana panels to finish loading.
 * Waits for loading indicators to clear rather than using a fixed timeout.
 */
export async function waitForPanels(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-testid="panel-loading-bar"], [class*="loadingBar"], [class*="loadingIndicator"]'
        ).length === 0,
      { timeout: 15_000 }
    )
    .catch(() => {}); // ignore if spinner never appeared or already gone
  await page.waitForTimeout(500);
}

/**
 * Progressively scroll through the entire Grafana dashboard to trigger rendering
 * of panels below the fold, then return to the top.
 */
export async function scrollDashboard(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const el =
      document.querySelector<HTMLElement>('.scrollbar-view') ??
      document.documentElement;
    for (let pos = 0; pos <= el.scrollHeight; pos += 300) {
      el.scrollTop = pos;
      await new Promise((r) => setTimeout(r, 80));
    }
    el.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.waitForTimeout(500);
}

/**
 * Find a Grafana panel by its title.
 *
 * Uses `[data-panelid]` (present on every rendered Grafana panel) and anchors
 * the regex to the start of innerText so that text/markdown panels whose
 * *content* mentions the title are not accidentally matched.
 */
export function findPanel(page: Page, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page
    .locator('[data-panelid]')
    .filter({ hasText: new RegExp(`^\\s*${escaped}`) })
    .first();
}
