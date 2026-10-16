import { expect, test } from '@playwright/test';

test('island menu: keyboard open, Tab through links, Escape closes and restores focus', async ({ page }) => {
  await page.goto('/');
  const open = page.getByRole('button', { name: /open menu/ });
  await open.focus();
  // Visible 2px focus ring.
  const outline = await open.evaluate((el) => getComputedStyle(el).outlineWidth + ' ' + getComputedStyle(el).outlineStyle);
  expect(outline).toBe('2px solid');

  await page.keyboard.press('Enter');
  await expect(page.locator('#island-menu')).toBeVisible();
  await expect(page.getByRole('link', { name: 'What you can say' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'How it works', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#island-menu').getByRole('link', { name: 'Launch Dixi' })).toHaveAttribute('href', 'runic://open');

  await page.keyboard.press('Escape');
  await expect(page.locator('#island-menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /open menu/ })).toBeFocused();
});

test('Launch links only to runic://open (prefill, never a task)', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.locator('a', { hasText: 'Launch Dixi' }).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const h of hrefs) expect(h).toBe('runic://open');
});

for (const width of [320, 390, 1024, 1440]) {
  test(`no horizontal scroll, no layout shift at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => {
      (window as unknown as { cls: number }).cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
          if (!e.hadRecentInput) (window as unknown as { cls: number }).cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(800);
    const { sw, cw, cls } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      cls: (window as unknown as { cls: number }).cls,
    }));
    expect(sw).toBeLessThanOrEqual(cw);
    expect(cls).toBeLessThan(0.01);
  });
}

test('credits lists every image source', async ({ page }) => {
  await page.goto('/credits/');
  for (const id of ['Marble019', 'Onyx013']) {
    await expect(page.locator(`a[href*="${id}"]`)).toHaveCount(1);
  }
});
