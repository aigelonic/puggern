import { expect, test } from '@playwright/test';
import {
  installWorker,
  startWorkerFixture,
  updateWorker,
  workerMessage,
} from './fixtures/service-worker.mjs';

let fixture;

test.beforeEach(async () => {
  fixture = await startWorkerFixture();
});

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
  await fixture.close();
});

test('waits for consent, keeps A coherent, then activates complete B offline without reloading', async ({
  page,
  context,
}) => {
  await installWorker(page, fixture.origin);
  expect(await page.evaluate(() => window.loadCount)).toBe(1);
  expect(await workerMessage(page, 'active', 'PUGGERN_IDENTITY')).toMatchObject({
    ok: true,
    version: '1.0.0',
    shell: 'A',
  });
  await page.evaluate(async () => {
    localStorage.setItem('saved-profile', JSON.stringify({ name: 'Ada', progress: 3, rewards: 2 }));
    await caches.open('unrelated-cache');
  });
  fixture.state.version = '2.0.0';
  fixture.state.shell = 'B';
  expect(await updateWorker(page)).toBe('installed');
  expect(await workerMessage(page, 'waiting', 'PUGGERN_IDENTITY', 'candidate-B')).toEqual({
    type: 'PUGGERN_RESULT',
    requestId: 'candidate-B',
    ok: true,
    version: '2.0.0',
    shell: 'B',
  });
  expect(
    fixture.state.requests.filter(({ cacheControl }) => cacheControl === 'no-cache'),
  ).toHaveLength(30);
  expect(await workerMessage(page, 'controller', 'PUGGERN_IDENTITY')).toMatchObject({ shell: 'A' });
  await page.reload();
  await expect(page.locator('#identity')).toHaveText('1.0.0:A');
  expect(await page.evaluate(() => window.loadedShell)).toEqual({ version: '1.0.0', shell: 'A' });
  const beforeActivation = await page.evaluate(() => window.loadCount);
  await context.setOffline(true);
  expect(await workerMessage(page, 'waiting', 'PUGGERN_ACTIVATE')).toMatchObject({
    ok: true,
    shell: 'B',
  });
  await expect
    .poll(async () => (await workerMessage(page, 'controller', 'PUGGERN_IDENTITY')).shell)
    .toBe('B');
  expect(await page.evaluate(() => window.loadCount)).toBe(beforeActivation);
  await expect(page.locator('#identity')).toHaveText('1.0.0:A');
  await page.reload();
  await expect(page.locator('#identity')).toHaveText('2.0.0:B');
  expect(await page.evaluate(() => window.loadedShell)).toEqual({ version: '2.0.0', shell: 'B' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('saved-profile')))).toEqual({
    name: 'Ada',
    progress: 3,
    rewards: 2,
  });
  expect(await page.evaluate(() => caches.keys())).toEqual(
    expect.arrayContaining([
      'unrelated-cache',
      'puggern-app-shell-1.0.0-A',
      'puggern-app-shell-2.0.0-B',
    ]),
  );
});

for (const failure of ['mime', 'missing', 'http']) {
  test(`failed ${failure} preparation leaves A usable and permits retry`, async ({
    page,
    context,
  }) => {
    await installWorker(page, fixture.origin);
    fixture.state.version = '2.0.0';
    fixture.state.shell = 'B';
    fixture.state.failure = failure;
    expect(await updateWorker(page)).toBe('redundant');
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting),
    ).toBeNull();
    expect(await page.evaluate(() => caches.keys())).not.toContain('puggern-app-shell-2.0.0-B');
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#identity')).toHaveText('1.0.0:A');
    await context.setOffline(false);
    fixture.state.failure = null;
    expect(await updateWorker(page)).toBe('installed');
    expect(await workerMessage(page, 'waiting', 'PUGGERN_IDENTITY')).toMatchObject({ shell: 'B' });
  });
}

