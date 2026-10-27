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
  await expect(page.locator('#island-menu').getByRole('link', { name: 'Join the waitlist' })).toHaveAttribute('href', '#waitlist');

  await page.keyboard.press('Escape');
  await expect(page.locator('#island-menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /open menu/ })).toBeFocused();
});

test('nothing launches the app: no dixi:// links, only the waitlist', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href^="dixi:"]')).toHaveCount(0);
});

test('waitlist: joins, then says already joined', async ({ page }) => {
  let body = '';
  let status = 201;
  await page.route('**/rest/v1/waitlist', (r) => ((body = r.request().postData() ?? ''), r.fulfill({ status })));
  await page.goto('/');
  await page.getByLabel('First name').fill(' Ana ');
  await page.getByLabel('Last name').fill('Lee');
  await page.getByLabel('Email').fill('  Ana@Example.com ');
  await page.getByLabel('Phone (optional)').fill('+1 555 123 4567');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you, Ana!' })).toBeFocused();
  await expect(page.getByText('You’re on the Dixi waitlist. Stay tuned for more updates.')).toBeVisible();
  expect(JSON.parse(body)).toEqual({ first_name: 'Ana', last_name: 'Lee', email: 'ana@example.com', phone: '+1 555 123 4567' });

  status = 409;
  await page.reload();
  await page.getByLabel('First name').fill('Ana');
  await page.getByLabel('Last name').fill('Lee');
  await page.getByLabel('Email').fill('ana@example.com');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByText('You’re already on the Dixi waitlist.')).toBeVisible();
  expect(JSON.parse(body).phone).toBeNull(); // left blank -> null, not ''
});

test('waitlist honeypot: a filled hidden field never reaches Supabase', async ({ page }) => {
  let sent = false;
  await page.route('**/rest/v1/waitlist', (r) => ((sent = true), r.fulfill({ status: 201 })));
  await page.goto('/');
  await page.getByLabel('First name').fill('Bot');
  await page.getByLabel('Last name').fill('Bot');
  await page.getByLabel('Email').fill('bot@example.com');
  await page.locator('input[name=company]').fill('spam inc', { force: true });
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you, Bot!' })).toBeVisible();
  expect(sent).toBe(false);
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

test('admin: signs in, lists the waitlist, CSV defuses formulas', async ({ page }) => {
  let auth = '';
  let login = '';
  await page.route((u) => u.pathname.endsWith('/auth/v1/token'), (r) => ((login = r.request().postData() ?? ''), r.fulfill({ json: { access_token: 't' } })));
  await page.route(
    (u) => u.pathname.endsWith('/rest/v1/waitlist'),
    (r) => ((auth = r.request().headers().authorization), r.fulfill({ json: [{ email: 'ana@example.com', first_name: '=HYPERLINK("x")', last_name: 'Lee', phone: null, created_at: new Date().toISOString() }] })),
  );
  await page.goto('/admin/');
  await page.getByLabel('Password').fill('pw');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'ana@example.com' })).toBeVisible();
  expect(JSON.parse(login).password).toBe('pw');
  expect(auth).toBe('Bearer t');
  const href = await page.getByRole('link', { name: 'Download CSV' }).getAttribute('href');
  expect(decodeURIComponent(href!.split(',')[1])).toContain(`"'=HYPERLINK(""x"")","Lee","ana@example.com",""`);
});
