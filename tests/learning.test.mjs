import assert from 'node:assert/strict';
import test from 'node:test';

import {
  answersMatch,
  createSession,
  currentWord,
  loadProgress,
  normalizeAnswer,
  parseWordSet,
  PROGRESS_KEY,
  PROGRESS_VERSION,
  saveProgress,
  submitAnswer,
} from '../frontend/src/learning.mjs';

test('parses non-empty prompt and answer pairs and reports malformed lines', () => {
  assert.deepEqual(parseWordSet('A small pet\tcat\n\nA large pet\tdog'), [
    { id: '0', prompt: 'A small pet', answer: 'cat' },
    { id: '1', prompt: 'A large pet', answer: 'dog' },
  ]);
  assert.throws(() => parseWordSet('A prompt without an answer'), /Linje 1/);
  assert.throws(() => parseWordSet(' \n '), /minst ett/);
});

test('normalizes whitespace, case, and accents according to set settings', () => {
  assert.equal(normalizeAnswer('  CAFÉ  '), 'cafe');
  assert.equal(answersMatch('CAFÉ ', 'cafe'), true);
  assert.equal(answersMatch('CAFÉ', 'cafe', { caseSensitive: true }), false);
  assert.equal(answersMatch('cafe', 'café', { accentSensitive: true }), false);
});

test('retries an incorrect answer, then repeats it later until correctly answered', () => {
  const words = parseWordSet('A\tone\nB\ttwo\nC\tthree');
  let session = createSession(words, () => 0.999);

  let outcome = submitAnswer(session, 'wrong', words);
  session = outcome.session;
  assert.equal(outcome.result, 'incorrect');
  assert.equal(currentWord(session, words).id, '0');
  assert.equal(session.correction, true);

  outcome = submitAnswer(session, 'one', words);
  session = outcome.session;
  assert.equal(outcome.result, 'retry-scheduled');
  assert.deepEqual(session.queue, ['1', '2', '0', '0']);

  for (const answer of ['two', 'three', 'one', 'one']) {
    outcome = submitAnswer(session, answer, words);
    session = outcome.session;
  }
  assert.equal(outcome.result, 'complete');
  assert.deepEqual(session.learned, ['1', '2', '0']);
});

test('persists supported progress and ignores corrupt or unknown versions', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const words = parseWordSet('A\tone');
  const session = createSession(words, () => 0.999);

  saveProgress(storage, session, words);
  assert.deepEqual(loadProgress(storage), {
    version: PROGRESS_VERSION,
    session,
    words,
  });

  values.set(PROGRESS_KEY, '{');
  assert.equal(loadProgress(storage), null);
  values.set(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION + 1, session, words }));
  assert.equal(loadProgress(storage), null);
});
