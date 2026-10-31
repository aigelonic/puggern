import { expect, test } from '@playwright/test';

const stateKey = 'puggern.profile-state';

async function seed(page) {
  await page.goto('/');
  await page.evaluate(() => {
    const words = [
      { id: '0', prompt: 'hund', answer: 'dog' },
      { id: '1', prompt: 'katt', answer: 'cat' },
    ];
    const rewards = { points: 0, bestStreak: 0, completedSets: 0 };
    localStorage.setItem(
      'puggern.profile-state',
      JSON.stringify({
        version: 1,
        activeProfileId: 'p1',
        profiles: [
          { id: 'p1', name: 'En', avatar: '', rewards },
          { id: 'p2', name: 'To', avatar: '', rewards },
        ],
        progress: { p1: {}, p2: {} },
      }),
    );
    localStorage.setItem(
      'puggern.word-sets',
      JSON.stringify({
        version: 1,
        sets: [
          {
            id: 'set-1',
            name: 'Dyreord',
            words,
            direction: 'prompt-to-answer',
            settings: { caseSensitive: false, accentSensitive: false },
            archived: false,
            createdAt: '2026-10-20T12:00:00.000Z',
            updatedAt: '2026-10-20T12:00:00.000Z',
          },
        ],
      }),
    );
  });
  await page.reload();
}

async function start(page) {
  await page
    .locator('#word-set-list')
    .getByRole('button', { name: /^(Start øving|Øv på nytt)$/ })
    .click();
  await page.locator('#exercise-order').selectOption('original');
  await page
    .locator('#exercise-config-dialog')
    .getByRole('button', { name: 'Start øving' })
    .click();
  await expect(page.locator('#answer')).toBeFocused();
}

async function answer(page, value) {
  await page.locator('#answer').fill(value);
  await page.locator('#answer').press('Enter');
  await expect(page.locator('#answer-form button[type="submit"]')).toBeEnabled();
}

async function finish(page) {
  await answer(page, 'dog');
  await answer(page, 'cat');
  await expect(page.locator('#complete-view')).toBeVisible();
}

async function state(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), stateKey);
}

