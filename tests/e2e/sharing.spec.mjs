import { expect, test } from '@playwright/test';
import { createShareUrl, parseShareUrl } from '../../frontend/src/share-word-set.mjs';
import { MAX_WORD_SETS } from '../../frontend/src/word-sets.mjs';
import { clickSetAction } from './helpers.mjs';

const content = {
  name: 'Uke 42 🐶',
  words: [{ prompt: 'hund æøå', answer: 'dog 🐕' }],
  direction: 'both',
  settings: { caseSensitive: true, accentSensitive: false },
};

function localSet(index = 0) {
  return {
    ...content,
    id: `old-${index}`,
    words: content.words.map((word) => ({ ...word, id: 'old-word' })),
    archived: false,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

async function saveImport(page) {
  await page.waitForTimeout(300);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Lagre ordsett', exact: true })
    .click();
}

test('query import previews safely and saves only content as a new set with fresh metadata', async ({
  page,
  baseURL,
}) => {
  await page.addInitScript((set) => {
    localStorage.setItem('puggern.word-sets', JSON.stringify({ version: 1, sets: [set] }));
  }, localSet());
  await page.goto(createShareUrl(content, baseURL));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(content.name);
  await expect(dialog).toContainText('hund æøå');
  expect(new URL(page.url()).searchParams.has('share')).toBe(false);
  const profiles = await page.evaluate(() => localStorage.getItem('puggern.profile-state'));
  await saveImport(page);
  await expect(dialog).toBeHidden();
  await expect(page.locator('#word-set-list > li')).toHaveCount(2);
  const sets = await page.evaluate(
    () => JSON.parse(localStorage.getItem('puggern.word-sets')).sets,
  );
  const imported = sets.find((set) => set.id !== 'old-0');
  expect(imported).toMatchObject({
    ...content,
    words: [{ ...content.words[0], id: '0' }],
    archived: false,
  });
  expect(imported.createdAt).not.toBe(localSet().createdAt);
  expect(imported.updatedAt).toBe(imported.createdAt);
  expect(await page.evaluate(() => localStorage.getItem('puggern.profile-state'))).toBe(profiles);
});

test('imports optional language names and renders markup-like labels as plain text', async ({
  page,
  baseURL,
}) => {
  const namedContent = {
    ...content,
    name: 'Markup',
    direction: 'prompt-to-answer',
    promptLanguage: '<em>Norsk</em>',
    answerLanguage: 'English',
  };
  await page.goto(createShareUrl(namedContent, baseURL));
  await saveImport(page);
  const imported = page.locator('#word-set-list > li').first();
  await clickSetAction(imported, 'Rediger');
  await expect(page.getByLabel('Språk for hint (valgfritt)')).toHaveValue('<em>Norsk</em>');
  await expect(page.getByLabel('Språk for svar (valgfritt)')).toHaveValue('English');
  await page.getByRole('button', { name: 'Avbryt', exact: true }).click();

  await clickSetAction(imported, 'Kopier');
  const copy = page.locator('#word-set-list > li').first();
  await clickSetAction(copy, 'Rediger');
  await expect(page.getByLabel('Språk for hint (valgfritt)')).toHaveValue('<em>Norsk</em>');
  await expect(page.getByLabel('Språk for svar (valgfritt)')).toHaveValue('English');
  await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
  await clickSetAction(copy, 'Arkiver');
  await page.getByRole('button', { name: 'Vis arkiv' }).click();
  await clickSetAction(page.locator('#word-set-list > li').first(), 'Gjenopprett');
  await page.getByRole('button', { name: 'Vis aktive ordsett' }).click();
  const restoredCopy = page.locator('#word-set-list > li').first();
  await clickSetAction(restoredCopy, 'Rediger');
  await expect(page.getByLabel('Språk for hint (valgfritt)')).toHaveValue('<em>Norsk</em>');
  await page.getByRole('button', { name: 'Avbryt', exact: true }).click();

  await restoredCopy.getByRole('button', { name: 'Start øving' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start øving' }).click();
  await expect(page.locator('#hint-language')).toHaveText('Hint på <em>Norsk</em>');
  await expect(page.locator('#hint-language em')).toHaveCount(0);
  await expect(page.locator('#answer-language-instruction')).toHaveText('Skriv på English');
});

test('manual paste imports without navigating or fetching the supplied host', async ({ page }) => {
  await page.goto('/');
  const requestedHosts = [];
  page.on('request', (request) => requestedHosts.push(new URL(request.url()).hostname));
  await page.getByRole('button', { name: 'Importer lenke', exact: true }).click();
  await expect(page.locator('#import-link-input')).toBeFocused();
  await page.locator('#import-link-input').fill(createShareUrl(content, 'https://example.test/'));
  await page.getByRole('button', { name: 'Forhåndsvis', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(content.name);
  await saveImport(page);
  await expect(page.getByRole('heading', { name: content.name })).toBeVisible();
  expect(requestedHosts).not.toContain('example.test');
});

test('invalid links and payload text fail safely, with keyboard cancellation and restored focus', async ({
  page,
  baseURL,
}) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Importer lenke', exact: true });
  await trigger.click();
  await page.locator('#import-link-input').fill(`${baseURL}/?share=not-json`);
  await page.getByRole('button', { name: 'Forhåndsvis', exact: true }).click();
  await expect(page.locator('#import-error')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('puggern.word-sets'))).toBeNull();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();

  const maliciousText = '<img src=x onerror=alert(1)>';
  await page.goto(createShareUrl({ ...content, name: maliciousText }, baseURL));
  await expect(page.getByRole('dialog')).toContainText(maliciousText);
  await expect(page.getByRole('dialog').locator('img')).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => localStorage.getItem('puggern.word-sets'))).toBeNull();
});

test('keeps keyboard focus within both import dialog steps', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Importer lenke', exact: true }).click();
  const linkInput = page.locator('#import-link-input');
  const cancelButton = page.locator('#cancel-import-button');
  await linkInput.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(cancelButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(linkInput).toBeFocused();
  await linkInput.fill(createShareUrl(content, 'https://example.test/'));
  await page.getByRole('button', { name: 'Forhåndsvis', exact: true }).click();
  const saveButton = page.locator('#import-save-button');
  await expect(saveButton).toBeVisible();
  await cancelButton.focus();
  await page.keyboard.press('Tab');
  await expect(saveButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(cancelButton).toBeFocused();
});

test('import cannot exceed the global set limit', async ({ page, baseURL }) => {
  await page.addInitScript(
    (sets) => {
      localStorage.setItem('puggern.word-sets', JSON.stringify({ version: 1, sets }));
    },
    Array.from({ length: MAX_WORD_SETS }, (_, index) => localSet(index)),
  );
  await page.goto(createShareUrl(content, baseURL));
  await saveImport(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#import-error')).toContainText('maksimalt 50');
  await expect(page.locator('#import-save-button')).toBeFocused();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('puggern.word-sets')).sets.length),
  ).toBe(MAX_WORD_SETS);
});

test('import enforces creation safeguards without saving a set', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('puggern.creation-attempts', JSON.stringify(Array(5).fill(Date.now())));
  });
  await page.goto(createShareUrl(content, baseURL));
  await saveImport(page);
  await expect(page.locator('#import-error')).toContainText('Vent');
  await expect(page.locator('#import-save-button')).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('puggern.word-sets'))).toBeNull();
});

