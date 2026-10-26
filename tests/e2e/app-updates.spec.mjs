import { expect, test } from '@playwright/test';
import { startAppShellFixture, startStandaloneApp } from './fixtures/app-shell.mjs';
import { workerMessage } from './fixtures/service-worker.mjs';

let fixture;

test.beforeEach(async ({ context }) => {
  fixture = await startAppShellFixture();
  await trackLoads(context);
});

async function trackLoads(context) {
  await context.addInitScript(() => {
    sessionStorage.setItem(
      'fixture-loads',
      String(Number(sessionStorage.getItem('fixture-loads') || 0) + 1),
    );
  });
}

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
  await fixture.close();
});

async function loads(page) {
  return page.evaluate(() => Number(sessionStorage.getItem('fixture-loads')));
}

async function expectShell(page, version, shell) {
  await expect(page.locator('#app-version')).toHaveText(
    version === '0.0.0' ? 'Utviklingsversjon' : `Versjon ${version}`,
  );
  await expect(page.locator('html')).toHaveAttribute('data-fixture-shell', shell);
  await expect
    .poll(() => page.evaluate(() => window.fixtureLoadedShell))
    .toEqual({ version, shell });
}

async function openApp(page, version = '1.2.3', shell = 'A') {
  await page.goto(`${fixture.origin}/app/`);
  await expectShell(page, version, shell);
  await expect(page.locator('#profile-select option')).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await expect(page.locator('#check-updates')).toBeEnabled();
}

async function offer(page, candidate = { version: '2.0.0', shell: 'B' }) {
  fixture.deploy(candidate);
  await page.locator('#check-updates').click();
  await expect(page.locator('#update-banner')).toBeVisible();
  expect(await workerMessage(page, 'waiting', 'PUGGERN_IDENTITY')).toMatchObject({
    version: candidate.version,
    shell: candidate.shell,
  });
  await expect(page.locator('#apply-update')).toBeEnabled();
}

async function savedData(page) {
  return page.evaluate(() => ({
    profiles: JSON.parse(localStorage.getItem('puggern.profile-state')),
    sets: JSON.parse(localStorage.getItem('puggern.word-sets')),
  }));
}

async function saveForm(page, form, button) {
  await page.waitForFunction(
    (selector) => Date.now() - Number(document.querySelector(selector).dataset.openedAt) >= 300,
    form,
  );
  await page.getByRole('button', { name: button, exact: true }).click();
}

async function createPractice(page, { profile = false, single = false } = {}) {
  if (profile) {
    await page.locator('#new-profile-button').click();
    await page.locator('#profile-name').fill('Ada');
    await saveForm(page, '#profile-form', 'Lagre profil');
    await expect(page.locator('#profile-select option:checked')).toHaveText('Ada');
  }
  await page.locator('#new-set-button').click();
  await page.locator('#word-set-name').fill('Frukt');
  await page
    .locator('#word-set')
    .fill(single ? 'Rød frukt\teple' : 'Rød frukt\teple\nGul frukt\tbanan');
  await saveForm(page, '#word-set-form', 'Lagre og start øving');
  await page.locator('#exercise-config-form button[type="submit"]').click();
  await expect(page.locator('#answer')).toBeVisible();
}

async function correctAnswer(page) {
  const prompt = await page.locator('#prompt').textContent();
  await page.locator('#answer').fill(prompt === 'Rød frukt' ? 'eple' : 'banan');
}

async function holdProfileSave(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        void navigator.locks.request('puggern.profile-state', async () => {
          resolve();
          await new Promise((release) => {
            window.releaseUpdateTestSave = release;
          });
        });
      }),
  );
}

async function expectStillWaiting(page) {
  expect(await workerMessage(page, 'controller', 'PUGGERN_IDENTITY')).toMatchObject({ shell: 'A' });
  expect(await workerMessage(page, 'waiting', 'PUGGERN_IDENTITY')).toMatchObject({ shell: 'B' });
  await expectShell(page, '1.2.3', 'A');
  expect(await loads(page)).toBe(1);
}

function activeProgress(data) {
  const state = data.profiles;
  return Object.values(state.progress[state.activeProfileId])[0];
}

