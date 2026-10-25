import { expect, test } from '@playwright/test';

test('declares the header PNG as a favicon with application-relative URLs', async ({
  page,
  request,
}) => {
  await page.goto('/');

  const favicon = page.locator('head link[rel="icon"]');
  await expect(favicon).toHaveCount(1);
  await expect(favicon).toHaveAttribute('type', 'image/png');
  await expect(favicon).toHaveAttribute('sizes', '192x192');
  await expect(favicon).toHaveAttribute('href', './icons/pug-192.png');

  const href = await favicon.getAttribute('href');
  const headerSrc = await page.locator('.app-header .brand img').getAttribute('src');
  const iconURL = new URL(href, page.url()).href;
  expect(iconURL).toBe(new URL(headerSrc, page.url()).href);

  const response = await request.get(iconURL);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toMatch(/^image\/png\b/);
  expect((await response.body()).length).toBeGreaterThan(0);

  const subdirectoryURL = new URL('./puggern/', page.url());
  expect(new URL(href, subdirectoryURL).href).toBe(
    new URL('./puggern/icons/pug-192.png', page.url()).href,
  );
  expect(new URL(href, subdirectoryURL).href).toBe(new URL(headerSrc, subdirectoryURL).href);
});

test('keeps the favicon declaration and PNG available after an offline reload', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });

  const cachedIcon = await page.evaluate(async () => {
    const cache = await caches.open('puggern-app-shell-v10');
    const response = await cache.match('./icons/pug-192.png');
    return response ? (await response.arrayBuffer()).byteLength : 0;
  });
  expect(cachedIcon).toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('head link[rel="icon"]')).toHaveAttribute(
    'href',
    './icons/pug-192.png',
  );
  const icon = await page.evaluate(async () => {
    const response = await fetch(document.querySelector('head link[rel="icon"]').href);
    return {
      ok: response.ok,
      type: response.headers.get('content-type'),
      size: (await response.arrayBuffer()).byteLength,
    };
  });
  expect(icon.ok).toBe(true);
  expect(icon.type).toMatch(/^image\/png\b/);
  expect(icon.size).toBeGreaterThan(0);
});