async function seedDashboardHistory(page, records) {
  const saved = await state(page);
  const setId = 'synthetic-set';
  const common = {
    setId,
    setName: 'Farger og former',
    directionMode: 'forward',
    orderMode: 'original',
    caseSensitive: false,
    accentSensitive: false,
    points: 40,
    practicedCount: 10,
    totalErrors: 4,
    extraPracticeCount: 2,
  };
  saved.history = {
    p1: records.map((record, index) => ({
      ...common,
      id: `synthetic-run-${index + 1}`,
      setName: record.variant ? 'Tall og bokstaver' : common.setName,
      practicedCount: record.practicedCount ?? common.practicedCount,
      comparisonKey: record.variant ?? 'a'.repeat(64),
      completedAt: `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      firstTryCount: record.firstTryCount,
      bestStreak: record.bestStreak,
    })),
  };
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: stateKey,
    value: saved,
  });
  await page.reload();
}

async function seedDashboardScreenshotFixture(page) {
  await seedDashboardHistory(page, [
    { firstTryCount: 10, bestStreak: 20, variant: 'b'.repeat(64) },
    { firstTryCount: 4, bestStreak: 5 },
    { firstTryCount: 6, bestStreak: 7 },
    { firstTryCount: 7, bestStreak: 8 },
    { firstTryCount: 8, bestStreak: 9 },
  ]);
}

async function openHistory(page) {
  if (await page.locator('#complete-view').isVisible()) {
    await page.getByRole('button', { name: 'Til ordsettene', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Øvingshistorikk', exact: true }).click();
  await expect(page.locator('#history-heading')).toBeFocused();
}

test('empty history, completion metrics, restart trend, details, focus and reload are read-only', async ({
  page,
}) => {
  await seed(page);
  await openHistory(page);
  await expect(page.locator('#history-empty')).toBeVisible();
  await expect(page.locator('#history-trend')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#history-button')).toBeFocused();
  await start(page);
  await answer(page, 'wrong');
  await answer(page, 'wrong');
  await finish(page);
  await expect(page.locator('#completion-record-message')).toContainText('utgangspunktet');
  let saved = await state(page);
  const first = saved.history.p1[0];
  expect(first).toMatchObject({
    points: 20,
    practicedCount: 2,
    firstTryCount: 1,
    totalErrors: 2,
    extraPracticeCount: 1,
    bestStreak: 2,
    setName: 'Dyreord',
  });
  await page.reload();
  saved = await state(page);
  expect(saved.history.p1).toHaveLength(1);
  expect(saved.profiles[0].rewards).toEqual({ points: 20, bestStreak: 2, completedSets: 1 });
  await openHistory(page);
  await expect(page.locator('#history-list > li')).toHaveCount(1);
  await expect(page.locator('#history-comparison')).toContainText('Fullfør en ny');
  await expect(page.locator('#history-chart circle')).toHaveCount(1);
  await expect(page.locator('#history-table-details')).not.toHaveAttribute('open', '');
  await page.getByText('Vis tall og datoer', { exact: true }).click();
  await expect(page.locator('#history-chart-table tbody tr')).toHaveCount(1);
  await expect(page.locator('#history-chart-table tbody')).toContainText('50 %');
  await page.getByText('Vis tall og datoer', { exact: true }).click();
  await page.locator('#history-list summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#history-list details')).toHaveAttribute('open', '');
  await expect(page.locator('#history-list details')).toContainText('1 trengte mer øving');
  await page.keyboard.press('Escape');
  await start(page);
  expect((await state(page)).progress.p1['set-1'].session.run.id).not.toBe(first.id);
  await finish(page);
  await expect(page.locator('#completion-record-message')).toContainText(
    'førsteforsøksnøyaktighet',
  );
  await openHistory(page);
  await expect(page.locator('#history-comparison')).toContainText('50,0 prosentpoeng høyere');
  await expect(page.locator('#history-records')).toContainText('100 %');
  await expect(page.locator('#history-chart circle')).toHaveCount(2);
  await expect(page.locator('#history-chart-table tbody tr')).toHaveCount(2);
  const before = await state(page);
  await page.getByRole('button', { name: 'Tilbake til profilen' }).click();
  await expect(page.locator('#history-button')).toBeFocused();
  await openHistory(page);
  expect(await state(page)).toEqual(before);
});

test('legacy unfinished resume acquires one persistent run ID; completed legacy summaries are never backfilled', async ({
  page,
  context,
}) => {
  await seed(page);
  await start(page);
  await answer(page, 'dog');
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    delete state.progress.p1['set-1'].session.run;
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  await page.reload();
  expect((await state(page)).history).toBeUndefined();
  const other = await context.newPage();
  await other.goto('/');
  await Promise.all(
    [page, other].map((tab) => tab.getByRole('button', { name: 'Fortsett øvingen' }).click()),
  );
  await expect(page.locator('#answer')).toBeFocused();
  await expect(other.locator('#answer')).toBeFocused();
  const id = (await state(page)).progress.p1['set-1'].session.run.id;
  await page.reload();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#answer')).toBeFocused();
  expect((await state(page)).progress.p1['set-1'].session.run.id).toBe(id);
  await Promise.all([answer(page, 'cat'), answer(other, 'cat')]);
  expect((await state(page)).history.p1).toHaveLength(1);
  expect((await state(page)).history.p1[0].id).toBe(id);
  await other.close();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    delete state.history;
    delete state.progress.p1['set-1'].session.run;
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  const before = await state(page);
  await page.reload();
  await expect(page.locator('#complete-view')).toBeVisible();
  expect(await state(page)).toEqual(before);
  await openHistory(page);
  await expect(page.locator('#history-empty')).toBeVisible();
});

test('blocks legacy answers until retry persists or adopts the shared run identity', async ({
  page,
  context,
}) => {
  await seed(page);
  await start(page);
  await answer(page, 'dog');
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('puggern.profile-state'));
    delete saved.progress.p1['set-1'].session.run;
    localStorage.setItem('puggern.profile-state', JSON.stringify(saved));
  });
  await page.reload();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.blockLegacyWrites = true;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'puggern.profile-state' && window.blockLegacyWrites) {
        throw new DOMException('Full', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#answer')).toHaveAttribute('readonly', '');
  await expect(page.locator('#answer-form button[type="submit"]')).toBeDisabled();
  await expect(page.locator('#history-retry')).toBeVisible();

  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(other.locator('#answer')).toBeFocused();
  const sharedId = (await state(other)).progress.p1['set-1'].session.run.id;

  await page.evaluate(() => {
    window.blockLegacyWrites = false;
  });
  await page.getByRole('button', { name: 'Prøv å lagre igjen' }).click();
  await expect(page.locator('#answer-form button[type="submit"]')).toBeEnabled();
  expect((await state(page)).progress.p1['set-1'].session.run.id).toBe(sharedId);
  await Promise.all([answer(page, 'cat'), answer(other, 'cat')]);
  expect((await state(page)).history.p1).toHaveLength(1);
  await other.close();
});

test('legacy resume after editing the set is isolated from a new run of edited content', async ({
  page,
}) => {
  await seed(page);
  await start(page);
  await answer(page, 'dog');
  await page.evaluate(() => {
    const profileState = JSON.parse(localStorage.getItem('puggern.profile-state'));
    delete profileState.progress.p1['set-1'].session.run;
    localStorage.setItem('puggern.profile-state', JSON.stringify(profileState));
    const wordSets = JSON.parse(localStorage.getItem('puggern.word-sets'));
    wordSets.sets[0].words = [
      { id: '0', prompt: 'hest', answer: 'horse' },
      { id: '1', prompt: 'mus', answer: 'mouse' },
    ];
    localStorage.setItem('puggern.word-sets', JSON.stringify(wordSets));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#answer')).toBeFocused();
  await answer(page, 'cat');
  await expect(page.locator('#complete-view')).toBeVisible();
  const legacyResult = (await state(page)).history.p1[0];

  await page.getByRole('button', { name: 'Til ordsettene', exact: true }).click();
  await start(page);
  await answer(page, 'horse');
  await answer(page, 'mouse');
  await expect(page.locator('#complete-view')).toBeVisible();
  const results = (await state(page)).history.p1;
  expect(results).toHaveLength(2);
  const editedResult = results.find(({ id }) => id !== legacyResult.id);
  expect(editedResult.comparisonKey).not.toBe(legacyResult.comparisonKey);
  await openHistory(page);
  await expect(page.locator('#history-variant option')).toHaveCount(2);
});

test('preserves history focus and expansion during cross-tab refreshes', async ({
  page,
  context,
}) => {
  await seed(page);
  await start(page);
  await finish(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('puggern.profile-state'));
    const first = saved.history.p1[0];
    saved.history.p1 = Array.from({ length: 20 }, (_, index) => ({
      ...first,
      id: index === 0 ? first.id : `older-${index}`,
      completedAt: new Date(Date.parse(first.completedAt) - index * 60_000).toISOString(),
    }));
    localStorage.setItem('puggern.profile-state', JSON.stringify(saved));
  });
  await page.reload();
  const focusedRunId = 'older-19';
  const other = await context.newPage();
  await other.goto('/');

  await openHistory(page);
  const focusedItem = page.locator(`[data-history-key="p1:${focusedRunId}"]`);
  const focusedSummary = focusedItem.locator('summary');
  await focusedSummary.focus();
  await page.keyboard.press('Enter');
  await expect(focusedItem.locator('details')).toHaveAttribute('open', '');

  await other.getByRole('button', { name: 'Øv på samme sett igjen' }).click();
  await expect(other.locator('#answer')).toBeFocused();
  await answer(other, 'dog');
  await expect(focusedSummary).toBeFocused();
  await expect(focusedItem.locator('details')).toHaveAttribute('open', '');
  await answer(other, 'cat');
  await expect.poll(async () => (await state(page)).history.p1.length).toBe(21);
  await expect.poll(async () => page.locator('#history-list > li').count()).toBe(21);
  await expect(focusedSummary).toBeFocused();
  await expect(focusedItem.locator('details')).toHaveAttribute('open', '');
  await other.close();
});

test('moves focus to the nearest surviving entry when history retention prunes the focused run', async ({
  page,
  context,
}) => {
  await seed(page);
  await start(page);
  await finish(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('puggern.profile-state'));
    const first = saved.history.p1[0];
    saved.history.p1 = Array.from({ length: 500 }, (_, index) => ({
      ...first,
      id: index === 0 ? first.id : `older-${index}`,
      completedAt: new Date(Date.parse(first.completedAt) - index * 60_000).toISOString(),
    }));
    localStorage.setItem('puggern.profile-state', JSON.stringify(saved));
  });
  await page.reload();
  const other = await context.newPage();
  await other.goto('/');

  await openHistory(page);
  for (let index = 0; index < 24; index += 1) {
    await page.getByRole('button', { name: 'Vis flere', exact: true }).click();
  }
  await expect(page.locator('#history-list > li')).toHaveCount(500);
  const oldest = page.locator('[data-history-key="p1:older-499"]');
  await oldest.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(oldest.locator('details')).toHaveAttribute('open', '');

  await other.getByRole('button', { name: 'Øv på samme sett igjen' }).click();
  await answer(other, 'dog');
  await answer(other, 'cat');
  await expect.poll(async () => (await state(page)).history.p1.length).toBe(500);
  const fallback = page.locator('[data-history-key="p1:older-498"] summary');
  await expect(fallback).toBeFocused();
  await other.close();
});

test('failed completion writes preserve storage and retry exactly once with original ID/time and rewards', async ({
  page,
}) => {
  await seed(page);
  await start(page);
  await answer(page, 'dog');
  const before = await state(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.blockHistoryWrites = true;
    window.failedHistoryWrites = [];
    Storage.prototype.setItem = function (key, value) {
      if (key === 'puggern.profile-state' && window.blockHistoryWrites) {
        window.failedHistoryWrites.push(JSON.parse(value));
        throw new DOMException('Full', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await answer(page, 'cat');
  await expect(page.locator('#complete-view')).toBeVisible();
  await expect(page.locator('#history-save-warning')).toContainText('ikke lagret');
  expect(await state(page)).toEqual(before);
  const attempted = await page.evaluate(() => window.failedHistoryWrites[0].history.p1[0]);
  await page.getByRole('button', { name: 'Prøv å lagre igjen' }).click();
  await expect.poll(() => page.evaluate(() => window.failedHistoryWrites.length)).toBe(2);
  expect(await state(page)).toEqual(before);
  expect(await page.evaluate(() => window.failedHistoryWrites[1].history.p1[0])).toEqual(attempted);
  await page.evaluate(() => {
    window.blockHistoryWrites = false;
  });
  await page.getByRole('button', { name: 'Prøv å lagre igjen' }).click();
  await expect(page.locator('#history-save-warning')).toBeHidden();
  await expect(page.locator('#completion-heading')).toBeFocused();
  expect((await state(page)).history.p1).toEqual([attempted]);
  expect((await state(page)).profiles[0].rewards).toEqual({
    points: 20,
    bestStreak: 2,
    completedSets: 1,
  });
  await page.reload();
  expect((await state(page)).history.p1).toEqual([attempted]);
});

test('Web Locks deduplicate two tabs finishing one run and retain distinct runs and starting-profile ownership', async ({
  page,
  context,
}) => {
  await seed(page);
  await start(page);
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await Promise.all([answer(page, 'dog'), answer(other, 'dog')]);
  await Promise.all([answer(page, 'cat'), answer(other, 'cat')]);
  let saved = await state(page);
  expect(saved.history.p1).toHaveLength(1);
  expect(saved.profiles[0].rewards.completedSets).toBe(1);
  expect(saved.profiles[0].rewards.points).toBe(20);

  for (const tab of [page, other]) {
    await tab.getByRole('button', { name: 'Øv på samme sett igjen' }).click();
    await expect(tab.locator('#answer')).toBeFocused();
  }
  await Promise.all([finish(page), finish(other)]);
  saved = await state(page);
  expect(saved.history.p1).toHaveLength(3);
  expect(saved.profiles[0].rewards.completedSets).toBe(3);
  expect(saved.profiles[0].rewards.points).toBe(60);

  await page.getByRole('button', { name: 'Øv på samme sett igjen' }).click();
  await other.getByRole('button', { name: 'Til ordsettene', exact: true }).click();
  await other.getByLabel('Profil', { exact: true }).selectOption('p2');
  await expect.poll(async () => (await state(page)).activeProfileId).toBe('p2');
  await finish(page);
  saved = await state(page);
  expect(saved.history.p1).toHaveLength(4);
  expect(saved.history.p2).toBeUndefined();
  expect(saved.profiles[1].rewards.completedSets).toBe(0);
  await openHistory(other);
  await expect(other.locator('#history-empty')).toBeVisible();
  await other.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    state.activeProfileId = 'p1';
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  await openHistory(page);
  await expect(page.locator('#history-list > li')).toHaveCount(4);
});

test('history paginates, isolates variants/profiles, preserves deleted set snapshots, and renders names as text', async ({
  page,
}) => {
  await seed(page);
  await start(page);
  await finish(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    const base = state.history.p1[0];
    state.history.p1 = Array.from({ length: 22 }, (_, index) => ({
      ...base,
      id: `run-${String(index).padStart(2, '0')}`,
      completedAt: `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      setName: '<img src=x onerror=alert(1)>',
    }));
    state.history.p1[0].comparisonKey = 'b'.repeat(64);
    state.history.p1[0].caseSensitive = true;
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
    localStorage.setItem('puggern.word-sets', JSON.stringify({ version: 1, sets: [] }));
  });
  await page.reload();
  await openHistory(page);
  await expect(page.locator('#history-list > li')).toHaveCount(20);
  await expect(page.locator('#history-list h3').first()).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#history-list img')).toHaveCount(0);
  await expect(page.locator('#history-chart circle')).toHaveCount(10);
  await expect(page.locator('#history-chart-table tbody tr')).toHaveCount(10);
  await expect(page.locator('#history-chart-table tbody tr').first()).toContainText('13.10.2026');
  await page.getByRole('button', { name: 'Vis flere', exact: true }).click();
  await expect(page.locator('#history-list > li')).toHaveCount(22);
  await expect(page.locator('#history-list > li').nth(20).locator('summary')).toBeFocused();
  await expect(page.locator('#history-more')).toBeHidden();
  await expect(page.locator('#history-status')).toHaveAttribute('aria-live', 'polite');
  await page.locator('#history-variant').selectOption('b'.repeat(64));
  await expect(page.locator('#history-chart circle')).toHaveCount(1);
  await expect(page.locator('#history-comparison')).toContainText('Fullfør en ny');
  await expect(page.locator('#history-status')).toContainText(
    'Utgangspunkt for denne øvingsvarianten',
  );
  await page.keyboard.press('Escape');
  await page.getByLabel('Profil', { exact: true }).selectOption('p2');
  await openHistory(page);
  await expect(page.locator('#history-list > li')).toHaveCount(0);
  await expect(page.locator('#history-empty')).toBeVisible();
});

