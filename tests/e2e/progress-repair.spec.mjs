import { expect, test } from '@playwright/test';

const words = [
  { id: 'a', prompt: 'hund', answer: 'dog' },
  { id: 'b', prompt: 'katt', answer: 'cat' },
  { id: 'c', prompt: 'fugl', answer: 'bird' },
];
const settings = { caseSensitive: false, accentSensitive: false };

function sessionWith(overrides) {
  return {
    queue: [],
    correction: false,
    learned: [],
    mistakes: {},
    settings,
    exerciseConfig: { directionMode: 'forward', orderMode: 'original' },
    points: 0,
    streak: 0,
    bestStreak: 0,
    ...overrides,
  };
}

async function seed(page, { session, practiceWords = words, legacy = false, rewards }) {
  await page.goto('/');
  await page.evaluate(
    ({ session, practiceWords, legacy, rewards, settings }) => {
      const timestamp = new Date().toISOString();
      const progress = { version: 1, session, words: practiceWords };
      localStorage.setItem(
        'puggern.word-sets',
        JSON.stringify({
          version: 1,
          sets: [
            {
              id: 'repair-set',
              name: 'Dyr',
              words: practiceWords,
              direction: 'prompt-to-answer',
              settings,
              archived: false,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        }),
      );
      localStorage.removeItem('puggern.profile-state');
      localStorage.removeItem('puggern.progress');
      if (legacy) {
        localStorage.setItem('puggern.progress', JSON.stringify(progress));
        return;
      }
      localStorage.setItem(
        'puggern.profile-state',
        JSON.stringify({
          version: 1,
          activeProfileId: 'p1',
          profiles: [
            { id: 'p1', name: 'Min profil', avatar: '', rewards },
            {
              id: 'p2',
              name: 'Annen',
              avatar: '',
              rewards: { points: 5, bestStreak: 1, completedSets: 0 },
            },
          ],
          progress: { p1: { 'repair-set': progress }, p2: { 'repair-set': progress } },
        }),
      );
    },
    { session, practiceWords, legacy, rewards, settings },
  );
  await page.reload();
}

const storedState = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('puggern.profile-state')));

async function answer(page, value) {
  await page.locator('#answer').fill(value);
  await page.locator('#answer').press('Enter');
  await expect(page.locator('#answer')).not.toHaveAttribute('readonly', '');
}

const rewards = { points: 10, bestStreak: 1, completedSets: 0 };

test('repairs a seeded duplicate queue on load and each remaining word needs one answer', async ({
  page,
}) => {
  await seed(page, {
    session: sessionWith({
      queue: ['b', 'a', 'c', 'b', 'a'],
      learned: ['a'],
      mistakes: { b: 1 },
      points: 10,
      streak: 1,
      bestStreak: 1,
    }),
    rewards,
  });
  const state = await storedState(page);
  expect(state.progress.p1['repair-set'].session.queue).toEqual(['b', 'c']);
  expect(state.progress.p2['repair-set'].session.queue).toEqual(['b', 'c']);
  expect(state.profiles.map(({ rewards }) => rewards)).toEqual([
    rewards,
    { points: 5, bestStreak: 1, completedSets: 0 },
  ]);

  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#progress-label')).toHaveText('1 av 3 lært · 2 oppgaver igjen');
  await expect(page.locator('#prompt')).toHaveText('katt');
  await answer(page, 'cat');
  await expect(page.locator('#prompt')).toHaveText('fugl');
  await expect(page.locator('#progress-label')).toHaveText('2 av 3 lært · 1 oppgaver igjen');
  await answer(page, 'bird');
  await expect(page.locator('#completion-heading')).toBeFocused();
  await expect(page.locator('#completion-rewards')).toHaveText(
    '30 poeng · Beste rekke: 3 riktige på rad',
  );
  const finished = await storedState(page);
  expect(finished.profiles[0].rewards).toEqual({ points: 30, bestStreak: 3, completedSets: 1 });
  expect(finished.profiles[1].rewards).toEqual({ points: 5, bestStreak: 1, completedSets: 0 });
});

