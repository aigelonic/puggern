import assert from 'node:assert/strict';
import test from 'node:test';

import { createSession, parseWordSet, PROGRESS_VERSION } from '../frontend/src/learning.mjs';
import {
  addRewards,
  createProfileState,
  createRewards,
  loadProfileState,
  MAX_PROFILES,
  PROFILE_STATE_KEY,
  PROFILE_STATE_VERSION,
  saveProfileState,
} from '../frontend/src/profiles.mjs';

function makeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test('saves independent per-word-set progress for multiple profiles', () => {
  const storage = makeStorage();
  const state = createProfileState('profile-1');
  const words = parseWordSet('A\tone');
  const progress = {
    version: PROGRESS_VERSION,
    words,
    session: createSession(words, () => 0.5),
  };
  state.profiles.push({ id: 'profile-2', name: 'Ada', avatar: '🐶' });
  state.progress['profile-2'] = {};
  state.progress['profile-1']['set-1'] = progress;
  state.progress['profile-2']['set-2'] = progress;

  saveProfileState(storage, state);

  assert.deepEqual(loadProfileState(storage), state);
  assert.equal(JSON.parse(storage.values.get(PROFILE_STATE_KEY)).version, PROFILE_STATE_VERSION);
});

test('ignores corrupt, unsupported, or invalid profile state', () => {
  const storage = makeStorage();
  storage.values.set(PROFILE_STATE_KEY, '{');
  assert.equal(loadProfileState(storage), null);

  const state = createProfileState('profile-1');
  storage.values.set(
    PROFILE_STATE_KEY,
    JSON.stringify({ ...state, version: PROFILE_STATE_VERSION + 1 }),
  );
  assert.equal(loadProfileState(storage), null);

  state.progress['profile-1']['set-1'] = {
    version: PROGRESS_VERSION,
    words: [{ id: 'word-1', prompt: 'A', answer: 'one' }],
    session: {
      queue: ['missing-word'],
      correction: false,
      learned: [],
      mistakes: {},
      settings: {},
    },
  };
  storage.values.set(PROFILE_STATE_KEY, JSON.stringify(state));
  assert.equal(loadProfileState(storage), null);

  state.progress = {};
  state.profiles = Array.from({ length: MAX_PROFILES + 1 }, (_, index) => ({
    id: `profile-${index}`,
    name: `Profile ${index}`,
    avatar: '',
  }));
  state.activeProfileId = state.profiles[0].id;
  storage.values.set(PROFILE_STATE_KEY, JSON.stringify(state));
  assert.equal(loadProfileState(storage), null);
});

test('normalizes duplicate progress in every profile without writing or altering other data', () => {
  const storage = makeStorage();
  const state = createProfileState('profile-1');
  const words = parseWordSet('A\tone\nB\ttwo');
  const duplicateProgress = {
    version: PROGRESS_VERSION,
    words,
    session: {
      queue: ['0', '1', '0', '1'],
      correction: true,
      learned: [],
      mistakes: {},
      settings: {},
      legacySessionField: 'preserved',
    },
    legacyProgressField: 'preserved',
  };
  state.profiles.push({ id: 'profile-2', name: 'Ada', avatar: '' });
  state.progress['profile-1']['set-1'] = duplicateProgress;
  state.progress['profile-2'] = {
    'set-2': {
      version: PROGRESS_VERSION,
      words,
      session: {
        queue: ['1', '0', '1'],
        correction: false,
        learned: ['0'],
        mistakes: {},
        settings: {},
      },
    },
  };
  saveProfileState(storage, state);
  const stored = storage.values.get(PROFILE_STATE_KEY);

  const loaded = loadProfileState(storage);

  assert.deepEqual(loaded.progress['profile-1']['set-1'].session.queue, ['0', '1']);
  assert.equal(loaded.progress['profile-1']['set-1'].session.correction, true);
  assert.equal(loaded.progress['profile-1']['set-1'].legacyProgressField, 'preserved');
  assert.equal(loaded.progress['profile-1']['set-1'].session.legacySessionField, 'preserved');
  assert.deepEqual(loaded.progress['profile-2']['set-2'].session.queue, ['1']);
  assert.equal(loaded.progress['profile-2']['set-2'].session.correction, false);
  assert.equal(storage.values.get(PROFILE_STATE_KEY), stored);
  assert.deepEqual(state.progress['profile-1']['set-1'], duplicateProgress);
});

test('persists accumulated profile rewards independently of replaced practice progress', () => {
  const storage = makeStorage();
  const state = createProfileState('profile-1');
  const profile = state.profiles[0];
  profile.rewards = addRewards(profile.rewards, {
    points: 20,
    bestStreak: 2,
    completedSets: 1,
  });
  profile.rewards = addRewards(profile.rewards, {
    points: 10,
    bestStreak: 1,
    completedSets: 1,
  });
  state.profiles.push({ id: 'profile-2', name: 'Ada', avatar: '', rewards: createRewards() });
  saveProfileState(storage, state);
  assert.deepEqual(
    loadProfileState(storage).profiles.map(({ rewards }) => rewards),
    [
      { points: 30, bestStreak: 2, completedSets: 2 },
      { points: 0, bestStreak: 0, completedSets: 0 },
    ],
  );
});

test('accepts profiles without rewards and rejects invalid reward counters', () => {
  const storage = makeStorage();
  const state = createProfileState('legacy');
  delete state.profiles[0].rewards;
  saveProfileState(storage, state);
  assert.deepEqual(loadProfileState(storage), state);
  assert.deepEqual(addRewards(undefined, createRewards()), createRewards());

  for (const key of ['points', 'bestStreak', 'completedSets']) {
    for (const value of [-1, 0.5, '10', null, Number.MAX_SAFE_INTEGER + 1]) {
      state.profiles[0].rewards = { ...createRewards(), [key]: value };
      saveProfileState(storage, state);
      assert.equal(loadProfileState(storage), null);
    }
  }
});
