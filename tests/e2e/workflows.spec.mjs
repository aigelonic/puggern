import { expect, test } from '@playwright/test';

async function saveAfterMinimumTime(page, name) {
  await page.waitForTimeout(300);
  await page.getByRole('button', { name }).click();
  if (name === 'Lagre og start øving') {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Start øving' }).click();
  }
}

test('shows prominent correction feedback and practices a missed word until it is learned', async ({
  page,
}) => {
  await page.goto('/');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');

  await expect(page.getByRole('heading', { name: 'En rød frukt' })).toBeVisible();
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByLabel('Stavingen din').press('Enter');
  const correction = page.locator('#correction-feedback');
  await expect(correction).toBeVisible();
  await expect(correction.locator('.correction-label')).toHaveText('Riktig stavemåte');
  await expect(page.locator('#correct-answer')).toHaveText('eple');
  await expect(page.locator('#correction-instruction')).toHaveText(
    'Skriv riktig svar for å gå videre.',
  );
  await expect(page.locator('#correction-announcement')).toHaveText(
    'Riktig stavemåte er eple. Skriv riktig svar for å gå videre.',
  );
  await expect(page.locator('#correction-announcement')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#answer')).toHaveAttribute(
    'aria-describedby',
    'hint-language answer-language-instruction correction-feedback',
  );
  await expect(page.locator('#answer')).toHaveAccessibleDescription(
    'Hint fra første kolonne Svar fra andre kolonne Ikke helt ennå – prøv igjen! Riktig stavemåte eple Skriv riktig svar for å gå videre.',
  );
  await expect(page.locator('#answer')).toBeFocused();
  await expect(correction).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await expect(page.locator('#progress-label')).toHaveText('0 av 1 lært · 1 oppgaver igjen');
  await page.getByLabel('Skriv riktig svar').fill('feil igjen');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(correction).toBeVisible();
  await expect(page.locator('#progress-label')).toHaveText('0 av 1 lært · 1 oppgaver igjen');
  await expect(page.locator('#practice-rewards')).toHaveText('0 poeng · 0 riktige på rad');
  await page.getByLabel('Skriv riktig svar').fill('eple');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();

  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await expect(page.locator('#completion-practiced-count')).toHaveText('1');
  await expect(page.locator('#completion-first-try-count')).toHaveText('0');
  await expect(page.locator('#completion-extra-practice-count')).toHaveText('1');
  await expect(page.getByText('En rød frukt → eple · 2 feilsvar')).toBeVisible();
  await expect(page.locator('#completion-rewards')).toHaveText(
    '10 poeng · Beste rekke: 1 riktige på rad',
  );
  const saved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    const profile = state.profiles[0];
    return {
      rewards: profile.rewards,
      session: Object.values(state.progress[profile.id])[0].session,
    };
  });

  expect(saved.rewards).toEqual({ points: 10, bestStreak: 1, completedSets: 1 });
  expect(saved.session).toMatchObject({ queue: [], learned: ['0'], mistakes: { 0: 2 } });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await page.getByRole('button', { name: 'Til ordsettene' }).click();
  await expect(page.locator('#profile-rewards')).toHaveText(
    '10 poeng totalt · Beste rekke: 1 · 1 sett fullført',
  );
});