test('first install shows the loaded release or seed, without a banner, navigation or external request', async ({
  page,
  context,
}) => {
  const external = [];
  context.on('request', (request) => {
    if (new URL(request.url()).origin !== fixture.origin) external.push(request.url());
  });
  await openApp(page);
  await expect(page.locator('#release-notes')).toHaveAttribute(
    'href',
    'https://github.com/aigelonic/puggern/releases/tag/v1.2.3',
  );
  await expect(page.locator('#release-notes')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('#release-notes')).toHaveAttribute('target', '_blank');
  await expect(page.locator('#update-banner')).toBeHidden();
  await expect(page.locator('#update-ready')).toBeHidden();
  expect(await loads(page)).toBe(1);
  await context.setOffline(true);
  await page.reload();
  await expectShell(page, '1.2.3', 'A');
  await expect(page.locator('#new-set-button')).toBeEnabled();
  expect(external).toEqual([]);

  await context.setOffline(false);
  const seedContext = await context.browser().newContext();
  try {
    fixture.deploy({ version: '0.0.0', shell: 'seed' });
    const seed = await seedContext.newPage();
    await openApp(seed, '0.0.0', 'seed');
    await expect(seed.locator('#release-notes')).toBeHidden();
    await expect(seed.locator('#release-notes')).not.toHaveAttribute('href');
    await expect(seed.locator('#update-banner')).toBeHidden();
  } finally {
    await seedContext.close();
  }
});

test('a real waiting update leaves A loaded, Later dismisses only the banner and the footer reopens it', async ({
  page,
}) => {
  await openApp(page);
  await offer(page);
  await expect(page.locator('#update-banner')).toHaveCount(1);
  await expect(page.locator('#update-status')).toHaveText(
    'En oppdatering er klar. Ny versjon 2.0.0 er klar.',
  );
  await expectShell(page, '1.2.3', 'A');
  expect(await loads(page)).toBe(1);
  expect(await workerMessage(page, 'controller', 'PUGGERN_IDENTITY')).toMatchObject({ shell: 'A' });
  await page.locator('#defer-update').click();
  await expect(page.locator('#update-banner')).toBeHidden();
  await expect(page.locator('#update-ready')).toBeFocused();
  await page.locator('#check-updates').click();
  await expect(page.locator('#check-updates')).toBeEnabled();
  await expect(page.locator('#update-banner')).toBeHidden();
  await page.locator('#update-ready').press('Enter');
  await expect(page.locator('#update-banner')).toBeVisible();
  await expect(page.locator('#apply-update')).toBeFocused();
  expect(await loads(page)).toBe(1);
});

for (const candidate of [
  { version: '1.2.3', shell: 'same' },
  { version: '1.0.0', shell: 'rollback' },
]) {
  test(`offers the deployed ${candidate.shell} shell without inventing a newer version`, async ({
    page,
  }) => {
    await openApp(page);
    await offer(page, candidate);
    await expect(page.locator('#update-status')).toHaveText(
      candidate.shell === 'same'
        ? 'Oppdatert appinnhold er klart.'
        : 'En oppdatering er klar. Ny versjon 1.0.0 er klar.',
    );
    await expectShell(page, '1.2.3', 'A');
    expect(await loads(page)).toBe(1);
    await page.locator('#apply-update').click();
    await expectShell(page, candidate.version, candidate.shell);
    expect(await loads(page)).toBe(2);
  });
}

for (const draft of ['editor', 'profile', 'answer']) {
  test(`cancelling an update preserves dirty ${draft} input, focus and saved data without submitting`, async ({
    page,
  }) => {
    await openApp(page);
    let input;
    let warning;
    if (draft === 'answer') {
      await createPractice(page);
      input = page.locator('#answer');
      warning = 'svaret som ikke er sendt inn';
    } else if (draft === 'editor') {
      await page.locator('#new-set-button').click();
      await page.locator('#word-set-name').fill('Uferdig sett');
      input = page.locator('#word-set');
      warning = 'endringer i ordsettet';
    } else {
      await page.locator('#new-profile-button').click();
      input = page.locator('#profile-name');
      warning = 'ny profil';
    }
    await input.fill('behold dette');
    const before = await savedData(page);
    await offer(page);
    await input.focus();
    await page.evaluate(() => {
      window.updateTestSubmits = 0;
      document.addEventListener(
        'submit',
        (event) => {
          if (event.target.closest('.view')) window.updateTestSubmits += 1;
        },
        true,
      );
    });
    await page.locator('#apply-update').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Forkaste inntasting?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription(new RegExp(warning));
    await expect(page.locator('#cancel-update-button')).toBeFocused();
    await expect(page.locator('#apply-update')).toBeDisabled();
    await expectStillWaiting(page);
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#apply-update')).toBeEnabled();
    await expect(input).toHaveValue('behold dette');
    expect(await savedData(page)).toEqual(before);
    expect(await page.evaluate(() => window.updateTestSubmits)).toBe(0);
    await expect(page.locator('#apply-update')).toBeFocused();
    await input.focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' fortsatt');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('behold dette fortsatt');
    await expectStillWaiting(page);
  });
}

