import assert from 'node:assert/strict';
import test from 'node:test';

import { createSession, parseWordSet, PROGRESS_VERSION } from '../frontend/src/learning.mjs';
import {
  createProfileState,
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