test('keeps mixed-direction language context through correction, reload, and restart', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto('/');
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Språkpar');
  await page.getByLabel('Språk for hint (valgfritt)').fill('Norsk');
  await page.getByLabel('Språk for svar (valgfritt)').fill('Engelsk');
  await page.getByLabel('Hint og svar').fill('hund\tdog\nkatt\tcat');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Lagre og start øving' }).click();
  const config = page.getByRole('dialog');
  await config.locator('#exercise-direction').selectOption('mixed');
  await config.locator('#exercise-order').selectOption('original');
  await config.getByRole('button', { name: 'Start øving' }).click();

  await expect(page.locator('#prompt')).toHaveText('hund');
  await expect(page.locator('#hint-language')).toHaveText('Hint på Norsk');
  await expect(page.locator('#answer-language-instruction')).toHaveText('Skriv på Engelsk');
  await expect(page.locator('#language-context-announcement')).toBeEmpty();
  await expect(page.locator('#answer')).toHaveAttribute(
    'aria-describedby',
    'hint-language answer-language-instruction',
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await page.getByLabel('Stavingen din').fill('wrong');
  await page.getByLabel('Stavingen din').press('Enter');
  await expect(page.locator('#correction-feedback')).toBeVisible();
  await expect(page.locator('#language-context-announcement')).toBeEmpty();
  await expect(page.locator('#answer')).toHaveAttribute(
    'aria-describedby',
    'hint-language answer-language-instruction correction-feedback',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#hint-language')).toHaveText('Hint på Norsk');
  await expect(page.locator('#answer-language-instruction')).toHaveText('Skriv på Engelsk');
  await expect(page.locator('#correction-feedback')).toBeVisible();

  await page.getByLabel('Skriv riktig svar').fill('dog');
  await page.getByLabel('Skriv riktig svar').press('Enter');
  await expect(page.locator('#prompt')).toHaveText('cat');
  await expect(page.locator('#hint-language')).toHaveText('Hint på Engelsk');
  await expect(page.locator('#answer-language-instruction')).toHaveText('Skriv på Norsk');
  await expect(page.locator('#language-context-announcement')).toHaveText(
    'Hint på Engelsk. Skriv på Norsk',
  );
  await page.getByLabel('Stavingen din').fill('katt');
  await page.getByLabel('Stavingen din').press('Enter');
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();

  await page.getByRole('button', { name: 'Øv på samme sett igjen' }).click();
  await expect(page.locator('#hint-language')).toHaveText('Hint på Norsk');
  await expect(page.locator('#answer-language-instruction')).toHaveText('Skriv på Engelsk');
});

test('does not guess the direction of ambiguous legacy cards', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Tvetydig');
  await page.getByLabel('Hint og svar').fill('samme\tsamme');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Lagre og start øving' }).click();
  const config = page.getByRole('dialog');
  await config.locator('#exercise-direction').selectOption('mixed');
  await config.locator('#exercise-order').selectOption('original');
  await config.getByRole('button', { name: 'Start øving' }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
        const [set] = JSON.parse(localStorage.getItem('puggern.word-sets')).sets;
        return Boolean(state.progress[state.activeProfileId][set.id]);
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    const progress =
      state.progress[state.activeProfileId][
        JSON.parse(localStorage.getItem('puggern.word-sets')).sets[0].id
      ];
    delete progress.words[0].sourceDirection;
    delete progress.words[0].hintLanguageLabel;
    delete progress.words[0].answerLanguageInstruction;
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#hint-language')).toHaveText('Språk ikke angitt');
  await expect(page.locator('#answer-language-instruction')).toHaveText('Svar på oversettelsen');
  await expect(page.locator('#progress-label')).toHaveText('0 av 1 lært · 1 oppgaver igjen');
});

test('leaving practice during delayed saving does not reopen correction or replay effects', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await expect(page.getByLabel('Stavingen din')).toBeVisible();

  await page.evaluate(() => {
    window.profileStateLockAcquired = new Promise((resolve) => {
      navigator.locks.request('puggern.profile-state', async () => {
        resolve();
        await new Promise((release) => {
          window.releaseProfileStateLock = release;
        });
      });
    });
  });
  await page.evaluate(() => window.profileStateLockAcquired);

  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByLabel('Stavingen din').press('Enter');
  await expect(page.locator('#answer')).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Ordsett' }).click();
  await page.evaluate(() => window.releaseProfileStateLock());

  await expect(page.locator('#answer')).not.toHaveAttribute('readonly', '');
  await expect(page.locator('#setup-view')).toBeVisible();
  await expect(page.locator('#practice-view')).toBeHidden();
  await expect(page.locator('#correction-announcement')).toBeEmpty();
  await expect(page.locator('[data-effect]')).toHaveCount(0);
});

test('does not exceed the set limit when copies are requested concurrently', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const timestamp = new Date().toISOString();
    const sets = Array.from({ length: 49 }, (_, index) => ({
      id: `set-${index}`,
      name: `Set ${index}`,
      words: [{ id: '0', prompt: 'A clue', answer: 'An answer' }],
      direction: 'prompt-to-answer',
      settings: { caseSensitive: false, accentSensitive: false },
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    localStorage.setItem('puggern.word-sets', JSON.stringify({ version: 1, sets }));
  });
  await page.reload();

  await page.evaluate(() => {
    window.creationLockAcquired = new Promise((resolve) => {
      navigator.locks.request('puggern.creation-attempts', async () => {
        resolve();
        await new Promise((release) => {
          window.releaseCreationLock = release;
        });
      });
    });
  });
  await page.evaluate(() => window.creationLockAcquired);

  const copyButton = page.getByRole('button', { name: 'Kopier' }).first();
  await copyButton.click();
  await copyButton.click();
  await page.evaluate(() => window.releaseCreationLock());

  await expect(page.locator('#word-set-list > li')).toHaveCount(50);
  await expect(page.locator('#setup-error')).toContainText('maksimalt 50');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('puggern.word-sets')).sets.length),
  ).toBe(50);
});

