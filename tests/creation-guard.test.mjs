import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CREATION_ATTEMPTS_KEY,
  CREATION_WINDOW_MS,
  MAX_CREATIONS_PER_WINDOW,
  recordCreationAttempt,
} from '../frontend/src/creation-guard.mjs';

function makeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test('limits creation attempts across the configured time window', () => {
  const storage = makeStorage();
  const now = 1_000_000;

  for (let attempt = 0; attempt < MAX_CREATIONS_PER_WINDOW; attempt += 1) {
    assert.deepEqual(recordCreationAttempt(storage, now + attempt), {
      allowed: true,
      retryAfterMs: 0,
    });
  }

  const blocked = recordCreationAttempt(storage, now + MAX_CREATIONS_PER_WINDOW);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, CREATION_WINDOW_MS - MAX_CREATIONS_PER_WINDOW);
  assert.equal(
    JSON.parse(storage.values.get(CREATION_ATTEMPTS_KEY)).length,
    MAX_CREATIONS_PER_WINDOW,
  );
});

test('allows new attempts after the previous window expires', () => {
  const storage = makeStorage();
  const now = 1_000_000;
  for (let attempt = 0; attempt < MAX_CREATIONS_PER_WINDOW; attempt += 1) {
    recordCreationAttempt(storage, now + attempt);
  }

  assert.equal(recordCreationAttempt(storage, now + CREATION_WINDOW_MS).allowed, true);
});

test('reports malformed rate-limit state instead of resetting it', () => {
  const storage = makeStorage();
  storage.values.set(CREATION_ATTEMPTS_KEY, '{');

  assert.throws(() => recordCreationAttempt(storage), /opprettingsbegrensningen/);
});
