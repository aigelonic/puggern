import { expect, test } from '@playwright/test';

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
    '/src/learning.mjs',
    '/src/main.mjs',
    '/src/profiles.mjs',
    '/src/word-sets.mjs',
  ]);
  for (const url of modules) {
    const response = await request.get(url);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toMatch(/^(?:application|text)\/javascript\b/);
  }
  await page.getByRole('button', { name: 'Legg til profil' }).click();
  await expect(page.locator('#profile-name')).toBeFocused();
  expect(errors).toEqual([]);
});