test('wraps long correction spellings on a mobile viewport', async ({ page }) => {
  const longAnswer = 'staving'.repeat(12);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Lange ord');
  await page.getByLabel('Hint og svar').fill(`Et langt ord\t${longAnswer}`);
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await page.getByLabel('Stavingen din').fill('feil');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();

  const correction = page.locator('#correction-feedback');
  const spelling = page.locator('#correct-answer');
  await expect(correction).toBeInViewport();
  await expect(spelling).toHaveText(longAnswer);
  const layout = await spelling.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.height).toBeGreaterThan(layout.lineHeight);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test('completes a single-entry session immediately and supports restart and return to sets', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await page.getByLabel('Stavingen din').fill('eple');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();

  const heading = page.getByRole('heading', { name: 'Godt jobbet!' });
  await expect(heading).toBeVisible();
  await expect(page.locator('#completion-practiced-count')).toHaveText('1');
  await expect(page.locator('#completion-first-try-count')).toHaveText('1');
  await expect(page.locator('#completion-extra-practice-count')).toHaveText('0');
  await expect(page.locator('#answer')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('completion-heading');
  await expect(page.getByText('Ingen ord trengte ekstra øving denne gangen.')).toBeVisible();

  await page.getByRole('button', { name: 'Øv på samme sett igjen' }).click();
  await expect(page.getByRole('heading', { name: 'En rød frukt' })).toBeVisible();
  await expect(page.getByText('0 av 1 lært')).toBeVisible();
  await page.getByLabel('Stavingen din').fill('eple');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await page.locator('#completion-sets-button').click();
  await expect(page.getByRole('heading', { name: 'Ordsettene dine' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Frukt' })).toBeVisible();
});

test('reloads and resumes a saved session during its correction step', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#correction-announcement')).toHaveText('');
  await expect(page.locator('#correction-announcement')).not.toHaveAttribute('hidden');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.locator('#correct-answer')).toHaveText('eple');
  await expect(page.locator('#correction-instruction')).toBeVisible();
  await expect(page.locator('#correction-announcement')).toHaveText(
    'Rettelsen vises ved svarfeltet.',
  );
  await expect(page.locator('#answer')).toBeFocused();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Frukt' })).toBeVisible();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.getByRole('heading', { name: 'En rød frukt' })).toBeVisible();
  await expect(page.getByLabel('Skriv riktig svar')).toBeVisible();
  await expect(page.locator('#correction-feedback')).toBeVisible();
  await expect(page.locator('#correct-answer')).toHaveText('eple');
  await expect(page.locator('#correction-instruction')).toHaveText(
    'Skriv riktig svar for å gå videre.',
  );
  await expect(page.locator('#correction-announcement')).toHaveText(
    'Rettelsen vises ved svarfeltet.',
  );
  await expect(page.locator('#correction-announcement')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#answer')).toHaveAttribute(
    'aria-describedby',
    'hint-language answer-language-instruction correction-feedback',
  );
  await expect(page.locator('#answer')).toHaveAccessibleDescription(
    'Hint fra første kolonne Svar fra andre kolonne Ikke helt ennå – prøv igjen! Riktig stavemåte eple Skriv riktig svar for å gå videre.',
  );
  await expect(page.locator('#answer')).toBeFocused();

  await page.getByRole('button', { name: 'Ordsett' }).click();
  await expect(page.locator('#correction-announcement')).toHaveText('');
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.locator('#correction-announcement')).toHaveText(
    'Rettelsen vises ved svarfeltet.',
  );
  await expect(page.locator('#answer')).toHaveAccessibleDescription(
    'Hint fra første kolonne Svar fra andre kolonne Ikke helt ennå – prøv igjen! Riktig stavemåte eple Skriv riktig svar for å gå videre.',
  );

  await page.getByLabel('Skriv riktig svar').fill('eple');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await expect(page.locator('#completion-first-try-count')).toHaveText('0');
  await expect(page.locator('#completion-extra-practice-count')).toHaveText('1');
});

test('refreshes word-set actions after saving progress and returning to the list', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await expect(page.getByRole('heading', { name: 'En rød frukt' })).toBeVisible();
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.locator('#correct-answer')).toHaveText('eple');
  await page.getByRole('button', { name: 'Ordsett' }).click();

  const set = page.getByRole('listitem').filter({ hasText: 'Frukt' });
  await expect(set.getByRole('button', { name: 'Fortsett øvingen' })).toBeVisible();
  await expect(set.getByRole('button', { name: 'Start øving' })).toHaveCount(0);
});