test('import applies the honeypot and minimum form time guards', async ({ page, baseURL }) => {
  await page.goto(createShareUrl(content, baseURL));
  await page.locator('#import-confirm-form').evaluate((form) => {
    form.querySelector('[name="website"]').value = 'bot';
  });
  await saveImport(page);
  await expect(page.locator('#import-error')).toContainText('Sjekk feltene');
  await page.locator('#import-confirm-form').evaluate((form) => {
    form.querySelector('[name="website"]').value = '';
    form.dataset.openedAt = String(Date.now() + 10_000);
    form.requestSubmit();
  });
  await expect(page.locator('#import-error')).toContainText('Vent et lite øyeblikk');
  expect(await page.evaluate(() => localStorage.getItem('puggern.word-sets'))).toBeNull();
});

test('storage failure stays visible in the preview and can be retried', async ({
  page,
  baseURL,
}) => {
  await page.goto(createShareUrl(content, baseURL));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'puggern.word-sets') throw new Error('Lagringen er full');
      return original.call(this, key, value);
    };
    window.restoreStorage = () => {
      Storage.prototype.setItem = original;
    };
  });
  await saveImport(page);
  await expect(page.locator('#import-error')).toContainText('Lagringen er full');
  await expect(page.locator('#import-save-button')).toBeFocused();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('puggern.word-sets'))).toBeNull();
  await page.evaluate(() => window.restoreStorage());
  await saveImport(page);
  await expect(page.getByRole('heading', { name: content.name })).toBeVisible();
});

