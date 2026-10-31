import { expect, test } from '@playwright/test';
import { openProfilePanel, clickSetAction } from './helpers.mjs';
import { homeFixture, seedHome } from './fixtures/home.mjs';

async function storageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
}

test('profile panel is read-only, keyboard reachable and preserves entered profile text outside', async ({
  page,
}) => {
  await seedHome(page);
  await page.goto('/');
  const chip = page.locator('#profile-chip');
  const panel = page.locator('#profile-panel');
  const before = await storageSnapshot(page);
  await expect(panel).toBeHidden();
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('body')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.brand')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#sound-toggle')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(chip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#profile-select')).toBeFocused();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(chip).toBeFocused();
  await openProfilePanel(page);
  await page.getByRole('button', { name: 'Ferdig', exact: true }).click();
  await expect(chip).toBeFocused();
  await openProfilePanel(page);
  await chip.click();
  await expect(panel).toBeHidden();
  await openProfilePanel(page);
  await page.locator('#setup-greeting').click({ position: { x: 5, y: 5 } });
  await expect(panel).toBeHidden();
  expect(await storageSnapshot(page)).toEqual(before);
  await page.reload();
  await expect(panel).toBeHidden();
  expect(await storageSnapshot(page)).toEqual(before);
  await openProfilePanel(page);
  await page.locator('#new-profile-button').click();
  await page.locator('#profile-name').fill('Ikke mist dette');
  await page.locator('#setup-greeting').click({ position: { x: 5, y: 5 } });
  await expect(panel).toBeVisible();
  await expect(page.locator('#profile-name')).toHaveValue('Ikke mist dette');
  await page.locator('#cancel-profile-button').click();
  await expect(page.locator('#new-profile-button')).toBeFocused();
  await page.locator('#setup-greeting').click({ position: { x: 5, y: 5 } });
  await expect(panel).toBeHidden();
});

test('switch updates greeting, rewards, progress and history; failed switch stays open', async ({
  page,
}) => {
  await seedHome(page);
  await page.goto('/');
  await expect(page.locator('#profile-chip')).toHaveAccessibleName(
    'Profil: 🦊 Ola. Bytt eller legg til profil',
  );
  await expect(page.locator('#setup-greeting')).toHaveText('Hei, 🦊 Ola!');
  await expect(page.getByRole('button', { name: 'Fortsett øvingen', exact: true })).toHaveCount(1);
  await openProfilePanel(page);
  await page.locator('#profile-select').selectOption('second-profile');
  await expect(page.locator('#profile-panel')).toBeHidden();
  await expect(page.locator('#profile-chip')).toBeFocused();
  await expect(page.locator('#profile-announcement')).toHaveText('Byttet til Ada');
  await expect(page.locator('#setup-greeting')).toHaveText('Hei, 🐱 Ada!');
  await expect(page.locator('#greeting-rewards')).toHaveText(
    '30 poeng · Beste rekke: 2 · 1 sett fullført',
  );
  await expect(page.getByRole('button', { name: 'Fortsett øvingen', exact: true })).toHaveCount(0);
  await page.locator('#history-button').click();
  await expect(page.locator('#history-dialog')).toContainText('Ada');
  await page.keyboard.press('Escape');
  await expect(page.locator('#history-button')).toBeFocused();
  await openProfilePanel(page);
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'puggern.profile-state') throw new Error('Fullt lager');
      return setItem.call(this, key, value);
    };
  });
  await page.locator('#profile-select').selectOption('home-profile');
  await expect(page.locator('#profile-panel')).toBeVisible();
  await expect(page.locator('#profile-select')).toHaveValue('second-profile');
  await expect(page.locator('#setup-greeting')).toHaveText('Hei, 🐱 Ada!');
});

test('cross-tab refresh preserves panel and focus while updating safely rendered names', async ({
  page,
  context,
}) => {
  await seedHome(page);
  await page.goto('/');
  await openProfilePanel(page);
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('puggern.profile-state'));
    state.profiles[0].name = '<b>Ola</b>';
    state.profiles[0].rewards.points = 40;
    localStorage.setItem('puggern.profile-state', JSON.stringify(state));
  });
  await expect(page.locator('#profile-chip')).toContainText('<b>Ola</b>');
  await expect(page.locator('#setup-greeting')).toHaveText('Hei, 🦊 <b>Ola</b>!');
  await expect(page.locator('#profile-select option:checked')).toHaveText('🦊 <b>Ola</b>');
  await expect(page.locator('#profile-panel')).toBeVisible();
  await expect(page.locator('#profile-select')).toBeFocused();
  await expect(page.locator('#profile-rewards')).toContainText('40 poeng');
  await expect(page.locator('#profile-chip b, #setup-greeting b')).toHaveCount(0);
});