test('preserves concurrent profile and progress changes across tabs', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.locator('#correct-answer')).toHaveText('eple');

  const otherPage = await context.newPage();
  await otherPage.goto('/');
  await otherPage.getByRole('button', { name: 'Nytt ordsett' }).click();
  await otherPage.getByLabel('Navn på ordsettet').fill('Dyr');
  await otherPage.getByLabel('Hint og svar').fill('Bjeffer\thund');
  await saveAfterMinimumTime(otherPage, 'Lagre og start øving');
  await otherPage.getByLabel('Stavingen din').fill('katt');
  await otherPage.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(otherPage.locator('#correct-answer')).toHaveText('hund');
  await otherPage.getByRole('button', { name: 'Ordsett' }).click();
  await otherPage.getByRole('button', { name: 'Legg til profil' }).click();
  await otherPage.getByLabel('Navn', { exact: true }).fill('Ada');
  await saveAfterMinimumTime(otherPage, 'Lagre profil');
  await expect(otherPage.getByLabel('Profil').locator('option', { hasText: 'Ada' })).toHaveCount(1);

  await page.getByLabel('Skriv riktig svar').fill('feil igjen');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.locator('#progress-label')).toHaveText('0 av 1 lært · 1 oppgaver igjen');
  await page.getByRole('button', { name: 'Ordsett' }).click();
  await page.reload();
  await page.getByLabel('Profil').selectOption({ label: 'Min profil' });

  await expect(page.getByLabel('Profil').locator('option:checked')).toHaveText('Min profil');
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'Frukt' })
      .getByRole('button', { name: 'Fortsett øvingen' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'Dyr' })
      .getByRole('button', { name: 'Fortsett øvingen' }),
  ).toBeVisible();
  await expect(page.getByLabel('Profil').locator('option', { hasText: 'Ada' })).toHaveCount(1);
});

test('loads the latest saved progress when resuming and hides a stale continue action', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await expect(page.getByRole('heading', { name: 'En rød frukt' })).toBeVisible();
  await page.getByRole('button', { name: 'Ordsett' }).click();
  await page.reload();

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    const set = JSON.parse(localStorage.getItem('puggern.word-sets')).sets[0];
    state.progress[state.activeProfileId][set.id] = {
      version: 1,
      words: [{ id: 'updated', prompt: 'Oppdatert hint', answer: 'nytt svar' }],
      session: {
        queue: ['updated'],
        correction: false,
        learned: [],
        mistakes: {},
        settings: { caseSensitive: false, accentSensitive: false },
      },
    };
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  await page.reload();
  const set = page.getByRole('listitem').filter({ hasText: 'Frukt' });
  await set.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.getByRole('heading', { name: 'Oppdatert hint' })).toBeVisible();

  await page.getByRole('button', { name: 'Ordsett' }).click();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    const set = JSON.parse(localStorage.getItem('puggern.word-sets')).sets[0];
    delete state.progress[state.activeProfileId][set.id];
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  await page.reload();
  const refreshedSet = page.getByRole('listitem').filter({ hasText: 'Frukt' });
  await expect(refreshedSet.getByRole('button', { name: 'Fortsett øvingen' })).toHaveCount(0);
  await expect(refreshedSet.getByRole('button', { name: 'Start øving' })).toBeVisible();
});

