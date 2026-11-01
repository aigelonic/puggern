import { expect, test } from '@playwright/test';
import { createSession } from '../../frontend/src/learning.mjs';
import { createProfileState } from '../../frontend/src/profiles.mjs';

const settings = { caseSensitive: false, accentSensitive: false };

function makeSet(id, name, words) {
  const timestamp = new Date().toISOString();
  return {
    id,
    name,
    words,
    direction: 'prompt-to-answer',
    settings,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makeProgress(words, { correction = false, response } = {}) {
  const session = createSession(words, () => 0.999, settings, { orderMode: 'original' });
  session.correction = correction;
  if (correction) session.mistakes[words[0].id] = 1;
  if (response !== undefined) {
    session.correctionAttempt = { wordId: words[0].id, response };
  }
  return { version: 1, session, words };
}

async function seed(
  page,
  { sets, progressByProfile = {}, activeProfileId = 'p1', profileIds } = {},
) {
  const ids = profileIds ?? Object.keys(progressByProfile);
  const profiles = ids.map((id) => ({
    id,
    name: id === activeProfileId ? 'Min profil' : `Profil ${id}`,
    avatar: '',
    rewards: { points: 0, bestStreak: 0, completedSets: 0 },
  }));
  const profileState = createProfileState(ids[0] ?? activeProfileId);
  profileState.profiles = profiles;
  profileState.activeProfileId = activeProfileId;
  profileState.progress = Object.fromEntries(ids.map((id) => [id, progressByProfile[id] ?? {}]));
  await page.goto('/');
  await page.evaluate(
    ({ profileState, sets }) => {
      localStorage.setItem('puggern.profile-state', JSON.stringify(profileState));
      localStorage.setItem('puggern.word-sets', JSON.stringify({ version: 1, sets }));
    },
    { profileState, sets },
  );
  await page.reload();
}

async function continueSet(page, name) {
  const item = page.locator('.word-set-item').filter({ has: page.getByRole('heading', { name }) });
  await item.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#answer')).toBeFocused();
}

async function submit(page, response) {
  await page.locator('#answer').fill(response);
  await page.locator('#answer').press('Enter');
  await expect(page.locator('#answer')).not.toHaveAttribute('readonly', '');
}

test('marks each attempt statically and clears it before the next unaided word', async ({
  page,
}) => {
  const words = [
    { id: 'a', prompt: 'Frukt', answer: 'eple' },
    { id: 'b', prompt: 'Dyr', answer: 'hund' },
  ];
  await seed(page, {
    sets: [makeSet('practice', 'Øving', words)],
    progressByProfile: { p1: { practice: makeProgress(words) } },
    profileIds: ['p1'],
  });
  await continueSet(page, 'Øving');

  await page.locator('#answer').fill('aple');
  await expect(page.locator('#correction-feedback')).toBeHidden();
  await expect(page.locator('#correct-answer [data-difference="true"]')).toHaveCount(0);
  await page.locator('#answer').press('Enter');
  await expect(page.locator('#answer')).not.toHaveAttribute('readonly', '');
  await expect(page.locator('#correct-answer')).toHaveText('eple');
  await expect(page.locator('#submitted-answer')).toHaveText('aple');
  await expect(page.locator('#correction-summary')).toHaveText('Bytt «a» med «e» på plass 1.');
  await expect(page.locator('#correct-answer [data-difference="true"]')).toHaveText('e');
  await expect(page.locator('#submitted-answer [data-difference="true"]')).toHaveText('a');
  await expect(page.locator('#answer')).toBeFocused();
  await expect(page.locator('#answer')).toHaveValue('');

  await page.locator('#answer').fill('eple');
  await expect(page.locator('#submitted-answer')).toHaveText('aple');
  await expect(page.locator('#correction-summary')).toHaveText('Bytt «a» med «e» på plass 1.');
  await page.locator('#answer').press('Enter');
  await expect(page.locator('#prompt')).toHaveText('Dyr');
  await expect(page.locator('#correction-feedback')).toBeHidden();
  await expect(page.locator('#correct-answer [data-difference="true"]')).toHaveCount(0);
  await expect(page.locator('#correction-attempt')).toBeHidden();
  await expect(page.locator('#answer')).toBeFocused();

  await submit(page, 'hand');
  await expect(page.locator('#correct-answer')).toHaveText('hund');
  await expect(page.locator('#submitted-answer')).toHaveText('hand');
  await expect(page.locator('#correct-answer [data-difference="true"]')).toHaveText('u');
  await expect(page.locator('#submitted-answer [data-difference="true"]')).toHaveText('a');
  await submit(page, 'hund');
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
});

test('renders missing, extra, and swapped letters in the relevant rows', async ({ page }) => {
  const words = [
    { id: 'a', prompt: 'Mangler', answer: 'eple' },
    { id: 'b', prompt: 'Ekstra', answer: 'eple' },
    { id: 'c', prompt: 'Byttet', answer: 'eple' },
  ];
  await seed(page, {
    sets: [makeSet('edits', 'Endringer', words)],
    progressByProfile: { p1: { edits: makeProgress(words) } },
    profileIds: ['p1'],
  });
  await continueSet(page, 'Endringer');

  await submit(page, 'epe');
  await expect(page.locator('#correct-answer [data-difference="true"]')).toHaveText('l');
  await expect(page.locator('#submitted-answer [data-difference="true"]')).toHaveCount(0);
  await expect(page.locator('#correction-summary')).toHaveText('Legg til «l» etter plass 2.');
  await submit(page, 'eple');

  await submit(page, 'epple');
  await expect(page.locator('#correct-answer [data-difference="true"]')).toHaveCount(0);
  await expect(page.locator('#submitted-answer [data-difference="true"]')).toHaveText('p');
  await expect(page.locator('#correction-summary')).toHaveText('Ta bort «p» på plass 3.');
  await submit(page, 'eple');

  await submit(page, 'elpe');
  await expect(page.locator('#correct-answer [data-difference="true"]')).toHaveText('pl');
  await expect(page.locator('#submitted-answer [data-difference="true"]')).toHaveText('lp');
  await expect(page.locator('#correction-summary')).toHaveText(
    'Bytt rekkefølgen på «lp» på plass 2–3.',
  );
  await submit(page, 'eple');
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
});

test('preserves visible repeated spaces in both comparison rows', async ({ page }) => {
  const words = [{ id: 'a', prompt: 'Farger', answer: 'rød bil' }];
  await seed(page, {
    sets: [makeSet('spaces', 'Mellomrom', words)],
    progressByProfile: { p1: { spaces: makeProgress(words) } },
    profileIds: ['p1'],
  });
  await continueSet(page, 'Mellomrom');

  await submit(page, 'rød  bil');

  const markedSpace = page.locator('#submitted-answer [data-difference="true"]');
  await expect(markedSpace).toHaveText(' ');
  const rowStyles = await page.evaluate(() =>
    ['#correct-answer', '#submitted-answer'].map(
      (selector) => getComputedStyle(document.querySelector(selector)).whiteSpace,
    ),
  );
  expect(rowStyles).toEqual(['pre-wrap', 'pre-wrap']);
  const markedSpaceWidth = await markedSpace.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(markedSpaceWidth).toBeGreaterThan(0);
});

test('allows an empty submission and renders HTML-like answers literally', async ({ page }) => {
  const htmlAnswer = '<img src=x onerror=alert(1)>';
  const words = [{ id: 'a', prompt: 'Bokstaver', answer: htmlAnswer }];
  await seed(page, {
    sets: [makeSet('literal', 'Bokstaver', words)],
    progressByProfile: { p1: { literal: makeProgress(words) } },
    profileIds: ['p1'],
  });
  await continueSet(page, 'Bokstaver');
  await expect(page.locator('#answer')).not.toHaveAttribute('required', '');

  await page.locator('#answer').fill('');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.locator('#correct-answer')).toHaveText(htmlAnswer);
  await expect(page.locator('#submitted-answer')).toHaveText('Ingen bokstaver');
  await expect(page.locator('#correction-announcement')).toHaveText(
    'Rettelsen vises ved svarfeltet.',
  );
  await expect(page.locator('#answer')).toHaveAccessibleDescription(/Riktig stavemåte.*Legg til/);
  await expect(page.locator('#correction-feedback img')).toHaveCount(0);
  await expect(page.locator('#correction-summary')).toContainText('Legg til');

  await submit(page, htmlAnswer);
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
});

test('keeps answer matching authoritative beyond the comparison storage limit', async ({
  page,
}) => {
  const words = [{ id: 'a', prompt: 'Frukt', answer: 'eple' }];
  await seed(page, {
    sets: [makeSet('long-accepted', 'Frukt', words)],
    progressByProfile: { p1: { 'long-accepted': makeProgress(words) } },
    profileIds: ['p1'],
  });
  await continueSet(page, 'Frukt');

  await submit(page, `${' '.repeat(201)}eple`);

  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await expect(page.locator('#completion-first-try-count')).toHaveText('1');
});

test('shows oversized incorrect attempts plainly without storing them', async ({ page }) => {
  const words = [{ id: 'a', prompt: 'Frukt', answer: 'eple' }];
  await seed(page, {
    sets: [makeSet('long-incorrect', 'Frukt', words)],
    progressByProfile: { p1: { 'long-incorrect': makeProgress(words) } },
    profileIds: ['p1'],
  });
  await continueSet(page, 'Frukt');
  const response = 'x'.repeat(201);
  await submit(page, response);

  await expect(page.locator('#submitted-answer')).toHaveText(response);
  await expect(page.locator('#correction-summary')).toHaveText(
    'Sammenlign stavemåtene for å finne forskjellen.',
  );
  await expect(page.locator('#submitted-answer [data-difference="true"]')).toHaveCount(0);
  const savedAttempt = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('puggern.profile-state')).progress.p1['long-incorrect']
        .session.correctionAttempt,
  );
  expect(savedAttempt).toBeUndefined();
});