test('default greeting, toolbar, friendly empty views and editor opener focus', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#setup-greeting')).toHaveText('Klar, ferdig, stav!');
  expect(await storageSnapshot(page)).toEqual({});
  await expect(page.locator('#history-button')).toBeVisible();
  await expect(page.locator('#profile-panel #history-button')).toHaveCount(0);
  await expect(page.locator('#empty-sets')).toContainText('Ingen ordsett ennå.');
  await expect(page.getByRole('button', { name: 'Nytt ordsett', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Importer lenke', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Lag ditt første ordsett', exact: true }).click();
  await expect(page.locator('#word-set-name')).toBeFocused();
  const placement = await page.evaluate(() => {
    const form = document.querySelector('#word-set-form');
    const list = document.querySelector('#word-set-list');
    const toolbar = document.querySelector('.saved-sets-heading');
    return Boolean(
      toolbar.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING &&
      form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(placement).toBe(true);
  await page.locator('#cancel-edit-button').click();
  await expect(page.locator('#empty-create-button')).toBeFocused();
  await page.locator('#archive-toggle').click();
  await expect(page.locator('#empty-sets')).toContainText('Ingen arkiverte ordsett.');
  await expect(page.locator('#empty-create-button')).toBeHidden();
  await expect(page.locator('#empty-import-button')).toBeHidden();
});

test('sharing privacy is in both dialogs, not the home page; empty import uses the same flow', async ({
  page,
}) => {
  await seedHome(page);
  await page.goto('/');
  const warning = /Ikke del sensitive opplysninger/;
  await expect(page.locator('#setup-view')).not.toContainText(warning);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await clickSetAction(page.locator('#word-set-list > li').first(), 'Del');
  for (const id of ['#share-link-help', '#import-help']) {
    await expect(page.locator(id)).toContainText(/navn,\s+ord,\s+retning og\s+innstillinger/);
    await expect(page.locator(id)).toContainText(/ikke profiler eller\s+fremgang/);
    await expect(page.locator(id)).toContainText(/alle som har lenken/);
    await expect(page.locator(id)).toContainText(/historikk og\s+meldinger/);
    await expect(page.locator(id)).toContainText(warning);
  }
  await page.locator('#close-share-link-button').click();
  await page.evaluate(() => localStorage.removeItem('puggern.word-sets'));
  await page.reload();
  await page.locator('#empty-import-button').click();
  await expect(page.locator('#import-link-dialog')).toBeVisible();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`word sets and practice are above the fold at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedHome(page, { count: viewport.width === 390 ? 3 : 5 });
    await page.goto('/');
    const cards = page.locator('#word-set-list > li');
    await expect(cards).toHaveCount(viewport.width === 390 ? 3 : 5);
    const visibleCount = viewport.width === 390 ? 1 : 4;
    for (let index = 0; index < visibleCount; index += 1) {
      const button = cards.nth(index).locator('.practice-action.primary');
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const greeting = await page.locator('#setup-greeting').boundingBox();
    const toolbar = await page.locator('.saved-sets-heading').boundingBox();
    if (viewport.width === 390) expect(toolbar.y - greeting.y).toBeLessThanOrEqual(120);
    if (viewport.width === 1280) {
      const first = await cards.nth(0).boundingBox();
      const second = await cards.nth(1).boundingBox();
      expect(first.y).toBe(second.y);
      expect(first.height).toBe(second.height);
      expect(second.x).toBeGreaterThan(first.x);
    }
    for (const id of ['#sound-toggle', '#profile-chip', '#history-button']) {
      const target = await page.locator(id).boundingBox();
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
  });
}

for (const width of [320, 640]) {
  test(`long names and action menus stay inside ${width}px including expanded panel`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedHome(page, { name: 'Etveldiglangtprofilnavnutenmellomrommmmmmm' });
    await page.goto('/');
    for (const open of [false, true]) {
      if (open) await openProfilePanel(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const chip = await page.locator('#profile-chip').boundingBox();
      expect(chip.height).toBeGreaterThanOrEqual(44);
      expect(chip.x + chip.width).toBeLessThanOrEqual(width);
    }
    await page.keyboard.press('Escape');
    await page.locator('.set-action-trigger').first().click();
    const menu = await page.locator('.set-action-menu[open] .set-action-menu-items').boundingBox();
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width);
  });
}

test('fixture has valid unchanged browser formats', async ({ page }) => {
  const data = homeFixture();
  await seedHome(page);
  await page.goto('/');
  expect(await storageSnapshot(page)).toEqual(data);
});

test('editor save and cancel restore toolbar and card opener; returning from practice closes panel', async ({
  page,
}) => {
  await seedHome(page);
  await page.goto('/');
  await page.locator('#new-set-button').click();
  await page.locator('#word-set-name').fill('Nye ord');
  await page.locator('#word-set').fill('hei; hello');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Lagre ordsett', exact: true }).click();
  await expect(page.locator('#word-set-form')).toBeHidden();
  await expect(page.locator('#new-set-button')).toBeFocused();
  const set = page.locator('#word-set-list > li').first();
  await clickSetAction(set, 'Rediger');
  await expect(page.locator('#word-set-name')).toBeFocused();
  await page.locator('#cancel-edit-button').click();
  await expect(set.locator('.set-action-trigger')).toBeFocused();
  await set.getByRole('button', { name: 'Start øving', exact: true }).click();
  await page
    .locator('#exercise-config-dialog')
    .getByRole('button', { name: 'Start øving' })
    .click();
  await openProfilePanel(page);
  await page.locator('#profile-done-button').click();
  await page.locator('#back-button').click();
  await expect(page.locator('#profile-panel')).toBeHidden();
  await expect(page.locator('body')).toBeFocused();
});

test('new profile activation updates chip and greeting without changing set storage', async ({
  page,
}) => {
  await seedHome(page);
  await page.goto('/');
  const before = (await storageSnapshot(page))['puggern.word-sets'];
  await openProfilePanel(page);
  await page.locator('#new-profile-button').click();
  await page.locator('#profile-name').fill('<em>Ny</em>');
  await page.locator('#profile-avatar').fill('🐶');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Lagre profil', exact: true }).click();
  await expect(page.locator('#profile-panel')).toBeHidden();
  await expect(page.locator('#profile-chip')).toBeFocused();
  await expect(page.locator('#profile-chip')).toContainText('🐶 <em>Ny</em>');
  await expect(page.locator('#setup-greeting')).toHaveText('Hei, 🐶 <em>Ny</em>!');
  await expect(page.locator('#profile-chip em, #setup-greeting em')).toHaveCount(0);
  expect((await storageSnapshot(page))['puggern.word-sets']).toBe(before);
});

test('new controls keep visible focus and boundaries with forced colors and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 844 });
  await seedHome(page);
  await page.goto('/');
  await page.locator('#sound-toggle').focus();
  const focus = await page.locator('#sound-toggle').evaluate((element) => {
    const style = getComputedStyle(element);
    return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(focus.outline).not.toBe('none');
  expect(focus.width).toBeGreaterThan(0);
  await openProfilePanel(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('#new-set-button').click();
  await expect(page.locator('#word-set-name')).toBeFocused();
});

test('profile panel pushes mobile content down and is right anchored on desktop', async ({
  page,
}) => {
  await seedHome(page);
  await page.goto('/');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const before = await page.locator('#setup-greeting').boundingBox();
    await openProfilePanel(page);
    const panel = await page.locator('#profile-panel').boundingBox();
    const after = await page.locator('#setup-greeting').boundingBox();
    const chip = await page.locator('#profile-chip').boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    if (width === 390) {
      expect(after.y).toBeGreaterThan(before.y);
      expect(panel.width).toBeGreaterThan(width - 40);
    } else {
      expect(after.y).toBe(before.y);
      expect(Math.abs(panel.x + panel.width - chip.x - chip.width)).toBeLessThanOrEqual(2);
    }
    await page.locator('#profile-done-button').click();
  }
});
