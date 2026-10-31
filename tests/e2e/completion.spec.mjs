import { expect, test } from '@playwright/test';

async function saveAfterMinimumTime(page, name, exerciseConfig = {}) {
  await page.waitForTimeout(300);
  await page.getByRole('button', { name }).click();
  const dialog = page.locator('#exercise-config-dialog');
  if (name === 'Lagre og start øving') {
    await expect(dialog).toBeVisible();
    if (exerciseConfig.directionMode) {
      await dialog.locator('#exercise-direction').selectOption(exerciseConfig.directionMode);
    }
    if (exerciseConfig.orderMode) {
      await dialog.locator('#exercise-order').selectOption(exerciseConfig.orderMode);
    }
    await dialog.getByRole('button', { name: 'Start øving' }).click();
  }
}

async function startSet(
  page,
  source = 'hund;dog',
  direction = 'prompt-to-answer',
  exerciseConfig = {},
) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Øveord');
  await page.getByLabel('Hint og svar').fill(source);
  await page.getByLabel('Quizretning').selectOption(direction);
  await saveAfterMinimumTime(page, 'Lagre og start øving', exerciseConfig);
  await expect(page.getByLabel('Stavingen din')).toBeFocused();
}

test('applies reverse direction and original order to the active session', async ({ page }) => {
  await startSet(page, 'hund;dog\nkatt;cat', 'prompt-to-answer', {
    directionMode: 'reverse',
    orderMode: 'original',
  });

  await expect(page.locator('#prompt')).toHaveText('dog');
  const saved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    return Object.values(state.progress[state.activeProfileId])[0];
  });
  expect(saved.session.exerciseConfig).toEqual({
    directionMode: 'reverse',
    orderMode: 'original',
  });
  expect(saved.session.queue).toEqual(['0', '1']);
  await answer(page, 'hund');
  await expect(page.locator('#prompt')).toHaveText('cat');
});

test('restores focus when the exercise setup dialog is canceled', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Øveord');
  await page.getByLabel('Hint og svar').fill('hund;dog');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Lagre og start øving' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Nytt ordsett' })).toBeFocused();

  const set = page.getByRole('listitem').filter({ hasText: 'Øveord' });
  const startButton = set.getByRole('button', { name: 'Start øving' });
  await startButton.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Avbryt' }).click();
  await expect(startButton).toBeFocused();
});

test('restores focus to the saved-set heading when setup is canceled at the set limit', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Øveord');
  await page.getByLabel('Hint og svar').fill('hund;dog');
  await saveAfterMinimumTime(page, 'Lagre ordsett');
  await expect(page.locator('#word-set-form')).toBeHidden();

  await page.evaluate(() => {
    const storage = JSON.parse(localStorage.getItem('puggern.word-sets'));
    const [set] = storage.sets;
    storage.sets = [
      set,
      ...Array.from({ length: 48 }, (_, index) => ({
        ...set,
        id: `extra-${index}`,
        name: `Ekstra ${index}`,
      })),
    ];
    localStorage.setItem('puggern.word-sets', JSON.stringify(storage));
  });
  await page.reload();
  await page.locator('#new-set-button').click();
  await page.getByLabel('Navn på ordsettet').fill('Siste sett');
  await page.getByLabel('Hint og svar').fill('katt;cat');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Lagre og start øving' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Avbryt' }).click();
  await expect(page.locator('#saved-sets-title')).toBeFocused();
});

test('uses one randomized direction per card for a set configured in both directions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await startSet(page, 'hund;dog', 'both', {
    directionMode: 'mixed',
    orderMode: 'original',
  });
  await expect(page.locator('#progress-label')).toHaveText('0 av 1 lært · 1 oppgaver igjen');
  await expect(page.locator('#prompt')).toHaveText('hund');
  await answer(page, 'dog');
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await expect(page.locator('#completion-practiced-count')).toHaveText('1');
});

test('uses both directions and a shuffled order in mixed sessions', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await startSet(page, 'hund;dog\nkatt;cat\nfugl;bird', 'prompt-to-answer', {
    directionMode: 'mixed',
    orderMode: 'shuffled',
  });

  await expect(page.locator('#prompt')).toHaveText('katt');
  const prompts = [];
  const answers = {
    hund: 'dog',
    dog: 'hund',
    katt: 'cat',
    cat: 'katt',
    fugl: 'bird',
    bird: 'fugl',
  };
  for (let index = 0; index < 3; index += 1) {
    const currentPrompt = await page.locator('#prompt').textContent();
    prompts.push(currentPrompt);
    await answer(page, answers[currentPrompt]);
  }
  expect(new Set(prompts)).toEqual(new Set(['hund', 'katt', 'bird']));
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
});

