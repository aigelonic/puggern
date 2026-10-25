import assert from 'node:assert/strict';
import test from 'node:test';

import {
  answersMatch,
  createSession,
  currentWord,
  loadProgress,
  normalizeAnswer,
  parseWordSet,
  previewWordSet,
  PROGRESS_KEY,
  PROGRESS_VERSION,
  POINTS_PER_CORRECT_ANSWER,
  saveProgress,
  submitAnswer,
  wordsForDirection,
} from '../frontend/src/learning.mjs';

test('parses non-empty prompt and answer pairs and reports malformed lines', () => {
  assert.deepEqual(parseWordSet('A small pet\tcat\n\nA large pet\tdog'), [
    { id: '0', prompt: 'A small pet', answer: 'cat' },
    { id: '1', prompt: 'A large pet', answer: 'dog' },
  ]);
  assert.throws(() => parseWordSet('A prompt without an answer'), /Linje 1/);
  assert.throws(() => parseWordSet(' \n '), /minst ett/);
});

test('accepts paste separators, previews malformed rows, and enforces set limits', () => {
  assert.deepEqual(parseWordSet('hund;dog\nVann - water\nkatt\tcat'), [
    { id: '0', prompt: 'hund', answer: 'dog' },
    { id: '1', prompt: 'Vann', answer: 'water' },
    { id: '2', prompt: 'katt', answer: 'cat' },
  ]);
  assert.match(previewWordSet('Ugyldig linje')[0].error, /Linje 1/);
  assert.match(previewWordSet('to;separator;marks')[0].error, /Linje 1/);
  assert.throws(() => parseWordSet(`${'a\tb\n'.repeat(100)}c\td`), /maksimalt 100/);
  assert.throws(() => parseWordSet(`${'x'.repeat(201)}\ty`), /200 tegn/);
});

test('creates practice entries in the selected direction', () => {
  const words = parseWordSet('hund\tdog');
  assert.deepEqual(wordsForDirection(words, 'answer-to-prompt'), [
    { id: '0', prompt: 'dog', answer: 'hund' },
  ]);
  assert.deepEqual(wordsForDirection(words, 'both'), [
    { id: '0:forward', prompt: 'hund', answer: 'dog' },
    { id: '0:reverse', prompt: 'dog', answer: 'hund' },
  ]);
  assert.throws(() => wordsForDirection(words, 'unknown'), /quizretning/);
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

test('awards independent correct answers, resets combos on mistakes, and leaves copies unrewarded', () => {
  const words = parseWordSet('A;one\nB;two\nC;three');
  const initial = createSession(words, () => 0.999);
  const correct = submitAnswer(initial, 'one', words).session;
  assert.equal(initial.points, 0);
  assert.equal(correct.points, POINTS_PER_CORRECT_ANSWER);
  assert.equal(correct.streak, 1);
  assert.equal(correct.bestStreak, 1);

  const missed = submitAnswer(correct, 'wrong', words).session;
  assert.equal(missed.points, POINTS_PER_CORRECT_ANSWER);
  assert.equal(missed.streak, 0);
  assert.equal(missed.bestStreak, 1);
  const copied = submitAnswer(missed, 'two', words).session;
  assert.equal(copied.points, missed.points);
  assert.equal(copied.streak, 0);
  assert.equal(copied.bestStreak, 1);

  let session = copied;
  for (const response of ['three', 'two', 'two']) {
    session = submitAnswer(session, response, words).session;
  }
  assert.equal(session.points, 4 * POINTS_PER_CORRECT_ANSWER);
  assert.equal(session.streak, 3);
  assert.equal(session.bestStreak, 3);
  assert.deepEqual(submitAnswer(session, 'two', words).session, session);
  assert.equal(createSession(words).points, 0);
});

test('resumes legacy sessions with zero rewards and rejects malformed saved reward counters', () => {
  const words = parseWordSet('A;one');
  const session = createSession(words);
  delete session.points;
  delete session.streak;
  delete session.bestStreak;
  const storage = {
    value: '',
    getItem() {
      return this.value;
    },
    setItem(key, value) {
      this.value = value;
    },
  };
  saveProgress(storage, session, words);
  assert.deepEqual(loadProgress(storage).session, session);
  const completed = submitAnswer(session, 'one', words).session;
  assert.equal(completed.points, POINTS_PER_CORRECT_ANSWER);
  assert.equal(completed.streak, 1);

  for (const key of ['points', 'streak', 'bestStreak']) {
    for (const value of [-1, 0.5, '10', null, Number.MAX_SAFE_INTEGER + 1]) {
      saveProgress(storage, { ...session, [key]: value }, words);
      assert.equal(loadProgress(storage), null);
    }
  }
});
