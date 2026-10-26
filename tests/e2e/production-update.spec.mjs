import { expect, test } from '@playwright/test';

test('the served app shell installs and reloads offline with a valid manifest MIME type', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const manifest = await page.request.get(new URL('./manifest.webmanifest', page.url()).href);
  expect(manifest.ok()).toBe(true);
  expect(manifest.headers()['content-type']).toMatch(
    /^application\/(?:manifest\+json|json)(?:;|$)/i,
  );

  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)))
    .toBe(true);
  await expect(page.locator('#update-banner')).toBeHidden();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#app-version')).toBeVisible();
  await expect(page.locator('#new-set-button')).toBeEnabled();
});
