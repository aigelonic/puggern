import { expect, test } from '@playwright/test';
import { openProfilePanel } from './helpers.mjs';

test('serves the complete startup module graph as JavaScript', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const modules = new Set();
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('.mjs')) modules.add(response.url());
  });
  await page.goto('/');
  expect([...modules].map((url) => new URL(url).pathname).sort()).toEqual([
    '/src/app-updates.mjs',
    '/src/app-version.mjs',
    '/src/creation-guard.mjs',
    '/src/history-view.mjs',
    '/src/history.mjs',
    '/src/learning.mjs',
    '/src/main.mjs',
    '/src/practice-feedback.mjs',
    '/src/profiles.mjs',
    '/src/share-word-set.mjs',
    '/src/spelling-feedback.mjs',
    '/src/word-sets.mjs',
  ]);
  for (const url of modules) {
    const response = await request.get(url);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toMatch(/^(?:application|text)\/javascript\b/);
  }
  await openProfilePanel(page);
  await page.getByRole('button', { name: 'Legg til profil', exact: true }).click();
  await expect(page.locator('#profile-name')).toBeFocused();
  expect(errors).toEqual([]);
});
