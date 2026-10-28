import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, parseWordSet, submitAnswer } from '../frontend/src/learning.mjs';
import {
  accuracy,
  completedResult,
  createRun,
  isValidResult,
  isValidRun,
  MAX_HISTORY,
  newestFirst,
  personalBestMessage,
  variantTrend,
} from '../frontend/src/history.mjs';
import {
  applyRunUpdates,
  createProfileState,
  createRewards,
  loadProfileState,
  PROFILE_STATE_KEY,
  saveProfileState,
} from '../frontend/src/profiles.mjs';

const words = parseWordSet('en;one\nto;two\ntre;three\nfire;four');
const set = { id: 'set-1', name: 'Tall', words };
const config = { directionMode: 'forward', orderMode: 'original' };

async function makeSession(id = 'run-1', overrides = {}) {
  const session = createSession(words, () => 0, {}, config);
  session.run = await createRun(set, session, id);
  return { ...session, ...overrides };
}

async function result(id = 'run-1', overrides = {}) {
  return {
    ...completedResult(
      await makeSession(id, {
        queue: [],
        learned: words.map(({ id }) => id),
        mistakes: { 1: 2 },
        points: 40,
        bestStreak: 2,
      }),
      '2026-10-26T12:00:00.000Z',
    ),
    ...overrides,
  };
}