test('restores a saved comparison offline and drops legacy or malformed attempts', async ({
  page,
  context,
}) => {
  const words = [{ id: 'a', prompt: 'Frukt', answer: 'eple' }];
  await seed(page, {
    sets: [makeSet('resume', 'Frukt', words)],
    progressByProfile: {
      p1: { resume: makeProgress(words, { correction: true, response: 'aple' }) },
    },
    profileIds: ['p1'],
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await continueSet(page, 'Frukt');
  await expect(page.locator('#submitted-answer')).toHaveText('aple');
  await expect(page.locator('#correct-answer [data-difference="true"]')).toHaveText('e');
  await expect(page.locator('#correction-announcement')).toHaveText(
    'Rettelsen vises ved svarfeltet.',
  );

  await page.locator('#back-button').click();
  const legacySession = makeProgress(words, { correction: true }).session;
  const stateWithoutAttempt = await page.evaluate(
    ({ legacySession }) => {
      const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
      state.progress.p1.resume.session = legacySession;
      localStorage.setItem('puggern.profile-state', JSON.stringify(state));
      return true;
    },
    { legacySession },
  );
  expect(stateWithoutAttempt).toBe(true);
  await page.reload();
  await continueSet(page, 'Frukt');
  await expect(page.locator('#correct-answer')).toHaveText('eple');
  await expect(page.locator('#correction-attempt')).toBeHidden();
  await expect(page.locator('#correction-summary')).toBeHidden();
  await expect(page.locator('#correct-answer [data-difference="true"]')).toHaveCount(0);

  await page.locator('#back-button').click();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    state.progress.p1.resume.session.correctionAttempt = { wordId: 'other', response: 'aple' };
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  await page.reload();
  await continueSet(page, 'Frukt');
  await expect(page.locator('#correction-attempt')).toBeHidden();
  const storedAttempt = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('puggern.profile-state')).progress.p1.resume.session
        .correctionAttempt,
  );
  expect(storedAttempt).toBeUndefined();
});