test('uses native sharing for active and archived sets without transferring local metadata', async ({
  page,
}) => {
  await page.addInitScript((set) => {
    localStorage.setItem('puggern.word-sets', JSON.stringify({ version: 1, sets: [set] }));
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.sharedData = data;
      },
    });
  }, localSet());
  await page.goto('/');
  await clickSetAction(page.locator('.word-set-item').first(), 'Del');
  await expect.poll(() => page.evaluate(() => window.sharedData?.url)).toBeTruthy();
  const shared = await page.evaluate(() => window.sharedData);
  expect(parseShareUrl(shared.url)).toMatchObject(content);
  expect(shared.url).not.toContain('old-0');
  await clickSetAction(page.locator('.word-set-item').first(), 'Arkiver');
  await page.getByRole('button', { name: 'Vis arkiv', exact: true }).click();
  await page.evaluate(() => {
    window.sharedData = null;
  });
  await clickSetAction(page.locator('.word-set-item').first(), 'Del');
  await expect.poll(() => page.evaluate(() => window.sharedData?.url)).toBeTruthy();
});

test('falls back to clipboard, then a selectable manual link when APIs fail', async ({ page }) => {
  await page.addInitScript((set) => {
    localStorage.setItem('puggern.word-sets', JSON.stringify({ version: 1, sets: [set] }));
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        throw new Error('Not permitted');
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedLink = text;
        },
      },
    });
  }, localSet());
  await page.goto('/');
  await clickSetAction(page.locator('.word-set-item').first(), 'Del');
  await expect.poll(() => page.evaluate(() => window.copiedLink)).toBeTruthy();
  expect(parseShareUrl(await page.evaluate(() => window.copiedLink))).toMatchObject(content);
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('Clipboard unavailable');
    };
  });
  const set = page.locator('.word-set-item').first();
  const trigger = set.locator('.set-action-trigger');
  await clickSetAction(set, 'Del');
  const input = page.locator('#share-link-input');
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  expect(await input.evaluate((element) => element.selectionEnd - element.selectionStart)).toBe(
    (await input.inputValue()).length,
  );
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('native cancellation does not copy and oversized sets never reach sharing APIs', async ({
  page,
}) => {
  const oversized = {
    ...localSet(),
    words: Array.from({ length: 100 }, (_, index) => ({
      id: String(index),
      prompt: 'æ'.repeat(200),
      answer: 'dog',
    })),
  };
  await page.addInitScript(
    (sets) => {
      localStorage.setItem('puggern.word-sets', JSON.stringify({ version: 1, sets }));
      window.nativeShareCount = 0;
      Object.defineProperty(navigator, 'share', {
        value: async () => {
          window.nativeShareCount += 1;
          throw new DOMException('Cancelled', 'AbortError');
        },
      });
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async () => {
            window.clipboardUsed = true;
          },
        },
      });
    },
    [localSet(), { ...oversized, id: 'large', name: 'Stort sett' }],
  );
  await page.goto('/');
  await clickSetAction(page.locator('.word-set-item').filter({ hasText: content.name }), 'Del');
  await expect.poll(() => page.evaluate(() => window.nativeShareCount)).toBe(1);
  expect(await page.evaluate(() => window.clipboardUsed)).toBeUndefined();
  await clickSetAction(page.locator('.word-set-item').filter({ hasText: 'Stort sett' }), 'Del');
  await expect(page.locator('#share-error')).toContainText('Reduser');
  expect(await page.evaluate(() => window.nativeShareCount)).toBe(1);
});

test('manual paste import works offline with the cached app shell', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });
  await context.setOffline(true);
  try {
    await page.goto(createShareUrl(content, baseURL));
    await expect(page.getByRole('dialog')).toContainText(content.name);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Importer lenke', exact: true }).click();
    await page.locator('#import-link-input').fill(createShareUrl(content, baseURL));
    await page.getByRole('button', { name: 'Forhåndsvis', exact: true }).click();
    await saveImport(page);
    await expect(page.getByRole('heading', { name: content.name })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