test('blocks controlled and uncontrolled app windows but excludes out-of-scope windows', async ({
  page,
  context,
}) => {
  await installWorker(page, fixture.origin);
  const other = await context.newPage();
  await other.goto(`${fixture.origin}/app/`);
  fixture.state.version = '2.0.0';
  fixture.state.shell = 'B';
  expect(await updateWorker(page)).toBe('installed');
  expect(await workerMessage(page, 'waiting', 'PUGGERN_ACTIVATE')).toMatchObject({
    ok: false,
    error: 'other-windows',
  });
  await other.close();
  const uncontrolled = await context.newPage();
  const session = await context.newCDPSession(uncontrolled);
  await session.send('Network.enable');
  await session.send('Network.setBypassServiceWorker', { bypass: true });
  await uncontrolled.goto(`${fixture.origin}/app/`);
  expect(await uncontrolled.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  expect(await workerMessage(page, 'waiting', 'PUGGERN_ACTIVATE')).toMatchObject({
    error: 'other-windows',
  });
  await uncontrolled.goto(`${fixture.origin}/outside/`);
  expect(await workerMessage(uncontrolled, 'waiting', 'PUGGERN_IDENTITY')).toMatchObject({
    ok: false,
    error: 'invalid-client',
  });
  expect(await workerMessage(page, 'waiting', 'PUGGERN_ACTIVATE')).toMatchObject({ ok: true });
});

test('a window opened after enumeration stays loaded and old shell caches survive activation', async ({
  page,
  context,
}) => {
  await installWorker(page, fixture.origin);
  fixture.state.version = '2.0.0';
  fixture.state.shell = 'B';
  fixture.state.gate = true;
  expect(await updateWorker(page)).toBe('installed');
  const activation = workerMessage(page, 'waiting', 'PUGGERN_ACTIVATE');
  await expect.poll(() => fixture.state.gated).toBe(true);
  const late = await context.newPage();
  await late.goto(`${fixture.origin}/app/`);
  await expect(late.locator('#identity')).toHaveText('1.0.0:A');
  fixture.release();
  expect(await activation).toMatchObject({ ok: true });
  await expect
    .poll(async () => (await workerMessage(late, 'controller', 'PUGGERN_IDENTITY')).shell)
    .toBe('B');
  expect(await late.evaluate(() => window.loadCount)).toBe(1);
  expect(await late.evaluate(() => window.loadedShell)).toEqual({ version: '1.0.0', shell: 'A' });
  await expect(late.locator('#identity')).toHaveText('1.0.0:A');
  await context.setOffline(true);
  expect(await late.evaluate(async () => (await fetch('./src/profiles.mjs?v=9')).ok)).toBe(true);
  expect(
    await late.evaluate(async () => {
      const cache = await caches.open('puggern-app-shell-1.0.0-A');
      return (await cache.match('./src/app-version.mjs')).text();
    }),
  ).toContain('1.0.0');
});

test('migrates a legacy bad-MIME shell only after consent and keeps saved data offline', async ({
  page,
  context,
}) => {
  fixture.state.legacy = true;
  await installWorker(page, fixture.origin);
  await page.evaluate(() => localStorage.setItem('saved-profile', 'Ada'));
  expect(
    await page.evaluate(async () => {
      const cache = await caches.open('puggern-app-shell-v8');
      return (await cache.match('./src/profiles.mjs?v=8')).headers.get('content-type');
    }),
  ).toBe('application/octet-stream');
  fixture.state.legacy = false;
  fixture.state.version = '2.0.0';
  fixture.state.shell = 'B';
  expect(await updateWorker(page)).toBe('installed');
  expect(await workerMessage(page, 'waiting', 'PUGGERN_IDENTITY')).toMatchObject({ shell: 'B' });
  await expect(page.locator('#identity')).toHaveText('1.0.0:A');
  expect(await workerMessage(page, 'waiting', 'PUGGERN_ACTIVATE')).toMatchObject({ ok: true });
  await expect
    .poll(async () => (await workerMessage(page, 'controller', 'PUGGERN_IDENTITY')).shell)
    .toBe('B');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#identity')).toHaveText('2.0.0:B');
  expect(await page.evaluate(() => localStorage.getItem('saved-profile'))).toBe('Ada');
  expect(
    await page.evaluate(async () => {
      const cache = await caches.open('puggern-app-shell-2.0.0-B');
      return (await cache.match('./src/profiles.mjs?v=9')).headers.get('content-type');
    }),
  ).toBe('text/javascript');
});

test('same-version shell changes and rollback versions are waiting candidates', async ({
  page,
}) => {
  await installWorker(page, fixture.origin);
  fixture.state.shell = 'B';
  expect(await updateWorker(page)).toBe('installed');
  expect(await workerMessage(page, 'waiting', 'PUGGERN_IDENTITY')).toMatchObject({
    version: '1.0.0',
    shell: 'B',
  });
  fixture.state.version = '0.9.0';
  fixture.state.shell = 'C';
  expect(await updateWorker(page)).toBe('installed');
  expect(await workerMessage(page, 'waiting', 'PUGGERN_IDENTITY')).toMatchObject({
    version: '0.9.0',
    shell: 'C',
  });
  expect(await workerMessage(page, 'controller', 'PUGGERN_IDENTITY')).toMatchObject({
    version: '1.0.0',
    shell: 'A',
  });
});

test('unknown requests keep ordinary 404s and cannot borrow another cache entry', async ({
  page,
}) => {
  await installWorker(page, fixture.origin);
  await page.evaluate(async () => {
    const unrelated = await caches.open('unrelated-cache');
    await unrelated.put('./missing.mjs', new Response('poisoned'));
  });
  expect(
    await page.evaluate(async () => {
      const response = await fetch('./missing.mjs');
      return { status: response.status, body: await response.text() };
    }),
  ).toEqual({ status: 404, body: 'not found' });
});

test('natural activation after old clients close safely cleans legacy shells, not unrelated caches', async ({
  page,
  context,
}) => {
  await installWorker(page, fixture.origin);
  await page.evaluate(async () => {
    await caches.open('puggern-app-shell-v8');
    await caches.open('unrelated-cache');
    await caches.open('puggern-app-shell-not-ours');
  });
  fixture.state.version = '2.0.0';
  fixture.state.shell = 'B';
  expect(await updateWorker(page)).toBe('installed');
  const observer = await context.newPage();
  await observer.goto(`${fixture.origin}/outside/`);
  await page.close();
  await expect
    .poll(async () =>
      observer.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration('/app/');
        return Boolean(registration.active && !registration.waiting);
      }),
    )
    .toBe(true);
  await expect
    .poll(() => observer.evaluate(() => caches.keys()))
    .not.toContain('puggern-app-shell-v8');
  expect(await observer.evaluate(() => caches.keys())).toEqual(
    expect.arrayContaining([
      'unrelated-cache',
      'puggern-app-shell-not-ours',
      'puggern-app-shell-2.0.0-B',
    ]),
  );
});