async function answer(page, value) {
  await page.locator('#answer').fill(value);
  await page.locator('#answer').press('Enter');
  await expect(
    page.getByRole('button', { name: 'Sjekk svaret', includeHidden: true }),
  ).toBeEnabled();
}

async function expectCompletion(page, learned, firstTry) {
  const heading = page.getByRole('heading', { name: 'Godt jobbet!' });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.locator('#completion-message')).toHaveText(
    `Du lærte ${learned} øveoppføringer. ${firstTry} riktige på første forsøk.`,
  );
  await expect(page.locator('#answer')).toBeHidden();
  await page.locator('#answer').evaluate((input) => input.focus());
  await expect(heading).toBeFocused();
  await expect(page.getByRole('button', { name: 'Fortsett øvingen' })).toBeHidden();
}

for (const { source, direction, count } of [
  { source: 'hund;dog', direction: 'prompt-to-answer', count: 1 },
  { source: 'hund;dog\nkatt;cat', direction: 'prompt-to-answer', count: 2 },
  { source: 'hund;dog', direction: 'both', count: 1 },
]) {
  test(`completes ${count} entries in ${direction} on the final answer and restarts cleanly`, async ({
    page,
  }) => {
    await startSet(page, source, direction);
    const answers = { hund: 'dog', katt: 'cat', dog: 'hund' };
    for (let index = 0; index < count; index += 1) {
      await answer(page, answers[await page.locator('#prompt').textContent()]);
    }
    await expectCompletion(page, count, count);
    await expect(page.locator('#hardest-words')).toHaveText(
      'Ingen ord trengte ekstra øving denne gangen.',
    );
    await page.reload();
    await expectCompletion(page, count, count);
    await page.getByRole('button', { name: 'Øv på samme sett igjen' }).click();
    await expect(page.getByLabel('Stavingen din')).toBeFocused();
    await expect(page.locator('#progress-label')).toHaveText(
      `0 av ${count} lært · ${count} oppgaver igjen`,
    );
    const saved = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
      return Object.values(state.progress[state.activeProfileId])[0];
    });
    expect(saved.session.learned).toEqual([]);
    expect(saved.session.mistakes).toEqual({});
    await page.reload();
    await expect(page.getByRole('button', { name: 'Fortsett øvingen' })).toBeVisible();
  });
}

test('regenerates mixed directions from source words when restarting', async ({ page }) => {
  await page.addInitScript(() => {
    let call = 0;
    Math.random = () => (call++ < 2 ? 0 : 0.99);
  });
  await startSet(page, 'hund;dog\nkatt;cat', 'prompt-to-answer', {
    directionMode: 'mixed',
    orderMode: 'original',
  });
  await expect(page.locator('#prompt')).toHaveText('hund');
  await answer(page, 'dog');
  await expect(page.locator('#prompt')).toHaveText('cat');
  await answer(page, 'katt');
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();

  await page.getByRole('button', { name: 'Øv på samme sett igjen' }).click();

  await expect(page.locator('#prompt')).toHaveText('dog');
  const saved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    return Object.values(state.progress[state.activeProfileId])[0];
  });
  expect(saved.words.map(({ prompt }) => prompt)).toEqual(['dog', 'katt']);
  expect(saved.session.exerciseConfig.directionMode).toBe('mixed');
});

