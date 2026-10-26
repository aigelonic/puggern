import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createShareUrl,
  parseShareUrl,
  MAX_SHARE_URL_LENGTH,
  SHARE_PARAM,
} from '../frontend/src/share-word-set.mjs';
import {
  MAX_LANGUAGE_NAME_LENGTH,
  MAX_WORD_LENGTH,
  MAX_WORDS_PER_SET,
} from '../frontend/src/learning.mjs';
import { MAX_WORD_SET_NAME_LENGTH } from '../frontend/src/word-sets.mjs';

const set = {
  name: ' Uke 42 🐶 ',
  words: [{ id: 'old-id', prompt: ' hund æøå ', answer: ' 犬 🐕 ' }],
  direction: 'both',
  settings: { caseSensitive: false, accentSensitive: true },
};
const payload = (content = set) => ({ v: 1, type: 'word-set-share', set: content });
const link = (data) =>
  `https://example.test/?share=${Buffer.from(JSON.stringify(data)).toString('base64url')}`;

test('roundtrips Unicode content with trimmed edges and fresh, unique runtime word IDs', () => {
  const url = createShareUrl(
    { ...set, words: [...set.words, ...set.words] },
    'https://example.test/app/?old=secret#fragment',
  );
  assert.equal(SHARE_PARAM, 'share');
  assert.match(new URL(url).searchParams.get(SHARE_PARAM), /^[A-Za-z0-9_-]+$/);
  assert.equal(new URL(url).hash, '');
  assert.equal(new URL(url).searchParams.has('old'), false);
  assert.deepEqual(parseShareUrl(url), {
    ...set,
    name: 'Uke 42 🐶',
    words: [
      { id: '0', prompt: 'hund æøå', answer: '犬 🐕' },
      { id: '1', prompt: 'hund æøå', answer: '犬 🐕' },
    ],
  });
});

test('only exports explicitly allowed content, never local metadata or profile data', () => {
  const url = createShareUrl(
    {
      ...set,
      id: 'private-id',
      archived: true,
      createdAt: 'old',
      updatedAt: 'old',
      profile: { name: 'private' },
      progress: { score: 99 },
      settings: { ...set.settings, private: 'secret' },
    },
    'https://example.test/',
  );
  const exported = JSON.parse(
    Buffer.from(new URL(url).searchParams.get(SHARE_PARAM), 'base64url').toString(),
  );
  assert.deepEqual(exported, {
    v: 1,
    type: 'word-set-share',
    set: {
      name: 'Uke 42 🐶',
      words: [{ prompt: 'hund æøå', answer: '犬 🐕' }],
      direction: 'both',
      settings: set.settings,
    },
  });

  const imported = parseShareUrl(link({ ...payload(), set: { ...set, id: 'untrusted' } }));
  assert.equal('id' in imported, false);
});

test('roundtrips optional language names and preserves old links without them', () => {
  const namedSet = {
    ...set,
    promptLanguage: '  Norsk ',
    answerLanguage: '<img src=x>',
  };
  const imported = parseShareUrl(createShareUrl(namedSet, 'https://example.test/'));
  assert.deepEqual(imported, {
    ...set,
    name: set.name.trim(),
    promptLanguage: 'Norsk',
    answerLanguage: '<img src=x>',
    words: [{ id: '0', prompt: 'hund æøå', answer: '犬 🐕' }],
  });
  assert.deepEqual(parseShareUrl(link(payload())), {
    ...set,
    name: set.name.trim(),
    words: [{ id: '0', prompt: 'hund æøå', answer: '犬 🐕' }],
  });
});

test('rejects unsupported types, versions, malformed JSON, encoding and URLs', () => {
  for (const data of [
    null,
    [],
    {},
    { ...payload(), v: 2 },
    { ...payload(), v: '1' },
    { ...payload(), type: 'other' },
  ]) {
    assert.throws(() => parseShareUrl(link(data)), /typen eller versjonen/);
  }
  for (const encoded of ['a', '%%%bad', 'e30=', 'e30+', 'e30/', '_w', 'ey', 'ew']) {
    assert.throws(() => parseShareUrl(`https://example.test/?share=${encoded}`), /ugyldig koding/);
  }
  for (const input of [
    '',
    '/?share=e30',
    'javascript:alert(1)',
    'file:///test?share=e30',
    'https://user@example.test/?share=e30',
    'https://example.test/',
    'https://example.test/?share=',
    `${link(payload())}&share=e30`,
    null,
  ]) {
    assert.throws(() => parseShareUrl(input));
  }
});

