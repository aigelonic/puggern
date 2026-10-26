import assert from 'node:assert/strict';
import test from 'node:test';

import {
  answersMatch,
  createSession,
  currentWord,
  loadProgress,
  normalizeAnswer,
  normalizeProgress,
  parseWordSet,
  previewWordSet,
  PROGRESS_KEY,
  PROGRESS_VERSION,
  POINTS_PER_CORRECT_ANSWER,
  saveProgress,
  submitAnswer,
  wordsForDirection,
  wordsForExercise,
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
    { id: '0', prompt: 'dog', answer: 'hund', sourceDirection: 'reverse' },
  ]);
  assert.deepEqual(wordsForDirection(words, 'both'), [
    { id: '0:forward', prompt: 'hund', answer: 'dog', sourceDirection: 'forward' },
    { id: '0:reverse', prompt: 'dog', answer: 'hund', sourceDirection: 'reverse' },
  ]);
  assert.throws(() => wordsForDirection(words, 'unknown'), /quizretning/);
});

test('creates forward, reverse, and mixed questions once per word', () => {
  const words = parseWordSet('hund\tdog\nkatt\tcat\nfugl\tbird');
  assert.deepEqual(wordsForExercise(words, 'forward'), [
    { ...words[0], sourceDirection: 'forward' },
    { ...words[1], sourceDirection: 'forward' },
    { ...words[2], sourceDirection: 'forward' },
  ]);
  assert.deepEqual(wordsForExercise(words, 'reverse'), [
    { id: '0', prompt: 'dog', answer: 'hund', sourceDirection: 'reverse' },
    { id: '1', prompt: 'cat', answer: 'katt', sourceDirection: 'reverse' },
    { id: '2', prompt: 'bird', answer: 'fugl', sourceDirection: 'reverse' },
  ]);

  const mixed = wordsForExercise(words, 'mixed', () => 0);
  assert.equal(mixed.length, words.length);
  assert.equal(
    mixed.some(({ prompt, answer }) => prompt === 'hund' && answer === 'dog'),
    true,
  );
  assert.equal(
    mixed.some(({ prompt, answer }) => prompt === 'bird' && answer === 'fugl'),
    true,
  );
  assert.deepEqual(
    wordsForExercise(words.slice(0, 1), 'mixed', () => 0),
    [{ id: '0', prompt: 'hund', answer: 'dog', sourceDirection: 'forward' }],
  );
  assert.deepEqual(
    wordsForExercise(words.slice(0, 1), 'mixed', () => 0.99),
    [{ id: '0', prompt: 'dog', answer: 'hund', sourceDirection: 'reverse' }],
  );
  assert.throws(() => wordsForExercise(words, 'unknown'), /øvingsretning/);
});

test('records each mixed card direction without changing randomization or relying on its text', () => {
  const same = [{ id: 'same', prompt: 'same', answer: 'same' }];
  let calls = 0;
  const forward = wordsForExercise(same, 'mixed', () => {
    calls += 1;
    return 0;
  });
  assert.equal(calls, 1);
  assert.deepEqual(forward, [
    { id: 'same', prompt: 'same', answer: 'same', sourceDirection: 'forward' },
  ]);
  assert.deepEqual(
    wordsForExercise(same, 'mixed', () => 0.99),
    [{ id: 'same', prompt: 'same', answer: 'same', sourceDirection: 'reverse' }],
  );
});

test('creates a stable session queue in shuffled or original order', () => {
  const words = parseWordSet('A\tone\nB\ttwo\nC\tthree');
  const shuffled = createSession(
    words,
    () => 0,
    {},
    {
      directionMode: 'forward',
      orderMode: 'shuffled',
    },
  );
  const original = createSession(
    words,
    () => 0,
    {},
    {
      directionMode: 'reverse',
      orderMode: 'original',
    },
  );

  assert.notDeepEqual(
    shuffled.queue,
    words.map(({ id }) => id),
  );
  assert.deepEqual(
    original.queue,
    words.map(({ id }) => id),
  );
  assert.deepEqual(shuffled.exerciseConfig, {
    directionMode: 'forward',
    orderMode: 'shuffled',
  });
  assert.throws(
    () => createSession(words, Math.random, {}, { orderMode: 'unknown' }),
    /ordrekkefølge/,
  );
});

test('normalizes whitespace, case, and accents according to set settings', () => {
  assert.equal(normalizeAnswer('  CAFÉ  '), 'cafe');
  assert.equal(answersMatch('CAFÉ ', 'cafe'), true);
  assert.equal(answersMatch('CAFÉ', 'cafe', { caseSensitive: true }), false);
  assert.equal(answersMatch('cafe', 'café', { accentSensitive: true }), false);
});