test('keeps each profile progress separate and offers continue or restart', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.locator('#correct-answer')).toHaveText('eple');
  await page.getByRole('button', { name: 'Ordsett' }).click();

  await page.getByRole('button', { name: 'Legg til profil' }).click();
  await page.getByLabel('Navn', { exact: true }).fill('Ada');
  await page.getByLabel('Valgfri emoji').fill('🐶');
  await saveAfterMinimumTime(page, 'Lagre profil');
  await expect(page.getByLabel('Profil').locator('option', { hasText: 'Ada' })).toHaveCount(1);
  await page.reload();

  let set = page.getByRole('listitem').filter({ hasText: 'Frukt' });
  await expect(set.getByRole('button', { name: 'Start øving' })).toBeVisible();
  await page.getByLabel('Profil').selectOption({ label: 'Min profil' });
  set = page.getByRole('listitem').filter({ hasText: 'Frukt' });
  await expect(set.getByRole('button', { name: 'Fortsett øvingen' })).toBeVisible();
  await expect(set.getByRole('button', { name: 'Start på nytt' })).toBeVisible();

  await set.getByRole('button', { name: 'Start på nytt' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start øving' }).click();
  await expect(page.getByLabel('Stavingen din')).toBeVisible();
  await expect(page.getByLabel('Skriv riktig svar')).toHaveCount(0);
});

test('migrates an older in-progress session into the default profile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.locator('#correct-answer')).toHaveText('eple');
  await page.getByRole('button', { name: 'Ordsett' }).click();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    const set = JSON.parse(localStorage.getItem('puggern.word-sets')).sets[0];
    localStorage.setItem(
      'puggern.progress',
      JSON.stringify(state.progress[state.activeProfileId][set.id]),
    );
    localStorage.removeItem('puggern.profile-state');
  });

  await page.reload();
  const set = page.getByRole('listitem').filter({ hasText: 'Frukt' });
  await set.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.getByLabel('Skriv riktig svar')).toBeVisible();
  await expect(page.locator('#correction-feedback')).toBeVisible();
  await expect(page.locator('#correct-answer')).toHaveText('eple');
});

test('completed practice remains saved and can be restarted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await page.getByLabel('Stavingen din').fill('eple');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await page.getByRole('button', { name: 'Til ordsettene' }).click();

  const set = page.getByRole('listitem').filter({ hasText: 'Frukt' });
  await expect(set).toContainText('Fullført');
  await set.getByRole('button', { name: 'Øv på nytt' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start øving' }).click();
  await expect(page.getByRole('heading', { name: 'En rød frukt' })).toBeVisible();
});

test('opens the cached app shell when offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Klar, ferdig, stav!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nytt ordsett' })).toBeVisible();
});

test('loads completion actions with a populated v2 cache', async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await page.evaluate(async () => {
    const oldCache = await caches.open('puggern-app-shell-v2');
    await oldCache.addAll([
      './',
      './index.html',
      './styles.css',
      './manifest.webmanifest',
      './icons/pug-192.png',
      './icons/pug-512.png',
      './src/learning.mjs',
      './src/word-sets.mjs',
    ]);
    await oldCache.put(
      './src/main.mjs',
      new Response("throw new Error('stale v2 module was loaded');", {
        headers: { 'Content-Type': 'text/javascript' },
      }),
    );

    const currentCache = await caches.open('puggern-app-shell-v4');
    await currentCache.delete('./src/main.mjs');
  });
  await page.reload();

  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await page.getByLabel('Stavingen din').fill('eple');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();

  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await expect(page.locator('#completion-first-try-count')).toHaveText('1');
});

test('completes a practice session while offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();

  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await saveAfterMinimumTime(page, 'Lagre og start øving');
  await page.getByLabel('Stavingen din').fill('eple');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();

  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await expect(page.locator('#completion-first-try-count')).toHaveText('1');
});

test('uses Mixed direction mode for a saved word set configured in both directions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Uke 42');
  await page.getByLabel('Hint og svar').fill('hund;dog\nkatt;cat');
  await page.getByLabel('Quizretning').selectOption('both');

  await expect(page.getByLabel('Hint, linje 1')).toHaveValue('hund');
  await page.getByLabel('Svar, linje 1').fill('hound');
  await saveAfterMinimumTime(page, 'Lagre ordsett');

  const set = page.getByRole('listitem').filter({ hasText: 'Uke 42' });
  await expect(set).toBeVisible();
  await set.getByRole('button', { name: 'Start øving' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#exercise-order').selectOption('original');
  await dialog.getByRole('button', { name: 'Start øving' }).click();
  await expect(page.getByText('0 av 2 lært')).toBeVisible();

  await expect(page.locator('#prompt')).toHaveText('hund');
  await page.getByLabel('Stavingen din').fill('hound');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.locator('#feedback')).toContainText('Riktig! Bra jobbet');
  await expect(page.locator('#prompt')).toHaveText('cat');
  await page.getByLabel('Stavingen din').fill('katt');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();

  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await expect(page.locator('#completion-practiced-count')).toHaveText('2');
  await expect(page.locator('#completion-first-try-count')).toHaveText('2');
  await expect(page.locator('#completion-extra-practice-count')).toHaveText('0');
});