test('rebuilds legacy both-direction progress as one mixed question per source word', async ({
  page,
}) => {
  await startSet(page, 'hund;dog\nkatt;cat', 'both', {
    directionMode: 'mixed',
    orderMode: 'original',
  });
  const answers = { hund: 'dog', dog: 'hund', katt: 'cat', cat: 'katt' };
  for (let index = 0; index < 2; index += 1) {
    await answer(page, answers[await page.locator('#prompt').textContent()]);
  }
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    const progress = Object.values(state.progress[state.activeProfileId])[0];
    const set = JSON.parse(localStorage.getItem('puggern.word-sets')).sets[0];
    progress.words = set.words.flatMap(({ id, prompt, answer }) => [
      { id: `${id}:forward`, prompt, answer },
      { id: `${id}:reverse`, prompt: answer, answer: prompt },
    ]);
    progress.session.learned = progress.words.map(({ id }) => id);
    delete progress.session.exerciseConfig;
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await page.getByRole('button', { name: 'Øv på samme sett igjen' }).click();

  await expect(page.locator('#progress-label')).toHaveText('0 av 2 lært · 2 oppgaver igjen');
  const saved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    return Object.values(state.progress[state.activeProfileId])[0];
  });
  expect(saved.words).toHaveLength(2);
  expect(saved.session.exerciseConfig.directionMode).toBe('mixed');
});

test('focuses the saved-set heading when returning to a full set list', async ({ page }) => {
  await startSet(page);
  await answer(page, 'dog');
  await expectCompletion(page, 1, 1);
  await page.evaluate(() => {
    const storage = JSON.parse(localStorage.getItem('puggern.word-sets'));
    const [set] = storage.sets;
    storage.sets = [
      set,
      ...Array.from({ length: 49 }, (_, index) => ({
        ...set,
        id: `extra-${index}`,
        name: `Ekstra ${index}`,
      })),
    ];
    localStorage.setItem('puggern.word-sets', JSON.stringify(storage));
  });
  await page.reload();
  await expectCompletion(page, 1, 1);

  await page.getByRole('button', { name: 'Til ordsettene' }).click();

  await expect(page.locator('#new-set-button')).toBeDisabled();
  await expect(page.locator('#saved-sets-title')).toBeFocused();
});

test('resumes corrections offline and finishes with one correct answer', async ({
  page,
  context,
}) => {
  await startSet(page, 'hund;dog', 'both');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.getByLabel('Stavingen din')).toBeFocused();
  const missedPrompt = await page.locator('#prompt').textContent();
  const answers = { hund: 'dog', dog: 'hund' };
  await answer(page, 'wrong');
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.getByLabel('Skriv ordet én gang')).toBeFocused();
  await answer(page, answers[missedPrompt]);
  await expectCompletion(page, 1, 0);
  await expect(page.locator('#hardest-words')).toHaveText(
    `${missedPrompt} → ${answers[missedPrompt]} · 1 feilsvar`,
  );
  await page.reload();
  await expectCompletion(page, 1, 0);
  await page.getByRole('button', { name: 'Til ordsettene' }).click();
  await expect(page.getByRole('heading', { name: 'Øveord' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fortsett øvingen' })).toBeHidden();
});

test('shows completion even when saving the final answer fails', async ({ page }) => {
  await startSet(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    };
  });
  await answer(page, 'dog');
  await expectCompletion(page, 1, 1);
  await expect(page.getByRole('alert')).toContainText('Fremgangen kunne ikke lagres');
  await page.getByRole('button', { name: 'Til ordsettene' }).click();
  await expect(page.getByRole('button', { name: 'Fortsett øvingen' })).toBeHidden();
});