test('malformed history warns without resetting profile rewards or progress', async ({ page }) => {
  await seed(page);
  await start(page);
  await finish(page);
  const before = await state(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    state.history.p1.push({ broken: true });
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('#history-warning')).toBeVisible();
  expect((await state(page)).profiles).toEqual(before.profiles);
  expect((await state(page)).progress).toEqual(before.progress);
  expect((await state(page)).history).toEqual(before.history);
});

test('unsupported profile versions remain intact rather than being overwritten', async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('puggern.profile-state'));
    saved.version = 2;
    localStorage.setItem('puggern.profile-state', JSON.stringify(saved));
  });

  const before = await state(page);
  await page.reload();
  await expect(page.locator('#app-error')).toContainText('profilversjonen støttes ikke');
  expect(await state(page)).toEqual(before);
  await start(page);
  await expect(page.locator('#progress-warning')).toBeVisible();
  await finish(page);
  expect(await state(page)).toEqual(before);
  await expect(page.locator('#history-save-warning')).toBeVisible();
  await expect(page.locator('#completion-record-message')).toBeEmpty();
});

test('single-tab persistence remains usable without Web Locks', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined });
  });
  await seed(page);
  await start(page);
  await finish(page);
  const before = await state(page);
  expect(before.history.p1).toHaveLength(1);
  await page.reload();
  expect(await state(page)).toEqual(before);
  await openHistory(page);
  await expect(page.locator('#history-list > li')).toHaveCount(1);
});