test('highlights malformed entries and supports set editing, duplication, archiving, and deletion', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Uke 43');
  await page.getByLabel('Hint og svar').fill('gyldig; svar\nuten skilletegn');
  await expect(page.getByText(/Linje 2 må inneholde/)).toBeVisible();
  await expect(page.locator('.preview-row.invalid')).toHaveCount(1);
  await saveAfterMinimumTime(page, 'Lagre ordsett');
  await expect(page.getByRole('alert')).toContainText('Rett opp de markerte linjene');
  await expect(page.getByRole('list').filter({ has: page.getByText('Uke 43') })).toHaveCount(0);

  await page.getByLabel('Hint og svar').fill('gyldig; svar');
  await page.getByRole('button', { name: 'Lagre ordsett' }).click();
  let set = page.getByRole('listitem').filter({ hasText: 'Uke 43' });
  await expect(set).toBeVisible();
  await set.getByRole('button', { name: 'Rediger' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Uke 44');
  await page.getByRole('button', { name: 'Lagre ordsett' }).click();

  set = page.getByRole('listitem').filter({ hasText: 'Uke 44' });
  await set.getByRole('button', { name: 'Kopier' }).click();
  await expect(page.getByRole('heading', { name: 'Uke 44 (kopi)' })).toBeVisible();
  set = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Uke 44', exact: true }),
  });
  await set.getByRole('button', { name: 'Arkiver' }).click();
  await page.getByRole('button', { name: 'Vis arkiv' }).click();
  const archivedSet = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Uke 44', exact: true }),
  });
  await expect(archivedSet).toBeVisible();
  await archivedSet.getByRole('button', { name: 'Gjenopprett' }).click();
  await page.getByRole('button', { name: 'Vis aktive ordsett' }).click();
  await expect(page.getByRole('heading', { name: 'Uke 44', exact: true })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Uke 44 (kopi)' })
    .getByRole('button', { name: 'Slett' })
    .click();
  await expect(page.getByRole('heading', { name: 'Uke 44 (kopi)' })).toHaveCount(0);
});

test('keeps malformed rows invalid until repaired and retains preview edits in the source', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Uke 45');
  await page.getByLabel('Hint og svar').fill('to;separator;marks');

  await expect(page.getByText(/Linje 1 må inneholde/)).toBeVisible();
  await expect(page.locator('.preview-row.invalid')).toHaveCount(1);
  await page.getByRole('button', { name: 'Lagre ordsett' }).click();
  await expect(page.getByRole('alert')).toContainText('Rett opp de markerte linjene');

  await page.getByLabel('Svar, linje 1').fill('hound');
  await expect(page.getByLabel('Hint og svar')).toHaveValue('to\thound');
  await page.getByLabel('Hint og svar').fill('to\thound\ncat;kitty');
  await expect(page.getByLabel('Svar, linje 1')).toHaveValue('hound');
  await expect(page.getByLabel('Svar, linje 2')).toHaveValue('kitty');

  await saveAfterMinimumTime(page, 'Lagre ordsett');
  const set = page.getByRole('listitem').filter({ hasText: 'Uke 45' });
  await expect(set).toContainText('2 ord');
});

