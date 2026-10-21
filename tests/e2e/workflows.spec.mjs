import { expect, test } from '@playwright/test';

test('creates a set and practices a missed word until it is learned', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await page.getByRole('button', { name: 'Lagre og start øving' }).click();

  await expect(page.getByRole('heading', { name: 'En rød frukt' })).toBeVisible();
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(
    page.getByText('Riktig stavemåte er eple. Skriv ordet én gang, så kommer det tilbake senere.'),
  ).toBeVisible();

  await page.getByLabel('Skriv ordet én gang').fill('eple');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.getByText('Takk! Dette ordet kommer tilbake litt senere.')).toBeVisible();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByLabel('Stavingen din').fill('eple');
    await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  }

  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await expect(page.getByText('eple · 1 forsøk')).toBeVisible();
});

test('reloads and resumes a saved session during its correction step', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await page.getByRole('button', { name: 'Lagre og start øving' }).click();
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Frukt' })).toBeVisible();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.getByRole('heading', { name: 'En rød frukt' })).toBeVisible();
  await expect(page.getByLabel('Skriv ordet én gang')).toBeVisible();
  await expect(page.getByText(/Riktig stavemåte er eple/)).toBeVisible();
});

test('loads the latest saved progress when resuming and hides a stale continue action', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await page.getByRole('button', { name: 'Lagre og start øving' }).click();
  await page.getByRole('button', { name: 'Ordsett' }).click();

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
  await page.getByRole('button', { name: 'Lagre og start øving' }).click();
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await page.getByRole('button', { name: 'Ordsett' }).click();

  await page.getByRole('button', { name: 'Legg til profil' }).click();
  await page.getByLabel('Navn', { exact: true }).fill('Ada');
  await page.getByLabel('Valgfri emoji').fill('🐶');
  await page.getByRole('button', { name: 'Lagre profil' }).click();
  await page.reload();

  let set = page.getByRole('listitem').filter({ hasText: 'Frukt' });
  await expect(set.getByRole('button', { name: 'Start øving' })).toBeVisible();
  await page.getByLabel('Profil').selectOption({ label: 'Min profil' });
  set = page.getByRole('listitem').filter({ hasText: 'Frukt' });
  await expect(set.getByRole('button', { name: 'Fortsett øvingen' })).toBeVisible();
  await expect(set.getByRole('button', { name: 'Start på nytt' })).toBeVisible();

  await set.getByRole('button', { name: 'Start på nytt' }).click();
  await expect(page.getByLabel('Stavingen din')).toBeVisible();
  await expect(page.getByLabel('Skriv ordet én gang')).toHaveCount(0);
});

test('migrates an older in-progress session into the default profile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await page.getByRole('button', { name: 'Lagre og start øving' }).click();
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
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
  await expect(page.getByLabel('Skriv ordet én gang')).toBeVisible();
});

test('completed practice remains saved and can be restarted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Frukt');
  await page.getByLabel('Hint og svar').fill('En rød frukt\teple');
  await page.getByRole('button', { name: 'Lagre og start øving' }).click();
  await page.getByLabel('Stavingen din').fill('eple');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await page.getByRole('button', { name: 'Til ordsettene' }).click();

  const set = page.getByRole('listitem').filter({ hasText: 'Frukt' });
  await expect(set).toContainText('Fullført');
  await set.getByRole('button', { name: 'Øv på nytt' }).click();
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

test('creates and practices a saved word set in both directions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Uke 42');
  await page.getByLabel('Hint og svar').fill('hund;dog');
  await page.getByLabel('Quizretning').selectOption('both');

  await expect(page.getByLabel('Hint, linje 1')).toHaveValue('hund');
  await page.getByLabel('Svar, linje 1').fill('hound');
  await page.getByRole('button', { name: 'Lagre ordsett' }).click();

  const set = page.getByRole('listitem').filter({ hasText: 'Uke 42' });
  await expect(set).toBeVisible();
  await set.getByRole('button', { name: 'Start øving' }).click();
  await expect(page.getByText('0 av 2 lært')).toBeVisible();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const currentPrompt = await page.locator('#prompt').textContent();
    await page.getByLabel('Stavingen din').fill(currentPrompt === 'hund' ? 'hound' : 'hund');
    await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Lagre ordsett' }).click();
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

  await page.getByRole('button', { name: 'Lagre ordsett' }).click();
  const set = page.getByRole('listitem').filter({ hasText: 'Uke 45' });
  await expect(set).toContainText('2 ord');
});
