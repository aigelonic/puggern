import { expect, test } from '@playwright/test';
import { openProfilePanel, clickSetAction } from './helpers.mjs';
import { seedHome } from './fixtures/home.mjs';

test('debug focus after back', async ({ page }) => {
  await seedHome(page);
  await page.goto('/');
  const set = page.locator('#word-set-list > li').first();
  await set.getByRole('button', { name: 'Start øving', exact: true }).click();
  await page
    .locator('#exercise-config-dialog')
    .getByRole('button', { name: 'Start øving' })
    .click();
  await openProfilePanel(page);
  await page.locator('#profile-done-button').click();
  await page.locator('#back-button').click();
  await page.waitForTimeout(200);
  console.log('active element id:', await page.evaluate(() => document.activeElement.id));
  console.log('active element tag:', await page.evaluate(() => document.activeElement.tagName));
});