test('throttles repeated set creation while leaving practice available', async ({ page }) => {
  await page.goto('/');

  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: 'Nytt ordsett' }).click();
    await page.getByLabel('Navn på ordsettet').fill(`Set ${index + 1}`);
    await page.getByLabel('Hint og svar').fill(`Hint ${index + 1}\tSvar ${index + 1}`);
    await page.waitForTimeout(1100);
    await page.getByRole('button', { name: 'Lagre ordsett' }).click();
    await expect(page.getByRole('heading', { name: `Set ${index + 1}` })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Set 6');
  await page.getByLabel('Hint og svar').fill('Hint 6\tSvar 6');
  await page.waitForTimeout(1100);
  await page.getByRole('button', { name: 'Lagre ordsett' }).click();
  await expect(page.getByRole('alert')).toContainText('Vent');
  await expect(page.getByRole('heading', { name: 'Set 6' })).toHaveCount(0);

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Set 1' })
    .getByRole('button', { name: 'Start øving' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start øving' }).click();
  await expect(page.getByRole('heading', { name: 'Hint 1' })).toBeVisible();
});

test('rejects a filled honeypot and an immediately submitted set form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Trygt sett');
  await page.getByLabel('Hint og svar').fill('Hint\tSvar');
  await page.evaluate(() => {
    document.querySelector('#word-set-form').dataset.openedAt = String(Date.now());
  });
  await page.getByRole('button', { name: 'Lagre ordsett' }).click();
  await expect(page.locator('#word-set-creation-error')).toHaveText(
    'Vent et lite øyeblikk før du lagrer.',
  );
  await expect(page.locator('#word-set-creation-error')).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Trygt sett' })).toHaveCount(0);

  await page.waitForTimeout(300);
  await page.locator('#word-set-website').fill('https://spam.invalid');
  await page.getByRole('button', { name: 'Lagre ordsett' }).click();
  await expect(page.locator('#word-set-creation-error')).toHaveText(
    'Kunne ikke lagre. Sjekk feltene og prøv igjen.',
  );
  await expect(page.locator('#word-set-creation-error')).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Trygt sett' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Avbryt' }).click();
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await expect(page.locator('#word-set-creation-error')).toBeHidden();
  await page.getByLabel('Navn på ordsettet').fill('Trygt sett');
  await page.getByLabel('Hint og svar').fill('Hint\tSvar');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Lagre ordsett' }).click();
  await expect(page.getByRole('heading', { name: 'Trygt sett' })).toBeVisible();
});

test('preserves existing sets above the cap while blocking further creation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const timestamp = new Date().toISOString();
    const sets = Array.from({ length: 51 }, (_, index) => ({
      id: `set-${index}`,
      name: `Set ${index}`,
      words: [{ id: '0', prompt: 'Hint', answer: 'Svar' }],
      direction: 'prompt-to-answer',
      settings: { caseSensitive: false, accentSensitive: false },
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    localStorage.setItem('puggern.word-sets', JSON.stringify({ version: 1, sets }));
  });
  await page.reload();

  await expect(page.locator('#new-set-button')).toBeDisabled();
  await expect(page.locator('#set-limit-help')).toBeVisible();
  const contrastRatio = await page.locator('#set-limit-help').evaluate((element) => {
    const toLinear = (channel) => {
      const value = Number(channel) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (color) => {
      const channels = color.match(/[\d.]+/g);
      return (
        0.2126 * toLinear(channels[0]) +
        0.7152 * toLinear(channels[1]) +
        0.0722 * toLinear(channels[2])
      );
    };
    const foreground = luminance(getComputedStyle(element).color);
    const background = luminance(getComputedStyle(document.documentElement).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrastRatio).toBeGreaterThanOrEqual(4.5);
  await expect(page.getByRole('heading', { name: 'Set 50' })).toBeVisible();

  const set = page.getByRole('listitem').filter({ hasText: 'Set 0' });
  await set.getByRole('button', { name: 'Rediger' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Oppdatert sett');
  await page.getByRole('button', { name: 'Lagre ordsett' }).click();
  await expect(page.getByRole('heading', { name: 'Oppdatert sett' })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Oppdatert sett' })
    .getByRole('button', { name: 'Slett' })
    .click();
  await expect(page.locator('#new-set-button')).toBeDisabled();
  await expect(page.locator('#set-limit-help')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Set 1', exact: true }) })
    .getByRole('button', { name: 'Slett' })
    .click();
  await expect(page.locator('#new-set-button')).toBeEnabled();
  await expect(page.locator('#set-limit-help')).toBeHidden();
});

test('shows visible profile creation throttling feedback without blocking practice', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('puggern.creation-attempts', JSON.stringify(Array(5).fill(Date.now())));
  });
  await page.getByRole('button', { name: 'Legg til profil' }).click();
  await page.getByLabel('Navn', { exact: true }).fill('Ada');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Lagre profil' }).click();

  const error = page.locator('#profile-creation-error');
  await expect(error).toContainText('Vent');
  await expect(error).toBeInViewport();
  await expect(page.getByLabel('Profil').locator('option', { hasText: 'Ada' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nytt ordsett' })).toBeEnabled();
});