test('restores the latest summary for the active profile after revisiting an older set', async ({
  page,
}) => {
  await startSet(page);
  await answer(page, 'dog');
  await expectCompletion(page, 1, 1);
  await page.getByRole('button', { name: 'Lag et nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Flere ord');
  await page.getByLabel('Hint og svar').fill('katt;cat\nfugl;bird');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await expect(page.getByLabel('Stavingen din')).toBeFocused();
  const answers = { katt: 'cat', fugl: 'bird' };
  for (let index = 0; index < 2; index += 1) {
    await answer(page, answers[await page.locator('#prompt').textContent()]);
  }
  await expectCompletion(page, 2, 2);
  await page.getByRole('button', { name: 'Til ordsettene' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Øveord' })
    .getByRole('button', { name: 'Øv på nytt' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start øving' }).click();
  await expect(page.getByLabel('Stavingen din')).toBeFocused();
  await answer(page, 'dog');
  await expectCompletion(page, 1, 1);
  await page.reload();
  await expectCompletion(page, 1, 1);
  await page.getByRole('button', { name: 'Til ordsettene' }).click();
  await page.getByRole('button', { name: 'Legg til profil' }).click();
  await page.getByLabel('Navn', { exact: true }).fill('Ny profil');
  await saveAfterMinimumTime(page, 'Lagre profil');
  await expect(page.getByLabel('Profil').locator('option:checked')).toHaveText('Ny profil');
  await page.reload();
  await expect(page.locator('#complete-view')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start øving' })).toHaveCount(2);
});

test('restores continue when storage recovers during an unfinished session', async ({ page }) => {
  await startSet(page);
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    let failOnce = true;
    Storage.prototype.setItem = function (...args) {
      if (failOnce) {
        failOnce = false;
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return setItem.apply(this, args);
    };
  });
  await answer(page, 'wrong');
  await expect(page.getByRole('alert')).toContainText('Fremgangen kunne ikke lagres');
  await answer(page, 'still wrong');
  await expect(page.locator('#progress-warning')).toBeHidden();
  await page.locator('#back-button').click();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#progress-label')).toHaveText('0 av 1 lært · 1 oppgaver igjen');
  await answer(page, 'dog');
  await expectCompletion(page, 1, 0);
});

test('restarts a summary for its original profile after another tab switches profiles', async ({
  page,
  context,
}) => {
  await startSet(page);
  await answer(page, 'dog');
  await expectCompletion(page, 1, 1);
  const otherPage = await context.newPage();
  await otherPage.goto('/');
  await otherPage.getByRole('button', { name: 'Til ordsettene' }).click();
  await otherPage.getByRole('button', { name: 'Legg til profil' }).click();
  await otherPage.getByLabel('Navn', { exact: true }).fill('Ny profil');
  await saveAfterMinimumTime(otherPage, 'Lagre profil');
  await expect(otherPage.getByLabel('Profil').locator('option:checked')).toHaveText('Ny profil');
  await otherPage.getByRole('button', { name: 'Start øving' }).click();
  await otherPage.getByRole('dialog').getByRole('button', { name: 'Start øving' }).click();
  await expect(otherPage.getByLabel('Stavingen din')).toBeFocused();
  await answer(otherPage, 'wrong');
  await expect(otherPage.getByLabel('Skriv ordet én gang')).toBeFocused();
  await expect(page.getByLabel('Profil').locator('option:checked')).toHaveText('Ny profil');
  await page.getByRole('button', { name: 'Øv på samme sett igjen' }).click();
  await expect(page.getByLabel('Stavingen din')).toBeFocused();
  const progress = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    return state.profiles.map((profile) => Object.values(state.progress[profile.id])[0].session);
  });
  expect(progress[0].queue).toHaveLength(1);
  expect(progress[0].learned).toEqual([]);
  expect(progress[1].correction).toBe(true);
  expect(Object.values(progress[1].mistakes)).toEqual([1]);
});

test('starts pending setup for the profile that opened it after another tab switches profiles', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Øveord');
  await page.getByLabel('Hint og svar').fill('hund;dog');
  await saveAfterMinimumTime(page, 'Lagre ordsett');
  await expect(page.locator('#word-set-form')).toBeHidden();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Øveord' })
    .getByRole('button', { name: 'Start øving' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const otherPage = await context.newPage();
  await otherPage.goto('/');
  await otherPage.getByRole('button', { name: 'Legg til profil' }).click();
  await otherPage.getByLabel('Navn', { exact: true }).fill('Ny profil');
  await saveAfterMinimumTime(otherPage, 'Lagre profil');
  await otherPage.getByRole('button', { name: 'Start øving' }).click();
  await otherPage.getByRole('dialog').getByRole('button', { name: 'Start øving' }).click();
  await answer(otherPage, 'wrong');
  await expect(otherPage.locator('#correction-feedback')).toBeVisible();
  await expect(page.locator('#profile-select option:checked')).toHaveText('Ny profil');

  await page.getByRole('dialog').getByRole('button', { name: 'Start øving' }).click();
  await expect(page.getByLabel('Stavingen din')).toBeFocused();
  const sessions = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    return Object.fromEntries(
      state.profiles.map((profile) => [
        profile.name,
        Object.values(state.progress[profile.id])[0]?.session,
      ]),
    );
  });
  expect(sessions['Min profil'].correction).toBe(false);
  expect(sessions['Min profil'].queue).toHaveLength(1);
  expect(sessions['Ny profil'].correction).toBe(true);
});

test('resumes an unfinished in-memory session after saving fails', async ({ page }) => {
  await startSet(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    };
  });
  await answer(page, 'wrong');
  await expect(page.getByRole('alert')).toContainText('Fremgangen kunne ikke lagres');
  await page.locator('#back-button').click();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.getByLabel('Skriv ordet én gang')).toBeFocused();
  await expect(page.locator('#progress-label')).toHaveText('0 av 1 lært · 1 oppgaver igjen');
});