function storageFor(state) {
  const values = new Map([[PROFILE_STATE_KEY, JSON.stringify(state)]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

async function update(id = 'run-1', profileId = 'p1') {
  const recorded = await result(id);
  const session = await makeSession(id, {
    queue: [],
    learned: words.map(({ id }) => id),
    mistakes: { 1: 2 },
    points: 40,
    bestStreak: 2,
  });
  return {
    profileId,
    setId: set.id,
    result: recorded,
    progress: { version: 1, words, session },
    earned: { points: 40, bestStreak: 2, completedSets: 1 },
  };
}

test('records exact engine metrics, without treating correction copies as first tries', async () => {
  let session = await makeSession();
  assert.equal(completedResult(session), null);
  for (const answer of ['one', 'wrong', 'wrong', 'two', 'three', 'four']) {
    session = submitAnswer(session, answer, words).session;
  }
  const saved = completedResult(session, '2026-10-26T12:00:00.000Z');
  assert.equal(saved.points, session.points);
  assert.equal(saved.bestStreak, session.bestStreak);
  assert.equal(saved.practicedCount, 4);
  assert.equal(saved.firstTryCount, 3);
  assert.equal(saved.totalErrors, 2);
  assert.equal(saved.extraPracticeCount, 1);
  assert.equal(accuracy(saved), 75);
  assert.equal(isValidResult(saved), true);
  assert.equal(completedResult({ ...session, run: undefined }), null);
});

test('fingerprints source content/order and effective settings but not names or mixed realization', async () => {
  const session = await makeSession();
  const key = (source = set, next = session) =>
    createRun(source, next, 'other').then((run) => run.comparisonKey);
  const original = await key();
  assert.equal(
    await key({ ...set, name: 'Nytt navn', archived: true, updatedAt: 'changed' }),
    original,
  );
  assert.equal(
    await key(set, { ...session, settings: { caseSensitive: false, accentSensitive: false } }),
    original,
  );
  for (const source of [
    { ...set, id: 'copied-set' },
    { ...set, words: [...words].reverse() },
    { ...set, words: [{ ...words[0], answer: 'changed' }, ...words.slice(1)] },
  ])
    assert.notEqual(await key(source), original);
  for (const next of [
    { ...session, settings: { caseSensitive: true } },
    { ...session, settings: { accentSensitive: true } },
    { ...session, exerciseConfig: { ...config, directionMode: 'reverse' } },
    { ...session, exerciseConfig: { ...config, orderMode: 'shuffled' } },
  ])
    assert.notEqual(await key(set, next), original);
  const mixed = { ...session, exerciseConfig: { ...config, directionMode: 'mixed' } };
  assert.equal(await key(set, mixed), await key(set, { ...mixed, queue: ['3', '2', '1', '0'] }));
});

test('isolates legacy resumed runs from current and other run comparisons', async () => {
  const session = await makeSession();
  const savedWords = words.map(({ ...word }) => word);
  const editedSet = {
    ...set,
    words: words.map(({ id, prompt, answer }) => ({ id, prompt: `new ${prompt}`, answer })),
  };
  const legacySource = { ...editedSet, words: savedWords };
  const legacy = await createRun(legacySource, session, 'legacy-1', { isolate: true });
  const sameLegacyAgain = await createRun(legacySource, session, 'legacy-1', { isolate: true });
  const current = await createRun(editedSet, session, 'new-run');
  const anotherLegacy = await createRun(legacySource, session, 'legacy-2', { isolate: true });
  assert.equal(legacy.comparisonKey, sameLegacyAgain.comparisonKey);
  assert.notEqual(legacy.comparisonKey, current.comparisonKey);
  assert.notEqual(legacy.comparisonKey, anotherLegacy.comparisonKey);
});

test('recovers legacy direction from saved cards and records unknown directions explicitly', async () => {
  const session = createSession(words);
  delete session.exerciseConfig;
  const reverseWords = words.map(({ id, prompt, answer }) => ({
    id,
    prompt: answer,
    answer: prompt,
    sourceDirection: 'reverse',
  }));
  const reverse = await createRun({ ...set, words: reverseWords }, session, 'legacy-reverse');
  assert.equal(reverse.directionMode, 'reverse');

  const unknownWords = words.map(({ id, prompt, answer }) => ({ id, prompt, answer }));
  const unknown = await createRun({ ...set, words: unknownWords }, session, 'legacy-unknown');
  assert.equal(unknown.directionMode, 'unknown');
  assert.equal(isValidRun(unknown), true);
});

test('sorts ties deterministically, selects latest ten, and compares unrounded accuracy within one variant', async () => {
  const base = await result();
  const history = Array.from({ length: 12 }, (_, index) => ({
    ...base,
    id: `run-${String(index).padStart(2, '0')}`,
    firstTryCount: index % 5,
    extraPracticeCount: 4 - (index % 5),
  }));
  history.push({ ...base, id: 'unrelated', comparisonKey: 'b'.repeat(64), firstTryCount: 0 });
  const trend = variantTrend(history, base.comparisonKey);
  assert.equal(trend.recent.length, 10);
  assert.equal(trend.recent[0].id, 'run-02');
  assert.equal(trend.latest.id, 'run-11');
  assert.equal(trend.delta, 25);
  assert.equal(trend.bestAccuracy, 100);
  assert.equal(newestFirst(history)[0].id, 'unrelated');
  const fractions = [
    { ...base, id: 'a', practicedCount: 3, firstTryCount: 1 },
    { ...base, id: 'b', practicedCount: 7, firstTryCount: 2 },
  ];
  assert.ok(
    Math.abs(variantTrend(fractions, base.comparisonKey).delta - (2 / 7 - 1 / 3) * 100) < 1e-12,
  );
  assert.equal(variantTrend([base], base.comparisonKey).delta, null);
  assert.deepEqual(variantTrend([], base.comparisonKey).recent, []);
  for (const invalid of [
    null,
    { practicedCount: 0 },
    { practicedCount: NaN },
    { practicedCount: 2, firstTryCount: Infinity },
    { practicedCount: 2, firstTryCount: 3 },
  ]) {
    assert.equal(accuracy(invalid), 0);
  }
});

test('baseline, ties, and strict personal bests never reward raw points', async () => {
  const base = await result();
  assert.match(personalBestMessage(base, []), /utgangspunktet/);
  assert.equal(personalBestMessage({ ...base, id: 'new', points: 999 }, [base]), '');
  assert.match(
    personalBestMessage({ ...base, id: 'new', firstTryCount: 4 }, [base]),
    /førsteforsøksnøyaktighet/,
  );
  assert.match(personalBestMessage({ ...base, id: 'new', bestStreak: 3 }, [base]), /rekke/);
  assert.equal(personalBestMessage({ ...base, id: 'new', firstTryCount: 1 }, [base]), '');
});

test('loads legacy v1 data unchanged and isolates malformed optional history and run metadata', async () => {
  const state = createProfileState('p1');
  delete state.profiles[0].rewards;
  const storage = storageFor(state);
  assert.deepEqual(loadProfileState(storage), state);
  const good = await result();
  state.progress.p1[set.id] = (await update()).progress;
  state.history = { p1: [good, { ...good, id: 'bad', firstTryCount: 5 }, good] };
  state.progress.p1[set.id].session.run = { id: 'broken' };
  let warnings = 0;
  const loaded = loadProfileState(storageFor(state), () => warnings++);
  assert.equal(warnings, 3);
  assert.deepEqual(loaded.history.p1, [good]);
  assert.equal(loaded.progress.p1[set.id].session.run, undefined);
  assert.deepEqual(loaded.profiles, state.profiles);
  for (const history of [null, [], 'bad', { p1: {} }]) {
    const loaded = loadProfileState(storageFor({ ...state, history }));
    assert.deepEqual(loaded.profiles, state.profiles);
    assert.deepEqual(loaded.history, {});
  }
  assert.equal(loadProfileState(storageFor({ ...state, version: 2 })), null);
});

test('validates added data on reads and writes without destroying otherwise valid state', async () => {
  const good = await result();
  for (const change of [
    { id: '' },
    { setName: 'x'.repeat(81) },
    { comparisonKey: 'oops' },
    { directionMode: 'sideways' },
    { orderMode: 'random' },
    { caseSensitive: 'yes' },
    { completedAt: '2026-02-30T12:00:00.000Z' },
    { completedAt: 'not-a-date' },
    { points: -1 },
    { points: 1.5 },
    { totalErrors: Number.MAX_SAFE_INTEGER + 1 },
    { practicedCount: 0 },
    { firstTryCount: 5 },
    { extraPracticeCount: 201 },
    { copiedSession: { words } },
  ]) {
    const invalid = { ...good, ...change };
    assert.equal(isValidResult(invalid), false, JSON.stringify(change));
    const state = { ...createProfileState('p1'), history: { p1: [good, invalid] } };
    assert.deepEqual(loadProfileState(storageFor(state)).history.p1, [good]);
    assert.throws(() => saveProfileState(storageFor(state), state), /historikken/);
  }
  assert.equal(isValidRun({ ...good, id: 'x'.repeat(129) }), false);
});

test('merges latest state, owns results by starting profile, deduplicates completions and never replays rewards', async () => {
  let state = createProfileState('p1');
  state.profiles.push({ id: 'p2', name: 'To', avatar: '', rewards: createRewards() });
  state.progress.p2 = {};
  state.activeProfileId = 'p2';
  const first = await update();
  state = applyRunUpdates(state, [first]);
  assert.equal(state.history.p1.length, 1);
  assert.equal(state.history.p2, undefined);
  assert.equal(state.profiles[0].rewards.completedSets, 1);
  assert.deepEqual(applyRunUpdates(state, [first, first]), state);
  state = applyRunUpdates(state, [await update('distinct'), await update('other-profile', 'p2')]);
  assert.equal(state.history.p1.length, 2);
  assert.equal(state.history.p2.length, 1);
  assert.equal(state.profiles[0].rewards.points, 80);
  const storage = storageFor(state);
  saveProfileState(storage, state);
  const reloaded = loadProfileState(storage);
  assert.deepEqual(reloaded.profiles, state.profiles);
  assert.deepEqual(applyRunUpdates(reloaded, []), reloaded);
  assert.deepEqual(applyRunUpdates(reloaded, [first]), reloaded);
});

test('credits only unsaved point delta for same run and rejects stale regressions', async () => {
  let state = createProfileState('p1');
  const pending = await update();
  const partial = {
    ...pending,
    result: null,
    earned: { points: 10, bestStreak: 1, completedSets: 0 },
    progress: {
      ...pending.progress,
      session: await makeSession('run-1', {
        points: 10,
        bestStreak: 1,
        learned: ['0'],
        queue: ['1', '2', '3'],
      }),
    },
  };
  state = applyRunUpdates(state, [partial]);
  state = applyRunUpdates(state, [partial]);
  assert.equal(state.profiles[0].rewards.points, 10);
  const stale = { ...partial, progress: { ...partial.progress, session: await makeSession() } };
  assert.deepEqual(applyRunUpdates(state, [stale]), state);
  state = applyRunUpdates(state, [pending]);
  assert.equal(state.profiles[0].rewards.points, 40);
  assert.equal(state.profiles[0].rewards.completedSets, 1);
});

test('does not re-credit resumed answers after a replacement run overwrites progress', async () => {
  let state = createProfileState('p1');
  const firstRun = await makeSession('run-r', {
    points: 10,
    bestStreak: 1,
    learned: ['0'],
    queue: ['1', '2', '3'],
  });
  const firstAnswer = {
    profileId: 'p1',
    setId: set.id,
    progress: { version: 1, words, session: firstRun },
    earned: { points: 10, bestStreak: 1, completedSets: 0 },
    result: null,
  };
  state = applyRunUpdates(state, [firstAnswer]);
  assert.equal(state.profiles[0].rewards.points, 10);

  const replacement = await makeSession('run-s', {
    learned: [],
    queue: ['0', '1', '2', '3'],
  });
  state = applyRunUpdates(state, [
    {
      ...firstAnswer,
      progress: { version: 1, words, session: replacement },
      earned: createRewards(),
    },
  ]);

  state = applyRunUpdates(state, [firstAnswer]);
  assert.equal(state.profiles[0].rewards.points, 10);
  assert.equal(state.runPoints.p1['run-r'], 10);

  const resumedAnswer = {
    ...firstAnswer,
    progress: {
      version: 1,
      words,
      session: await makeSession('run-r', {
        points: 20,
        bestStreak: 2,
        learned: ['0', '1'],
        queue: ['2', '3'],
      }),
    },
  };
  state = applyRunUpdates(state, [resumedAnswer]);
  assert.equal(state.profiles[0].rewards.points, 20);
  assert.equal(state.runPoints.p1['run-r'], 20);
  assert.equal(state.progress.p1[set.id].session.run.id, 'run-r');
  assert.deepEqual(applyRunUpdates(state, [resumedAnswer]), state);
});

test('concurrent legacy resumes adopt the identity already saved under the lock, rather than creating another run', async () => {
  let state = createProfileState('p1');
  const session = await makeSession('first');
  const progress = { version: 1, words, session };
  const legacy = { ...session };
  delete legacy.run;
  state.progress.p1[set.id] = { ...progress, session: legacy };
  const update = {
    profileId: 'p1',
    setId: set.id,
    progress,
    earned: createRewards(),
    result: null,
    resumeLegacy: true,
  };
  state = applyRunUpdates(state, [update]);
  const other = {
    ...update,
    progress: { ...progress, session: await makeSession('second') },
  };
  state = applyRunUpdates(state, [other]);
  assert.equal(state.progress.p1[set.id].session.run.id, 'first');
  assert.equal(state.profiles[0].rewards.points, 0);
  assert.equal(state.history, undefined);
});

test('501st result prunes deterministically without changing lifetime rewards or mutating state on write failure', async () => {
  const base = await result();
  const state = createProfileState('p1');
  state.history = {
    p1: Array.from({ length: MAX_HISTORY }, (_, index) => ({
      ...base,
      id: `old-${index}`,
    })),
  };
  state.profiles[0].rewards = { points: 20000, bestStreak: 4, completedSets: 500 };
  const pending = await update('new');
  pending.result.completedAt = '2026-10-27T12:00:00.000Z';
  const next = applyRunUpdates(state, [pending]);
  assert.equal(next.history.p1.length, MAX_HISTORY);
  assert.equal(next.history.p1[0].id, 'new');
  assert.equal(next.profiles[0].rewards.points, 20040);
  assert.equal(next.profiles[0].rewards.completedSets, 501);
  const old = JSON.stringify(state);
  assert.throws(
    () =>
      saveProfileState(
        {
          setItem() {
            throw new Error('full');
          },
        },
        next,
      ),
    /full/,
  );
  assert.equal(JSON.stringify(state), old);
  const storage = storageFor(state);
  saveProfileState(storage, next);
  assert.deepEqual(loadProfileState(storage).history.p1, next.history.p1);
});
