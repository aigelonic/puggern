import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadWordSets,
  saveWordSets,
  WORD_SETS_KEY,
  WORD_SETS_VERSION,
} from '../frontend/src/word-sets.mjs';

function makeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

const validSet = {
  id: 'set-1',
  name: 'Uke 42',
  words: [{ id: '0', prompt: 'hund', answer: 'dog' }],
  direction: 'both',
  settings: { caseSensitive: false, accentSensitive: false },
  archived: false,
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
};

test('saves and loads valid word sets from local storage', () => {
  const storage = makeStorage();
  saveWordSets(storage, [validSet]);
  assert.deepEqual(loadWordSets(storage), [validSet]);
  assert.equal(JSON.parse(storage.values.get(WORD_SETS_KEY)).version, WORD_SETS_VERSION);
});

test('ignores corrupt, unsupported, or invalid word-set storage', () => {
  const storage = makeStorage();
  storage.values.set(WORD_SETS_KEY, '{');
  assert.deepEqual(loadWordSets(storage), []);
  storage.values.set(
    WORD_SETS_KEY,
    JSON.stringify({ version: WORD_SETS_VERSION + 1, sets: [validSet] }),
  );
  assert.deepEqual(loadWordSets(storage), []);
  storage.values.set(
    WORD_SETS_KEY,
    JSON.stringify({ version: WORD_SETS_VERSION, sets: [{ ...validSet, words: [] }] }),
  );
  assert.deepEqual(loadWordSets(storage), []);
  storage.values.set(
    WORD_SETS_KEY,
    JSON.stringify({
      version: WORD_SETS_VERSION,
      sets: [validSet, { ...validSet, name: 'Duplicate ID' }],
    }),
  );
  assert.deepEqual(loadWordSets(storage), []);
});
