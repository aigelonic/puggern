import { expect, test } from '@playwright/test';
import { createProfileState } from '../../frontend/src/profiles.mjs';
import { openProfilePanel } from './helpers.mjs';

async function savedData(page) {
  return page.evaluate(() => ({
    profiles: JSON.parse(localStorage.getItem('puggern.profile-state')),
    wordSets: localStorage.getItem('puggern.word-sets'),
  }));
}

let errors;

test.beforeEach(async ({ page }) => {
  await page.addInitScript((state) => {
    if (localStorage.getItem('puggern.profile-state') === null) {
      localStorage.setItem('puggern.profile-state', JSON.stringify(state));
    }
  }, createProfileState('profile-fixture'));
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('keeps profile help text readable over the patterned page background', async ({ page }) => {
  await page.goto('/');
  await openProfilePanel(page);
  const ratios = await page.locator('#profile-help').evaluate((element) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([red, green, blue]) =>
      0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    const parseRgb = (value) => value.match(/\d+/g).slice(0, 3).map(Number);
    const text = luminance(parseRgb(getComputedStyle(element).color));
    const pageBackground = luminance(
      parseRgb(getComputedStyle(document.documentElement).backgroundColor),
    );
    const [dotColor] = getComputedStyle(document.body).backgroundImage.match(/rgb\([^)]+\)/g) ?? [];
    const dotBackground = luminance(parseRgb(dotColor));
    return [pageBackground, dotBackground].map((background) => {
      const [lighter, darker] = [background, text].sort((a, b) => b - a);
      return (lighter + 0.05) / (darker + 0.05);
    });
  });
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
});

for (const returning of [false, true]) {
  for (const avatar of ['', '🐶']) {
    test(`opens, cancels, reopens and saves a profile ${avatar ? 'with' : 'without'} emoji in a ${returning ? 'returning' : 'fresh'} context`, async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('#profile-select option')).toHaveCount(1);
      if (returning) {
        await page.getByRole('button', { name: 'Nytt ordsett' }).click();
        await page.getByLabel('Navn på ordsettet').fill('Frukt');
        await page.getByLabel('Hint og svar').fill('En rød frukt\teple\nEn gul frukt\tbanan');
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: 'Lagre og start øving' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Start øving' }).click();
        await expect(page.locator('#prompt')).toBeVisible();
        const prompt = await page.locator('#prompt').textContent();
        await page.getByLabel('Stavingen din').fill(prompt === 'En rød frukt' ? 'eple' : 'banan');
        await page.getByRole('button', { name: 'Sjekk svaret' }).click();
        await expect(page.locator('#profile-rewards')).toContainText('10 poeng totalt');
        await page.locator('#back-button').click();
        await page.reload();
        await expect(page.getByRole('button', { name: 'Fortsett øvingen' })).toBeVisible();
      }
      const before = await savedData(page);
      const form = page.locator('#profile-form');
      const name = page.locator('#profile-name');
      const emoji = page.locator('#profile-avatar');
      const add = page.getByRole('button', { name: 'Legg til profil', exact: true });
      await expect(form).toBeHidden();
      await openProfilePanel(page);
      await add.focus();
      await page.keyboard.press('Enter');
      await expect(form).toBeVisible();
      await expect(name).toBeFocused();
      await name.fill('Avbrutt');
      await emoji.fill('🐱');
      await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
      await expect(form).toBeHidden();
      await expect(add).toBeFocused();
      await expect(name).toHaveValue('');
      await expect(emoji).toHaveValue('');
      expect(await savedData(page)).toEqual(before);

      await openProfilePanel(page);
      await add.click();
      await expect(form).toBeVisible();
      await expect(name).toBeFocused();
      await name.fill('Ada');
      await emoji.fill(avatar);
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: 'Lagre profil' }).click();
      await expect(form).toBeHidden();
      await expect(page.locator('#profile-chip')).toBeFocused();
      await expect(page.locator('#profile-select option')).toHaveCount(2);
      await expect(page.locator('#profile-select option:checked')).toHaveText(
        avatar ? `${avatar} Ada` : 'Ada',
      );
      const after = await savedData(page);
      expect(after.wordSets).toBe(before.wordSets);
      expect(after.profiles.profiles.slice(0, -1)).toEqual(before.profiles.profiles);
      for (const [id, progress] of Object.entries(before.profiles.progress)) {
        expect(after.profiles.progress[id]).toEqual(progress);
      }
      expect(after.profiles.profiles.at(-1)).toEqual({
        id: after.profiles.activeProfileId,
        name: 'Ada',
        avatar,
        rewards: { points: 0, bestStreak: 0, completedSets: 0 },
      });
      await page.reload();
      await expect(page.locator('#profile-select option:checked')).toHaveText(
        avatar ? `${avatar} Ada` : 'Ada',
      );
      expect(await savedData(page)).toEqual(after);
      await openProfilePanel(page);
      await add.click();
      await expect(name).toBeFocused();
      await expect(name).toHaveValue('');
      await expect(emoji).toHaveValue('');
    });
  }
}

test('shows validation and storage errors without adding a profile', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#profile-select option')).toHaveCount(1);
  const before = await savedData(page);
  await openProfilePanel(page);
  await page.getByRole('button', { name: 'Legg til profil', exact: true }).click();
  await page.locator('#profile-name').fill('   ');
  await page.getByRole('button', { name: 'Lagre profil' }).click();
  await expect(page.locator('#app-error')).toHaveText('Skriv inn et profilnavn.');
  await expect(page.locator('#profile-name')).toBeFocused();
  expect(await savedData(page)).toEqual(before);
  await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
  await expect(page.locator('#app-error')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Legg til profil', exact: true })).toBeFocused();
  await openProfilePanel(page);
  await page.getByRole('button', { name: 'Legg til profil', exact: true }).click();
  await expect(page.locator('#app-error')).toBeHidden();

  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'puggern.profile-state') {
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
  });
  await page.locator('#profile-name').fill('Ada');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Lagre profil' }).click();
  await expect(page.locator('#app-error')).toContainText('Kunne ikke lagre profilen:');
  await expect(page.locator('#profile-form')).toBeVisible();
  await expect(page.locator('#profile-name')).toHaveValue('Ada');
  expect(await savedData(page)).toEqual(before);
  await expect(page.locator('#profile-select option')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#profile-select option')).toHaveCount(1);
});

test('enforces ten profiles even when another tab fills the last slot while the form is open', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#profile-select option')).toHaveCount(1);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    for (let index = 1; index < 9; index += 1) {
      const id = `existing-${index}`;
      state.profiles.push({ id, name: `Profil ${index}`, avatar: '' });
      state.progress[id] = {};
    }
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('#profile-select option')).toHaveCount(9);
  await openProfilePanel(page);
  await page.getByRole('button', { name: 'Legg til profil', exact: true }).click();
  await page.locator('#profile-name').fill('Ada');
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    state.profiles.push({ id: 'last-slot', name: 'Siste profil', avatar: '' });
    state.progress['last-slot'] = {};
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  const before = await savedData(page);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Lagre profil' }).click();
  await expect(page.locator('#app-error')).toContainText('maksimalt 10 profiler');
  expect(await savedData(page)).toEqual(before);
  await page.reload();
  await expect(page.locator('#profile-select option')).toHaveCount(10);
  await openProfilePanel(page);
  await expect(page.getByRole('button', { name: 'Legg til profil', exact: true })).toBeDisabled();
});
