import { expect, test } from '@playwright/test';

async function startSet(page, source = 'hund;dog', direction = 'prompt-to-answer') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nytt ordsett' }).click();
  await page.getByLabel('Navn på ordsettet').fill('Øveord');
  await page.getByLabel('Hint og svar').fill(source);
  await page.getByLabel('Quizretning').selectOption(direction);
  await page.getByRole('button', { name: 'Lagre og start øving' }).click();
}

async function answer(page, value) {
  await page.locator('#answer').fill(value);
  await page.locator('#answer').press('Enter');
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
  { source: 'hund;dog', direction: 'both', count: 2 },
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
    await expect(page.locator('#hardest-words')).toHaveText('Ingen vanskelige ord denne gangen.');
    await page.reload();
    await expectCompletion(page, count, count);
    await page.getByRole('button', { name: 'Øv på samme sett igjen' }).click();
    await expect(page.getByLabel('Stavingen din')).toBeFocused();
    await expect(page.locator('#progress-label')).toHaveText(
      `0 av ${count} lært · ${count} oppgaver igjen`,
    );
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('puggern.progress')));
    expect(saved.session.learned).toEqual([]);
    expect(saved.session.mistakes).toEqual({});
    await page.reload();
    await expect(page.getByRole('button', { name: 'Fortsett øvingen' })).toBeVisible();
  });
}

test('resumes corrections offline and counts independent answers, not correction copies', async ({
  page,
  context,
}) => {
  await startSet(page, 'hund;dog', 'both');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  const missedPrompt = await page.locator('#prompt').textContent();
  const answers = { hund: 'dog', dog: 'hund' };
  await answer(page, 'wrong');
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.getByLabel('Skriv ordet én gang')).toBeFocused();
  await answer(page, answers[missedPrompt]);
  await expect(page.locator('#progress-label')).toHaveText('0 av 2 lært · 3 oppgaver igjen');
  await expect(page.locator('#complete-view')).toBeHidden();
  for (let index = 0; index < 3; index += 1) {
    await answer(page, answers[await page.locator('#prompt').textContent()]);
  }
  await expectCompletion(page, 2, 1);
  await expect(page.locator('#hardest-words')).toHaveText(
    `${missedPrompt} → ${answers[missedPrompt]} · 1 feilsvar`,
  );
  await page.reload();
  await expectCompletion(page, 2, 1);
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