test('reports both dirty setup categories and Escape preserves both drafts', async ({ page }) => {
  await openApp(page);
  await page.locator('#new-profile-button').click();
  await page.locator('#profile-name').fill('Ulagret profil');
  await page.locator('#new-set-button').click();
  await page.locator('#word-set-name').fill('Ulagret sett');
  await page.locator('#word-set').fill('ufullstendig');
  const before = await savedData(page);
  await offer(page);
  await page.locator('#apply-update').click();
  await expect(page.locator('#update-input-warning')).toContainText(
    'endringer i ordsettet, ny profil',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('#update-confirmation')).toBeHidden();
  await expect(page.locator('#profile-name')).toHaveValue('Ulagret profil');
  await expect(page.locator('#word-set-name')).toHaveValue('Ulagret sett');
  await expect(page.locator('#word-set')).toHaveValue('ufullstendig');
  expect(await savedData(page)).toEqual(before);
  await expectStillWaiting(page);
  await expect(page.locator('#apply-update')).toBeFocused();
});

test('failed progress saves block activation and reload; retry saves pending rewards exactly once', async ({
  page,
}) => {
  await openApp(page);
  await createPractice(page);
  const before = await savedData(page);
  await offer(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'puggern.profile-state' && !window.allowUpdateTestSave) {
        throw new DOMException('Update test quota', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await correctAnswer(page);
  await page.locator('#answer').press('Enter');
  await expect(page.locator('#progress-warning')).toBeVisible();
  await expect(page.locator('#answer')).toHaveValue('');
  await page.locator('#apply-update').click();
  await expect(page.locator('#update-status')).toHaveText(
    'Oppdateringen ble avbrutt. Kontroller at fremdriften er lagret og prøv igjen.',
  );
  await expect(page.locator('#apply-update')).toBeEnabled();
  await expect(page.locator('#update-confirmation')).toBeHidden();
  expect(await savedData(page)).toEqual(before);
  await expectStillWaiting(page);
  await page.evaluate(() => {
    window.allowUpdateTestSave = true;
  });
  await page.locator('#apply-update').click();
  await expectShell(page, '2.0.0', 'B');
  expect(await loads(page)).toBe(2);
  const after = await savedData(page);
  expect(after.profiles.profiles[0].rewards).toEqual({
    points: 10,
    bestStreak: 1,
    completedSets: 0,
  });
  expect(activeProgress(after).session.learned).toHaveLength(1);
  expect(activeProgress(after).session.queue).toHaveLength(1);
});

test('submit preventDefault is synchronous; an in-flight answer and double apply cannot double rewards or reload early', async ({
  page,
}) => {
  await openApp(page);
  await createPractice(page);
  await offer(page);
  const before = await savedData(page);
  await holdProfileSave(page);
  await correctAnswer(page);
  const dispatch = () =>
    page.locator('#answer-form').evaluate((form) => {
      const event = new Event('submit', { bubbles: true, cancelable: true });
      const dispatched = form.dispatchEvent(event);
      return { dispatched, prevented: event.defaultPrevented };
    });
  expect(await dispatch()).toEqual({ dispatched: false, prevented: true });
  await expect(page.locator('#answer')).toHaveAttribute('readonly', '');
  expect(await dispatch()).toEqual({ dispatched: false, prevented: true });
  await page.locator('#apply-update').evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.locator('#apply-update')).toBeDisabled();
  expect(await dispatch()).toEqual({ dispatched: false, prevented: true });
  expect(await savedData(page)).toEqual(before);
  await expectStillWaiting(page);
  await page.evaluate(() => window.releaseUpdateTestSave());
  await expectShell(page, '2.0.0', 'B');
  expect(await loads(page)).toBe(2);
  const after = await savedData(page);
  expect(after.profiles.profiles[0].rewards).toEqual({
    points: 10,
    bestStreak: 1,
    completedSets: 0,
  });
  expect(activeProgress(after).session.points).toBe(10);
  expect(activeProgress(after).session.learned).toHaveLength(1);
  expect(activeProgress(after).session.queue).toHaveLength(1);
});

test('accepts prepared B offline and retains actual profiles, sets, progress and rewards through one reload', async ({
  page,
  context,
}) => {
  await openApp(page);
  await createPractice(page, { profile: true });
  await correctAnswer(page);
  await page.locator('#answer').press('Enter');
  await expect(page.locator('#profile-rewards')).toContainText('10 poeng totalt');
  await expect(page.locator('#answer')).toHaveValue('');
  const before = await savedData(page);
  const nextPrompt = await page.locator('#prompt').textContent();
  await offer(page);
  await context.setOffline(true);
  await page.locator('#check-updates').click();
  await expect(page.locator('#update-status')).toHaveText(
    'Du trenger internett for å se etter oppdateringer.',
  );
  await expect(page.locator('#update-banner')).toBeVisible();
  await page.locator('#apply-update').click();
  await expectShell(page, '2.0.0', 'B');
  expect(await loads(page)).toBe(2);
  expect(await savedData(page)).toEqual(before);
  await expect(page.locator('#profile-select option:checked')).toHaveText('Ada');
  await expect(page.locator('#profile-rewards')).toContainText('10 poeng totalt');
  await expect(page.locator('#update-banner')).toBeHidden();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#prompt')).toHaveText(nextPrompt);
  await expect(page.locator('#progress-label')).toHaveText('1 av 2 lært · 1 oppgaver igjen');
  await expect(page.locator('#app-version')).toHaveText('Versjon 2.0.0');
  expect(await workerMessage(page, 'controller', 'PUGGERN_IDENTITY')).toMatchObject({
    version: '2.0.0',
    shell: 'B',
  });
  await correctAnswer(page);
  await page.locator('#answer').press('Enter');
  await expect(page.locator('#completion-heading')).toBeVisible();
  await expect(page.locator('#app-version')).toHaveText('Versjon 2.0.0');
  const completed = await savedData(page);
  expect(completed.profiles.profiles.find(({ name }) => name === 'Ada').rewards).toEqual({
    points: 20,
    bestStreak: 2,
    completedSets: 1,
  });
});

test('two real app windows block apply; closing the other permits a safe UI retry', async ({
  page,
  context,
}) => {
  await openApp(page);
  const other = await context.newPage();
  await openApp(other);
  await offer(page);
  await page.locator('#apply-update').click();
  await expect(page.locator('#update-status')).toHaveText(
    'Lukk andre Puggern-vinduer og prøv igjen.',
  );
  await expect(page.locator('#apply-update')).toBeEnabled();
  await expectStillWaiting(page);
  await expectShell(other, '1.2.3', 'A');
  expect(await loads(other)).toBe(1);
  await other.close();
  await page.locator('#apply-update').click();
  await expectShell(page, '2.0.0', 'B');
  expect(await loads(page)).toBe(2);
});

test('unsolicited controllerchange offers a guarded reload, never reloads either A window and retains old shell caches', async ({
  page,
  context,
}) => {
  await openApp(page);
  await page.evaluate(async () => {
    await caches.open('update-test-unrelated');
  });
  await offer(page, { version: '2.0.0', shell: 'B', holdActivation: true });
  const activation = workerMessage(page, 'waiting', 'PUGGERN_ACTIVATE');
  await expect.poll(() => fixture.state.activationHeld).toBe(true);
  const late = await context.newPage();
  await openApp(late);
  await late.locator('#new-set-button').click();
  await late.locator('#word-set-name').fill('Behold utkastet');
  await late.locator('#word-set').fill('ikke ferdig');
  fixture.release();
  expect(await activation).toMatchObject({ ok: true, shell: 'B' });
  for (const client of [page, late]) {
    await expect
      .poll(async () => (await workerMessage(client, 'controller', 'PUGGERN_IDENTITY')).shell)
      .toBe('B');
    await expect(client.locator('#update-banner')).toBeVisible();
    await expectShell(client, '1.2.3', 'A');
    expect(await loads(client)).toBe(1);
  }
  await late.locator('#apply-update').click();
  await expect(late.locator('#update-confirmation')).toBeVisible();
  await late.locator('#cancel-update-button').click();
  await expect(late.locator('#word-set-name')).toHaveValue('Behold utkastet');
  await expect(late.locator('#word-set')).toHaveValue('ikke ferdig');
  expect(await loads(late)).toBe(1);
  await context.setOffline(true);
  const retained = await page.evaluate(async () => {
    const cache = await caches.open('puggern-app-shell-1.2.3-A');
    return {
      keys: await caches.keys(),
      version: await (await cache.match(new URL('./src/app-version.mjs', location.href))).text(),
      profilesAvailable: (await fetch('./src/profiles.mjs?v=8')).ok,
    };
  });
  expect(retained.keys).toEqual(
    expect.arrayContaining([
      'puggern-app-shell-1.2.3-A',
      'puggern-app-shell-2.0.0-B',
      'update-test-unrelated',
    ]),
  );
  expect(retained.version).toContain("APP_VERSION = '1.2.3'");
  expect(retained.profilesAvailable).toBe(true);
});

test('explicit discard updates without submitting a typed answer or rewarding it', async ({
  page,
}) => {
  await openApp(page);
  await createPractice(page);
  await correctAnswer(page);
  const before = await savedData(page);
  await offer(page);
  await page.locator('#apply-update').click();
  await expect(page.locator('#update-confirmation')).toBeVisible();
  await page.getByRole('button', { name: 'Forkast inntasting og oppdater', exact: true }).click();
  await expectShell(page, '2.0.0', 'B');
  expect(await loads(page)).toBe(2);
  expect(await savedData(page)).toEqual(before);
  expect(activeProgress(await savedData(page)).session.learned).toHaveLength(0);
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#answer')).toHaveValue('');
});

test('reconnect and visible-state checks discover candidates without stealing draft focus or reannouncing a dismissal', async ({
  page,
  context,
}) => {
  const epoch = Date.parse('2026-10-25T12:00:00Z');
  await page.clock.setFixedTime(epoch);
  await openApp(page);
  await expect(page.locator('#update-status')).toHaveText('Ingen nedlastet oppdatering er klar.');
  await page.locator('#new-profile-button').click();
  await page.locator('#profile-name').fill('Ulagret');
  fixture.deploy({ version: '2.0.0', shell: 'B' });
  await context.setOffline(true);
  await page.clock.setFixedTime(epoch + 61_000);
  await context.setOffline(false);
  await expect(page.locator('#update-banner')).toBeVisible();
  await expect(page.locator('#profile-name')).toBeFocused();
  await expect(page.locator('#profile-name')).toHaveValue('Ulagret');
  await expectStillWaiting(page);
  await page.locator('#defer-update').click();
  await page.clock.setFixedTime(epoch + 122_000);
  await expect(page.locator('#update-banner')).toBeHidden();
  fixture.deploy({ version: '2.1.0', shell: 'C' });
  await page.locator('#profile-name').focus();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#update-banner')).toBeVisible();
  await expect(page.locator('#update-status')).toContainText('Ny versjon 2.1.0 er klar.');
  await expect(page.locator('#profile-name')).toBeFocused();
  await expectShell(page, '1.2.3', 'A');
  expect(await loads(page)).toBe(1);
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 320, height: 360 },
]) {
  test(`update controls are keyboard accessible and do not overlap answers at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page);
    await createPractice(page);
    await page.locator('#answer').fill('behold svaret');
    await offer(page);
    await expect(page.locator('#update-status')).toHaveAttribute('role', 'status');
    await expect(page.locator('#update-status')).toHaveAttribute('aria-live', 'polite');
    const layout = await page.evaluate(() => {
      const selectors = [
        '#answer',
        '#answer-label',
        '#answer-form button',
        '#app-version',
        '#release-notes',
        '#check-updates',
        '#update-ready',
        '#update-status',
        '#update-banner > p',
        '#apply-update',
        '#defer-update',
      ];
      const boxes = selectors.map((selector) => {
        const element = document.querySelector(selector);
        const box = element.getBoundingClientRect();
        return {
          selector,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          height: box.height,
          width: box.width,
          overflow: element.scrollWidth > element.clientWidth + 1,
        };
      });
      const overlaps = boxes.flatMap((box, index) =>
        boxes
          .slice(index + 1)
          .filter(
            (other) =>
              Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1 &&
              Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1,
          )
          .map((other) => [box.selector, other.selector]),
      );
      return {
        boxes,
        overlaps,
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
    expect(layout.overlaps).toEqual([]);
    for (const box of layout.boxes) {
      expect(box.left, box.selector).toBeGreaterThanOrEqual(0);
      expect(box.right, box.selector).toBeLessThanOrEqual(layout.width);
      expect(box.width, box.selector).toBeGreaterThan(0);
      if (
        ['#check-updates', '#update-ready', '#apply-update', '#defer-update'].includes(box.selector)
      ) {
        expect(box.height, box.selector).toBeGreaterThanOrEqual(44);
        expect(box.overflow, box.selector).toBe(false);
      }
    }
    await page.locator('#check-updates').focus();
    for (const selector of ['#update-ready', '#apply-update', '#defer-update']) {
      await page.keyboard.press('Tab');
      await expect(page.locator(selector)).toBeFocused();
      await expect(page.locator(selector)).toBeInViewport();
      expect(
        await page.locator(selector).evaluate((element) => getComputedStyle(element).outlineStyle),
      ).not.toBe('none');
    }
    await test.info().attach('ready-layout', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('#update-confirmation')).toBeVisible();
    await expect(page.locator('#cancel-update-button')).toBeFocused();
    const dialog = await page.locator('#update-confirmation').boundingBox();
    expect(dialog.x).toBeGreaterThanOrEqual(0);
    expect(dialog.y).toBeGreaterThanOrEqual(0);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(viewport.width);
    expect(dialog.y + dialog.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.press('Shift+Tab');
    await expect(
      page.getByRole('button', { name: 'Forkast inntasting og oppdater', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#cancel-update-button')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#answer')).toHaveValue('behold svaret');
    await expectStillWaiting(page);
  });
}

test('native standalone app window keeps the update and confirmation keyboard-safe at 320px and tablet sizes', async () => {
  const standalone = await startStandaloneApp();
  try {
    await trackLoads(standalone.context);
    const page = standalone.context.pages()[0];
    await openApp(page);
    const isStandalone = await page.evaluate(
      () => matchMedia('(display-mode: standalone)').matches,
    );
    test.skip(
      !isStandalone,
      'This Chromium app window does not expose display-mode: standalone in the current environment.',
    );
    await createPractice(page);
    await page.locator('#answer').fill('behold svaret');
    await offer(page);
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 320, height: 360 },
    ]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(
        true,
      );
      const layout = await page.evaluate(() => {
        const footer = document.querySelector('.app-footer').getBoundingClientRect();
        const answer = document.querySelector('#answer-form').getBoundingClientRect();
        return {
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          footerTop: footer.top,
          answerBottom: answer.bottom,
          padding: parseFloat(
            getComputedStyle(document.querySelector('.app-footer')).paddingBottom,
          ),
        };
      });
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
      expect(layout.footerTop).toBeGreaterThan(layout.answerBottom);
      expect(layout.padding).toBeGreaterThanOrEqual(16);
      await page.locator('#apply-update').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#update-confirmation')).toBeVisible();
      await expect(page.locator('#cancel-update-button')).toBeFocused();
      await page.keyboard.press('Tab');
      const discard = page.getByRole('button', {
        name: 'Forkast inntasting og oppdater',
        exact: true,
      });
      await expect(discard).toBeFocused();
      await expect(discard).toBeInViewport();
      await page.keyboard.press('Tab');
      await expect(page.locator('#cancel-update-button')).toBeFocused();
      await test.info().attach(`standalone-${viewport.width}x${viewport.height}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await page.keyboard.press('Escape');
      await expect(page.locator('#update-confirmation')).toBeHidden();
      await expect(page.locator('#answer')).toHaveValue('behold svaret');
    }
    await expectStillWaiting(page);
  } finally {
    await standalone.close();
  }
});