test('cached history works offline on mobile with reduced motion and equivalent chart/table values', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await start(page);
  await finish(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });
  await context.setOffline(true);
  await page.reload();
  await openHistory(page);
  await expect(page.locator('#history-list > li')).toHaveCount(1);
  await expect(page.locator('#history-chart-table tbody')).toContainText('100 %');
  expect(await page.locator('#history-chart circle').getAttribute('cy')).toBe('20');
  expect(
    await page
      .locator('#history-dialog')
      .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
  ).toBe(true);
  expect(
    await page
      .locator('#history-chart')
      .evaluate((chart) => chart.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#history-button')).toBeFocused();
});

test('dashboard cards, help, table, variant announcement, and responsive layout', async ({
  page,
}) => {
  await seed(page);
  await seedDashboardHistory(page, [
    { firstTryCount: 7, bestStreak: 7, variant: 'c'.repeat(64) },
    { firstTryCount: 7, bestStreak: 8, variant: 'c'.repeat(64) },
    { firstTryCount: 10, bestStreak: 40, variant: 'b'.repeat(64) },
    { firstTryCount: 6, bestStreak: 7 },
    { firstTryCount: 8, bestStreak: 9 },
  ]);
  await openHistory(page);

  await expect(page.locator('#history-help')).not.toHaveAttribute('open', '');
  await expect(page.locator('#history-table-details')).not.toHaveAttribute('open', '');
  await expect(page.locator('#history-latest-value')).toHaveText('80 %');
  await expect(page.locator('#history-latest-detail')).toHaveText('8/10 riktige på første forsøk');
  await expect(page.locator('#history-delta-value')).toHaveText('↑ 20,0 pp');
  await expect(page.locator('#history-delta-detail')).toContainText('høyere');
  await expect(page.locator('#history-best-value')).toHaveText('80 %');
  await expect(page.locator('#history-streak-value')).toHaveText('9');
  await expect(page.locator('#history-chart circle')).toHaveCount(2);
  await expect(page.locator('#history-chart polyline')).toHaveCount(1);
  await expect(page.locator('#history-chart-context')).toContainText(
    'Siste 2 sammenlignbare øvinger',
  );

  const before = await state(page);
  await page.locator('#history-help summary').click();
  await expect(page.locator('#history-help')).toHaveAttribute('open', '');
  await expect(page.locator('#history-help')).toContainText('De siste 500 resultatene');
  await expect(page.locator('#history-help')).toContainText('ikke en daglig rekke');
  await page.locator('#history-table-details summary').click();
  await expect(page.locator('#history-chart-table tbody tr')).toHaveCount(2);
  await expect(page.locator('#history-chart-table tbody')).toContainText('80 %');
  await expect(page.locator('#history-status')).toBeEmpty();
  expect(await state(page)).toEqual(before);

  await page.locator('#history-variant').selectOption('b'.repeat(64));
  await expect(page.locator('#history-latest-value')).toHaveText('100 %');
  await expect(page.locator('#history-delta-value')).toHaveText('—');
  await expect(page.locator('#history-status')).toContainText('Utgangspunkt');
  await page.locator('#history-variant').selectOption('c'.repeat(64));
  await expect(page.locator('#history-delta-value')).toHaveText('—');
  await expect(page.locator('#history-status')).toContainText('Uendret fra forrige');
  await page.locator('#history-variant').selectOption('a'.repeat(64));
  await expect(page.locator('#history-delta-value')).toHaveText('↑ 20,0 pp');
  await expect(page.locator('#history-status')).toContainText('20,0 prosentpoeng høyere');
  await expect(page.locator('#history-chart circle')).toHaveCount(2);
  await expect(page.locator('#history-chart polyline')).toHaveCount(1);
  await expect(page.locator('#history-variant-metadata')).toContainText('Opprinnelig rekkefølge');
  expect(await state(page)).toEqual(before);

  await page.getByRole('button', { name: 'Tilbake til profilen' }).click();
  await openHistory(page);
  await expect(page.locator('#history-help')).not.toHaveAttribute('open', '');
  await expect(page.locator('#history-table-details')).not.toHaveAttribute('open', '');
  await expect(page.locator('#history-latest-value')).toHaveText('80 %');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('#history-metrics .history-metric:visible')).toHaveCount(4);
    expect(
      await page
        .locator('#history-dialog')
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    ).toBe(true);
    await page.locator('#history-table-details summary').click();
    expect(
      await page
        .locator('#history-dialog')
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    ).toBe(true);
    await page.locator('#history-table-details summary').click();
  }

  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('puggern.profile-state'));
    saved.profiles[0].name = 'Profilnavn med maksimalt antall tegn';
    saved.history.p1.forEach((result) => {
      result.setName = 'Ordsett med et langt navn '.repeat(3).slice(0, 80);
    });
    localStorage.setItem('puggern.profile-state', JSON.stringify(saved));
  });
  await page.reload();
  await page.setViewportSize({ width: 640, height: 450 });
  await openHistory(page);
  await expect(page.locator('#history-profile')).toContainText(
    'Profilnavn med maksimalt antall tegn',
  );
  expect(
    await page
      .locator('#history-dialog')
      .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
  ).toBe(true);
});