test('keeps correction only while its original word is still pending', async ({ page }) => {
  await seed(page, {
    session: sessionWith({ queue: ['a', 'b', 'a'], correction: true, learned: ['a'] }),
    rewards,
  });
  expect((await storedState(page)).progress.p1['repair-set'].session).toMatchObject({
    queue: ['b'],
    correction: false,
  });

  await seed(page, {
    session: sessionWith({ queue: ['b', 'a', 'b'], correction: true, mistakes: { b: 1 } }),
    rewards,
  });
  expect((await storedState(page)).progress.p1['repair-set'].session).toMatchObject({
    queue: ['b', 'a'],
    correction: true,
  });
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.getByLabel('Skriv ordet én gang')).toBeFocused();
  await expect(page.locator('#correct-answer')).toHaveText('cat');
});

test('a repaired empty queue gives no completion credit and restarts fresh', async ({ page }) => {
  await seed(page, {
    session: sessionWith({ queue: ['a', 'a'], learned: ['a'], points: 10 }),
    practiceWords: [words[0]],
    rewards,
  });
  const state = await storedState(page);
  expect(state.progress.p1['repair-set'].session.queue).toEqual([]);
  expect(state.profiles[0].rewards).toEqual(rewards);
  await expect(page.getByRole('button', { name: 'Fortsett øvingen' })).toHaveCount(0);
  await expect(page.locator('#profile-rewards')).toHaveText(
    '10 poeng totalt · Beste rekke: 1 · 0 sett fullført',
  );

  await page.locator('#completion-restart-button').click();
  await expect(page.locator('#progress-label')).toHaveText('0 av 1 lært · 1 oppgaver igjen');
  await expect(page.locator('#practice-rewards')).toHaveText('0 poeng · 0 riktige på rad');
  await answer(page, 'dog');
  await expect(page.locator('#completion-heading')).toBeFocused();
  expect((await storedState(page)).profiles[0].rewards).toEqual({
    points: 20,
    bestStreak: 1,
    completedSets: 1,
  });
});

test('repairs legacy standalone progress while migrating it into the profile', async ({ page }) => {
  await seed(page, {
    session: sessionWith({ queue: ['a', 'b', 'a', 'c'], learned: ['a'], points: 10 }),
    legacy: true,
  });
  const state = await storedState(page);
  expect(state.progress[state.activeProfileId]['repair-set'].session.queue).toEqual(['b', 'c']);
  expect(state.profiles[0].rewards).toEqual({ points: 0, bestStreak: 0, completedSets: 0 });
  expect(await page.evaluate(() => localStorage.getItem('puggern.progress'))).toBeNull();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#progress-label')).toHaveText('1 av 3 lært · 2 oppgaver igjen');
});

test('a mistake followed by reload and continue never grows or repeats the queue', async ({
  page,
}) => {
  await seed(page, {
    session: sessionWith({ queue: ['a', 'b', 'c'] }),
    rewards: { ...rewards, points: 0 },
  });
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await answer(page, 'dog');
  await answer(page, 'wrong');
  await answer(page, 'wrong again');
  await expect(page.locator('#progress-label')).toHaveText('1 av 3 lært · 2 oppgaver igjen');
  await page.reload();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.getByLabel('Skriv ordet én gang')).toBeFocused();
  await expect(page.locator('#progress-label')).toHaveText('1 av 3 lært · 2 oppgaver igjen');
  await answer(page, 'cat');
  await expect(page.locator('#prompt')).toHaveText('fugl');
  await answer(page, 'bird');
  await expect(page.locator('#completion-message')).toHaveText(
    'Du lærte 3 øveoppføringer. 2 riktige på første forsøk.',
  );

  await page.locator('#completion-restart-button').click();
  await expect(page.locator('#progress-label')).toHaveText('0 av 3 lært · 3 oppgaver igjen');
  await expect(page.locator('#practice-rewards')).toHaveText('0 poeng · 0 riktige på rad');
});