test('validates every imported content field and existing effective limits', () => {
  for (const invalid of [
    null,
    [],
    { ...set, name: '' },
    { ...set, name: '  ' },
    { ...set, name: 7 },
    { ...set, name: 'n'.repeat(MAX_WORD_SET_NAME_LENGTH + 1) },
    { ...set, words: [] },
    { ...set, words: {} },
    { ...set, words: Array(MAX_WORDS_PER_SET + 1).fill(set.words[0]) },
    { ...set, words: [null] },
    { ...set, words: [{ prompt: ' ', answer: 'ok' }] },
    { ...set, words: [{ prompt: 'ok', answer: false }] },
    { ...set, words: [{ prompt: 'hello\nworld', answer: 'ok' }] },
    { ...set, words: [{ prompt: 'hello\rworld', answer: 'ok' }] },
    { ...set, words: [{ prompt: 'ok', answer: 'hello\nworld' }] },
    { ...set, words: [{ prompt: 'ok', answer: 'hello\rworld' }] },
    { ...set, words: [{ prompt: 'p'.repeat(MAX_WORD_LENGTH + 1), answer: 'ok' }] },
    { ...set, words: [{ prompt: 'ok', answer: 'a'.repeat(MAX_WORD_LENGTH + 1) }] },
    { ...set, direction: 'sideways' },
    { ...set, settings: null },
    { ...set, settings: { caseSensitive: 'false', accentSensitive: false } },
    { ...set, settings: { caseSensitive: false } },
    { ...set, promptLanguage: null },
    { ...set, answerLanguage: 4 },
    { ...set, promptLanguage: 'x'.repeat(MAX_LANGUAGE_NAME_LENGTH + 1) },
  ]) {
    assert.throws(() => parseShareUrl(link(payload(invalid))));
  }
  const boundary = {
    ...set,
    name: ` ${'n'.repeat(MAX_WORD_SET_NAME_LENGTH)} `,
    words: [{ prompt: ` ${'p'.repeat(MAX_WORD_LENGTH)} `, answer: 'ok' }],
  };
  assert.equal(parseShareUrl(link(payload(boundary))).name.length, MAX_WORD_SET_NAME_LENGTH);
  assert.equal(
    parseShareUrl(
      link(payload({ ...set, words: Array(MAX_WORDS_PER_SET).fill({ prompt: 'a', answer: 'b' }) })),
    ).words.length,
    MAX_WORDS_PER_SET,
  );
  assert.deepEqual(
    parseShareUrl(link(payload({ ...set, promptLanguage: '  ', answerLanguage: ' 日本語 ' })))
      .answerLanguage,
    '日本語',
  );
  for (const direction of ['prompt-to-answer', 'answer-to-prompt', 'both']) {
    assert.equal(parseShareUrl(link(payload({ ...set, direction }))).direction, direction);
  }
});

test('enforces the complete URL size threshold on both export and import', () => {
  const short = createShareUrl(set, 'https://example.test/');
  const extra = MAX_SHARE_URL_LENGTH - short.length;
  const boundaryBase = `https://example.test/${'x'.repeat(extra)}`;
  const boundary = createShareUrl(set, boundaryBase);
  assert.equal(boundary.length, MAX_SHARE_URL_LENGTH);
  assert.equal(parseShareUrl(boundary).name, set.name.trim());
  assert.throws(() => createShareUrl(set, `${boundaryBase}x`), /Reduser antall ord/);
  assert.throws(() => parseShareUrl(`${boundary}x`), /Reduser antall ord/);
  assert.throws(
    () =>
      createShareUrl(
        { ...set, words: Array(MAX_WORDS_PER_SET).fill({ prompt: 'æ'.repeat(200), answer: '狗' }) },
        'https://example.test/',
      ),
    /Reduser antall ord/,
  );
});
