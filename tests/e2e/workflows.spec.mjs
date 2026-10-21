import { expect, test } from '@playwright/test';

test('creates a set and practices a missed word until it is learned', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Ordsettet ditt').fill('En rød frukt\teple');
  await page.getByRole('button', { name: /Start øvingen/ }).click();

  await expect(page.getByRole('heading', { name: 'En rød frukt' })).toBeVisible();
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();
  await expect(page.getByText('Riktig stavemåte er eple. Skriv ordet én gang, så kommer det tilbake senere.')).toBeVisible();

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
  await page.getByLabel('Ordsettet ditt').fill('En rød frukt\teple');
  await page.getByRole('button', { name: /Start øvingen/ }).click();
  await page.getByLabel('Stavingen din').fill('pære');
  await page.getByRole('button', { name: 'Sjekk svaret' }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Fortsett øvingen' }).click();
  await expect(page.getByRole('heading', { name: 'En rød frukt' })).toBeVisible();
  await expect(page.getByLabel('Skriv ordet én gang')).toBeVisible();
  await expect(page.getByText(/Riktig stavemåte er eple/)).toBeVisible();
});

test('opens the cached app shell when offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Klar, ferdig, stav!' })).toBeVisible();
  await expect(page.getByLabel('Ordsettet ditt')).toBeVisible();
});