test('fractional variant changes subtract unrounded first-try accuracy', async ({ page }) => {
  await seed(page);
  await seedDashboardHistory(page, [
    {
      firstTryCount: 1,
      practicedCount: 3,
      bestStreak: 1,
      variant: 'b'.repeat(64),
    },
    {
      firstTryCount: 2,
      practicedCount: 7,
      bestStreak: 2,
      variant: 'b'.repeat(64),
    },
    { firstTryCount: 8, bestStreak: 8 },
  ]);
  await openHistory(page);
  await expect(page.locator('#history-variant option')).toHaveCount(2);
  await page.locator('#history-variant').selectOption('b'.repeat(64));
  await expect(page.locator('#history-latest-value')).toHaveText('29 %');
  await expect(page.locator('#history-delta-value')).toHaveText('↓ 4,8 pp');
  await expect(page.locator('#history-delta-detail')).toContainText('lavere');
  await expect(page.locator('#history-status')).toContainText('4,8 prosentpoeng lavere');
});

test('four-run screenshot fixture keeps the dashboard above the fold at desktop width', async ({
  page,
}) => {
  await seed(page);
  await seedDashboardScreenshotFixture(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHistory(page);
  await expect(page.locator('#history-chart circle')).toHaveCount(4);
  await expect(page.locator('#history-latest-value')).toHaveText('80 %');
  await expect(page.locator('#history-delta-value')).toHaveText('↑ 10,0 pp');
  const positions = await page.evaluate(() => {
    const dialog = document.querySelector('#history-dialog');
    const chart = document.querySelector('#history-chart').getBoundingClientRect();
    const box = dialog.getBoundingClientRect();
    return {
      chartFitsDialog: chart.bottom <= box.bottom,
      dialogFitsViewport: dialog.scrollHeight <= dialog.clientHeight,
      chartVisible: chart.top >= box.top && chart.bottom <= box.bottom,
    };
  });
  expect(positions.chartVisible, JSON.stringify(positions)).toBe(true);
  expect(positions.chartFitsDialog).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator('#history-dialog')
      .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
  ).toBe(true);
});
