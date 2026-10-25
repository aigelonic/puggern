import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';
import { createProfileState } from '../../frontend/src/profiles.mjs';

test('replaces an installed v8 shell with bad module MIME types and works offline', async ({
  page,
  context,
  baseURL,
}) => {
  let legacy = true;
  const baseOrigin = new URL(baseURL).origin;
  const server = createServer(async (request, response) => {
    try {
      const upstreamUrl = new URL(request.url, baseOrigin);
      if (upstreamUrl.origin !== baseOrigin) {
        response.writeHead(400);
        response.end();
        return;
      }
      const upstream = await fetch(upstreamUrl);
      let body = Buffer.from(await upstream.arrayBuffer());
      const pathname = upstreamUrl.pathname;
      const textAsset =
        pathname === '/' ||
        pathname === '/index.html' ||
        pathname === '/styles.css' ||
        pathname === '/service-worker.js' ||
        pathname.endsWith('.mjs');
      if (legacy && textAsset) {
        body = Buffer.from(
          body
            .toString()
            .replaceAll('puggern-app-shell-v12', 'puggern-app-shell-v8')
            .replaceAll('styles.css?v=10', 'styles.css?v=7')
            .replaceAll('main.mjs?v=11', 'main.mjs?v=8')
            .replaceAll('word-sets.mjs?v=7', 'word-sets.mjs?v=5')
            .replaceAll('creation-guard.mjs?v=3', 'creation-guard.mjs?v=2')
            .replaceAll('.mjs?v=7', '.mjs?v=5')
            .replaceAll('.mjs?v=6', '.mjs?v=5')
            .replaceAll('#46574e', '#64766d'),
        );
      }
      for (const [name, value] of upstream.headers) {
        if (
          !['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(name)
        ) {
          response.setHeader(name, value);
        }
      }
      if (legacy && pathname.endsWith('.mjs') && pathname !== '/src/main.mjs') {
        response.setHeader('content-type', 'application/octet-stream');
        response.setHeader('cache-control', 'max-age=3600');
      } else if (legacy && pathname === '/styles.css') {
        response.setHeader('cache-control', 'max-age=3600');
      }
      if (textAsset && !pathname.endsWith('.mjs') && !(legacy && pathname === '/styles.css')) {
        response.setHeader('cache-control', 'no-store');
        response.removeHeader('last-modified');
        response.removeHeader('etag');
      }
      response.writeHead(upstream.status);
      response.end(body);
    } catch {
      response.writeHead(502);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await page.goto(origin);
    // An existing worker can have cached successful HTTP responses with unusable MIME types.
    await page.evaluate(async (state) => {
      localStorage.setItem('puggern.profile-state', JSON.stringify(state));
      await navigator.serviceWorker.register('./service-worker.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
        );
      }
    }, createProfileState('existing-profile'));
    expect(
      await page.evaluate(async () => {
        const cache = await caches.open('puggern-app-shell-v8');
        return (await cache.match('./src/profiles.mjs?v=5')).headers.get('content-type');
      }),
    ).toBe('application/octet-stream');
    expect(
      await page.evaluate(async () => {
        const cache = await caches.open('puggern-app-shell-v8');
        return (await cache.match('./styles.css?v=7')).text();
      }),
    ).toContain('#64766d');

    legacy = false;
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.evaluate(async () => {
      const changed = new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
      await changed;
    });
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(['puggern-app-shell-v12']);
    const cachedModules = await page.evaluate(async () => {
      const cache = await caches.open('puggern-app-shell-v12');
      const requests = (await cache.keys()).filter((request) =>
        new URL(request.url).pathname.endsWith('.mjs'),
      );
      return Promise.all(
        requests.map(async (request) => (await cache.match(request)).headers.get('content-type')),
      );
    });
    expect(cachedModules).toHaveLength(5);
    for (const type of cachedModules) expect(type).toMatch(/^(?:application|text)\/javascript\b/);
    expect(
      await page.evaluate(async () => {
        const cache = await caches.open('puggern-app-shell-v12');
        return (await cache.match('./index.html')).text();
      }),
    ).toContain('./src/main.mjs?v=11');
    expect(
      await page.evaluate(async () => {
        const cache = await caches.open('puggern-app-shell-v12');
        return (await cache.match('./styles.css?v=10')).text();
      }),
    ).toContain('#46574e');

    await page.reload();
    await page.getByRole('button', { name: 'Legg til profil' }).click();
    await expect(page.locator('#profile-name')).toBeFocused();
    await page.locator('#profile-name').fill('Ada');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Lagre profil' }).click();
    await expect(page.locator('#profile-select option:checked')).toHaveText('Ada');
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#profile-select option:checked')).toHaveText('Ada');
    await expect(page.locator('#profile-select option')).toHaveCount(2);
    await expect(page.locator('#profile-help')).toHaveCSS('color', 'rgb(70, 87, 78)');
    await page.getByRole('button', { name: 'Legg til profil' }).click();
    await expect(page.locator('#profile-name')).toBeFocused();
    await page.locator('#cancel-profile-button').click();
    await expect(page.locator('#profile-form')).toBeHidden();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    await context.setOffline(false);
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
});