test('keeps every wrong answer pending and completes each ID on its first correct answer', () => {
  const words = parseWordSet('A\tone\nB\ttwo\nC\tthree');
  let session = createSession(words, () => 0.999, {}, { orderMode: 'original' });
  assert.equal(session.queue.length, 3);
  const original = structuredClone(session);
  const initialSession = session;

  let outcome = submitAnswer(session, 'wrong', words);
  session = outcome.session;
  assert.equal(outcome.result, 'incorrect');
  assert.equal(currentWord(session, words).id, '0');
  assert.equal(session.correction, true);
  assert.equal(session.queue.length, 3);
  assert.equal(session.mistakes['0'], 1);

  outcome = submitAnswer(session, 'still wrong', words);
  session = outcome.session;
  assert.equal(outcome.result, 'incorrect');
  assert.equal(session.queue.length, 3);
  assert.equal(session.correction, true);
  assert.equal(session.mistakes['0'], 2);
  assert.equal(session.streak, 0);

  outcome = submitAnswer(session, 'one', words);
  session = outcome.session;
  assert.equal(outcome.result, 'correct');
  assert.equal(session.queue.length, 2);
  assert.deepEqual(session.queue, ['1', '2']);
  assert.equal(session.correction, false);

  outcome = submitAnswer(session, 'two', words);
  session = outcome.session;
  assert.equal(session.queue.length, 1);
  assert.deepEqual(session.queue, ['2']);

  outcome = submitAnswer(session, 'three', words);
  session = outcome.session;
  assert.equal(outcome.result, 'complete');
  assert.equal(session.queue.length, 0);
  assert.deepEqual(session.learned, ['0', '1', '2']);
  assert.deepEqual(initialSession, original);
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

test('normalizes duplicate legacy queue entries when loading without writing storage', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const words = parseWordSet('A\tone\nB\ttwo');
  const progress = {
    version: PROGRESS_VERSION,
    words,
    session: {
      queue: ['0', '1', '0', '1'],
      correction: true,
      learned: [],
      mistakes: {},
      settings: {},
    },
  };
  const raw = JSON.stringify(progress);
  values.set(PROGRESS_KEY, raw);

  const loaded = loadProgress(storage);

  assert.deepEqual(loaded.session.queue, ['0', '1']);
  assert.equal(loaded.session.correction, true);
  assert.equal(values.get(PROGRESS_KEY), raw);
});

test('awards distinct correct answers and resets combos on mistakes', () => {
  const words = parseWordSet('A;one\nB;two\nC;three');
  const initial = createSession(words, () => 0.999, {}, { orderMode: 'original' });
  const correct = submitAnswer(initial, 'one', words).session;
  assert.equal(initial.points, 0);
  assert.equal(correct.points, POINTS_PER_CORRECT_ANSWER);
  assert.equal(correct.streak, 1);
  assert.equal(correct.bestStreak, 1);

  const missed = submitAnswer(correct, 'wrong', words).session;
  assert.equal(missed.points, POINTS_PER_CORRECT_ANSWER);
  assert.equal(missed.streak, 0);
  assert.equal(missed.bestStreak, 1);
  const corrected = submitAnswer(missed, 'two', words).session;
  assert.equal(corrected.points, 2 * POINTS_PER_CORRECT_ANSWER);
  assert.equal(corrected.streak, 1);
  assert.equal(corrected.bestStreak, 1);

  const session = submitAnswer(corrected, 'three', words).session;
  assert.equal(session.points, 3 * POINTS_PER_CORRECT_ANSWER);
  assert.equal(session.streak, 2);
  assert.equal(session.bestStreak, 2);
  assert.deepEqual(submitAnswer(session, 'two', words).session, session);
  assert.equal(createSession(words).points, 0);
});

test('completes duplicate queue occurrences once while preserving distinct IDs with equal answers', () => {
  const words = parseWordSet('A;same\nB;same');
  const initial = createSession(words, () => 0.999, {}, { orderMode: 'original' });
  const session = { ...initial, queue: ['0', '1', '0', '1'] };
  const before = structuredClone(session);

  const first = submitAnswer(session, 'same', words);
  assert.equal(first.result, 'correct');
  assert.deepEqual(first.session.queue, ['1']);
  assert.deepEqual(first.session.learned, ['0']);
  assert.equal(first.session.points, POINTS_PER_CORRECT_ANSWER);
  assert.deepEqual(session, before);

  const complete = submitAnswer(first.session, 'same', words);
  assert.equal(complete.result, 'complete');
  assert.deepEqual(complete.session.queue, []);
  assert.deepEqual(complete.session.learned, ['0', '1']);
  assert.equal(complete.session.points, 2 * POINTS_PER_CORRECT_ANSWER);
  assert.deepEqual(submitAnswer(complete.session, 'same', words), {
    session: complete.session,
    result: 'complete',
  });
});

test('does not reward learned IDs that are reintroduced and keeps pending IDs unique', () => {
  const words = parseWordSet('A;one\nB;two');
  let session = createSession(words, () => 0.999, {}, { orderMode: 'original' });
  session = submitAnswer(session, 'one', words).session;
  assert.equal(session.points, POINTS_PER_CORRECT_ANSWER);

  const reintroduced = { ...session, queue: ['0', '0', '1', '1'] };
  const before = structuredClone(reintroduced);
  const outcome = submitAnswer(reintroduced, 'two', words);

  assert.equal(outcome.result, 'complete');
  assert.deepEqual(outcome.session.queue, []);
  assert.deepEqual(outcome.session.learned, ['0', '1']);
  assert.equal(outcome.session.points, POINTS_PER_CORRECT_ANSWER * 2);
  assert.deepEqual(reintroduced, before);
  assert.equal(new Set(outcome.session.queue).size, outcome.session.queue.length);
  assert.equal(
    outcome.session.queue.some((id) => outcome.session.learned.includes(id)),
    false,
  );
});

test('keeps queue and learned IDs unique and disjoint through mixed submissions', () => {
  const words = parseWordSet('A;one\nB;two\nC;three');
  let session = createSession(words, () => 0.999, {}, { orderMode: 'original' });

  for (const response of ['wrong', 'still wrong', 'one', 'two', 'wrong', 'three']) {
    session = submitAnswer(session, response, words).session;
    assert.equal(new Set(session.queue).size, session.queue.length);
    assert.equal(new Set(session.learned).size, session.learned.length);
    assert.equal(
      session.queue.some((id) => session.learned.includes(id)),
      false,
    );
  }

  assert.deepEqual(session.queue, []);
  assert.deepEqual(session.learned, ['0', '1', '2']);
  assert.deepEqual(session.mistakes, { 0: 2, 2: 1 });
});

test('saturates points, streak, and best streak at the safe integer limit', () => {
  const words = parseWordSet('A;one');
  const session = {
    ...createSession(words),
    points: Number.MAX_SAFE_INTEGER,
    streak: Number.MAX_SAFE_INTEGER,
    bestStreak: Number.MAX_SAFE_INTEGER,
  };

  const result = submitAnswer(session, 'one', words);
  assert.equal(result.session.points, Number.MAX_SAFE_INTEGER);
  assert.equal(result.session.streak, Number.MAX_SAFE_INTEGER);
  assert.equal(result.session.bestStreak, Number.MAX_SAFE_INTEGER);
});

test('normalizes valid legacy progress without mutating it', () => {
  const words = parseWordSet('A;one\nB;two\nC;three');
  const session = createSession(words);
  delete session.points;
  delete session.streak;
  delete session.bestStreak;
  delete session.exerciseConfig;
  session.queue = ['1', '0', '1', '2', '0'];
  session.learned = ['0'];
  session.correction = true;
  session.legacyField = { retained: true };
  const progress = {
    version: PROGRESS_VERSION,
    words,
    session,
    legacyProgressField: 'retained',
  };
  const before = structuredClone(progress);

  const normalized = normalizeProgress(progress);

  assert.notEqual(normalized, progress);
  assert.notEqual(normalized.session, session);
  assert.deepEqual(normalized.session.queue, ['1', '2']);
  assert.deepEqual(normalized.session.learned, ['0']);
  assert.equal(normalized.session.correction, true);
  assert.equal(normalized.session.legacyField.retained, true);
  assert.equal(normalized.legacyProgressField, 'retained');
  assert.equal('points' in normalized.session, false);
  assert.equal('exerciseConfig' in normalized.session, false);
  assert.deepEqual(progress, before);
});

test('clears correction when normalization removes the current ID or all pending IDs', () => {
  const words = parseWordSet('A;one\nB;two');
  const base = {
    version: PROGRESS_VERSION,
    words,
    session: {
      queue: ['0', '1', '0'],
      correction: true,
      learned: ['0'],
      mistakes: {},
      settings: {},
    },
  };

  const currentRemoved = normalizeProgress(base);
  assert.deepEqual(currentRemoved.session.queue, ['1']);
  assert.equal(currentRemoved.session.correction, false);

  const empty = normalizeProgress({
    ...base,
    session: { ...base.session, queue: ['0', '0'] },
  });
  assert.deepEqual(empty.session.queue, []);
  assert.equal(empty.session.correction, false);
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