test('saves points and combos across reloads and rewards each word once', async ({ page }) => {
  await startSet(page, 'hund;dog\nkatt;cat\nfugl;bird');
  const answers = { hund: 'dog', katt: 'cat', fugl: 'bird' };
  const progress = page.getByRole('progressbar');
  await expect(progress).toHaveAttribute('value', '0');
  await expect(progress).toHaveAttribute('max', '3');
  await answer(page, answers[await page.locator('#prompt').textContent()]);
  await expect(page.locator('#practice-rewards')).toHaveText('10 poeng · 1 riktige på rad');
  await expect(progress).toHaveAttribute('value', '1');
  await page.reload();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#practice-rewards')).toHaveText('10 poeng · 1 riktige på rad');
  await answer(page, 'wrong');
  await expect(page.locator('#practice-rewards')).toHaveText('10 poeng · 0 riktige på rad');
  await answer(page, answers[await page.locator('#prompt').textContent()]);
  await expect(page.locator('#practice-rewards')).toHaveText('20 poeng · 1 riktige på rad');
  await expect(page.locator('#progress-label')).toHaveText('2 av 3 lært · 1 oppgaver igjen');
  await answer(page, answers[await page.locator('#prompt').textContent()]);
  await expectCompletion(page, 3, 2);
  await expect(page.locator('#completion-rewards')).toHaveText(
    '30 poeng · Beste rekke: 2 riktige på rad',
  );
  await expect(page.locator('.celebration')).toBeVisible();
  await page.reload();
  await expectCompletion(page, 3, 2);
  await page.getByRole('button', { name: 'Øv på samme sett igjen' }).click();
  await expect(page.locator('#practice-rewards')).toHaveText('0 poeng · 0 riktige på rad');
  for (let index = 0; index < 3; index += 1) {
    await answer(page, answers[await page.locator('#prompt').textContent()]);
  }
  await page.getByRole('button', { name: 'Til ordsettene' }).click();
  await expect(page.locator('#profile-rewards')).toHaveText(
    '60 poeng totalt · Beste rekke: 3 · 2 sett fullført',
  );
  await page.getByRole('button', { name: 'Legg til profil' }).click();
  await page.getByLabel('Navn', { exact: true }).fill('Ny profil');
  await saveAfterMinimumTime(page, 'Lagre profil');
  await expect(page.locator('#profile-rewards')).toHaveText(
    '0 poeng totalt · Beste rekke: 0 · 0 sett fullført',
  );
  await page.getByLabel('Profil', { exact: true }).selectOption({ label: 'Min profil' });
  await expect(page.locator('#profile-rewards')).toHaveText(
    '60 poeng totalt · Beste rekke: 3 · 2 sett fullført',
  );
});

test('keeps pending rewards on save failure and credits them once when storage recovers', async ({
  page,
}) => {
  await startSet(page, 'hund;dog\nkatt;cat');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    let failOnce = true;
    Storage.prototype.setItem = function (...args) {
      if (failOnce) {
        failOnce = false;
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return setItem.apply(this, args);
    };
  });
  const answers = { hund: 'dog', katt: 'cat' };
  await answer(page, answers[await page.locator('#prompt').textContent()]);
  await expect(page.locator('#progress-warning')).toBeVisible();
  await answer(page, answers[await page.locator('#prompt').textContent()]);
  await expectCompletion(page, 2, 2);
  await expect(page.locator('#progress-warning')).toBeHidden();
  await page.reload();
  await expectCompletion(page, 2, 2);
  await page.getByRole('button', { name: 'Til ordsettene' }).click();
  await expect(page.locator('#profile-rewards')).toHaveText(
    '20 poeng totalt · Beste rekke: 2 · 1 sett fullført',
  );
});

test('shows a static celebration with reduced motion and fits a narrow viewport', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 700 });
  await startSet(page);
  await answer(page, 'dog');
  await expectCompletion(page, 1, 1);
  await expect(page.locator('.celebration')).toHaveCSS('animation-name', 'none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Øv på samme sett igjen' })).toBeFocused();
});