test('isolates attempts by profile and set and wraps feedback at narrow widths', async ({
  page,
}) => {
  const firstWords = [{ id: 'a', prompt: 'Frukt', answer: 'eple' }];
  const longWords = [
    {
      id: 'b',
      prompt: 'Langt ord',
      answer: 'langt ord '.repeat(18).trim(),
    },
  ];
  const firstSet = makeSet('first', 'Første sett', firstWords);
  const secondSet = makeSet('second', 'Andre sett', longWords);
  const progressByProfile = {
    p1: {
      first: makeProgress(firstWords, { correction: true, response: 'aple' }),
      second: makeProgress(longWords, { correction: true, response: 'feil' }),
    },
    p2: { first: makeProgress(firstWords, { correction: true }) },
  };
  await seed(page, {
    sets: [firstSet, secondSet],
    progressByProfile,
    activeProfileId: 'p2',
    profileIds: ['p1', 'p2'],
  });

  await continueSet(page, 'Første sett');
  await expect(page.locator('#correction-attempt')).toBeHidden();
  await page.locator('#back-button').click();
  await page.locator('#profile-select').selectOption('p1');
  await continueSet(page, 'Første sett');
  await expect(page.locator('#submitted-answer')).toHaveText('aple');
  await page.locator('#back-button').click();
  await continueSet(page, 'Andre sett');
  await expect(page.locator('#submitted-answer')).toHaveText('feil');
  await expect(page.locator('#correction-announcement')).toHaveText(
    'Rettelsen vises ved svarfeltet.',
  );

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.locator('#correction-feedback')).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  const rowWidths = await page
    .locator('#correction-feedback')
    .evaluate((feedback) =>
      [
        ...feedback.querySelectorAll('#correct-answer, #correction-attempt, #correction-summary'),
      ].map((row) => row.scrollWidth <= row.clientWidth),
    );
  expect(rowWidths).toEqual([true, true, true]);
  await page.setViewportSize({ width: 160, height: 800 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test('keeps large-difference live announcements concise', async ({ page }) => {
  const words = [{ id: 'a', prompt: 'Langt ord', answer: 'a'.repeat(150) }];
  await seed(page, {
    sets: [makeSet('long', 'Langt ord', words)],
    progressByProfile: { p1: { long: makeProgress(words) } },
    profileIds: ['p1'],
  });
  await continueSet(page, 'Langt ord');
  await submit(page, 'x'.repeat(150));
  await expect(page.locator('#correct-answer')).toHaveText('a'.repeat(150));
  await expect(page.locator('#correction-summary')).toContainText('Bytt «');
  await expect(page.locator('#correction-announcement')).toContainText('Riktig stavemåte er');
  await expect(page.locator('#correction-announcement')).toContainText(
    'Det er flere endringer i stavemåten.',
  );
});

test('clears a saved comparison when correction is acknowledged and restart begins', async ({
  page,
}) => {
  const words = [{ id: 'a', prompt: 'Frukt', answer: 'eple' }];
  await seed(page, {
    sets: [makeSet('restart', 'Frukt', words)],
    progressByProfile: {
      p1: { restart: makeProgress(words, { correction: true, response: 'aple' }) },
    },
    profileIds: ['p1'],
  });
  await continueSet(page, 'Frukt');
  await expect(page.locator('#submitted-answer')).toHaveText('aple');
  await submit(page, 'eple');
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  const savedSession = await page.evaluate(
    () => JSON.parse(localStorage.getItem('puggern.profile-state')).progress.p1.restart.session,
  );
  expect(savedSession.correctionAttempt).toBeUndefined();
  await page.locator('#completion-restart-button').click();
  await expect(page.locator('#correction-feedback')).toBeHidden();
  await expect(page.locator('#correct-answer [data-difference="true"]')).toHaveCount(0);
});
