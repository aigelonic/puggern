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

function makeLockManager() {
  let tail = Promise.resolve();
  return {
    request(_name, callback) {
      const result = tail.then(callback);
      tail = result.catch(() => {});
      return result;
    },
  };
}

test('limits creation attempts across the configured time window', async () => {
  const storage = makeStorage();
  const locks = makeLockManager();
  const now = 1_000_000;

  for (let attempt = 0; attempt < MAX_CREATIONS_PER_WINDOW; attempt += 1) {
    assert.deepEqual(await recordCreationAttempt(storage, now + attempt, locks), {
      allowed: true,
      retryAfterMs: 0,
    });
  }

  const blocked = await recordCreationAttempt(storage, now + MAX_CREATIONS_PER_WINDOW, locks);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, CREATION_WINDOW_MS - MAX_CREATIONS_PER_WINDOW);
  assert.equal(
    JSON.parse(storage.values.get(CREATION_ATTEMPTS_KEY)).length,
    MAX_CREATIONS_PER_WINDOW,
  );
});

test('allows new attempts after the previous window expires', async () => {
  const storage = makeStorage();
  const locks = makeLockManager();
  const now = 1_000_000;
  for (let attempt = 0; attempt < MAX_CREATIONS_PER_WINDOW; attempt += 1) {
    await recordCreationAttempt(storage, now + attempt, locks);
  }

  assert.equal(
    (await recordCreationAttempt(storage, now + CREATION_WINDOW_MS, locks)).allowed,
    true,
  );
});

test('serializes simultaneous attempts across the creation limit', async () => {
  const storage = makeStorage();
  const locks = makeLockManager();
  const now = 1_000_000;
  for (let attempt = 0; attempt < MAX_CREATIONS_PER_WINDOW - 1; attempt += 1) {
    await recordCreationAttempt(storage, now + attempt, locks);
  }

  const results = await Promise.all([
    recordCreationAttempt(storage, now + 10, locks),
    recordCreationAttempt(storage, now + 11, locks),
  ]);

  assert.equal(results.filter(({ allowed }) => allowed).length, 1);
  assert.equal(
    JSON.parse(storage.values.get(CREATION_ATTEMPTS_KEY)).length,
    MAX_CREATIONS_PER_WINDOW,
  );
});

test('reports malformed rate-limit state instead of resetting it', async () => {
  const storage = makeStorage();
  const locks = makeLockManager();
  storage.values.set(CREATION_ATTEMPTS_KEY, '{');

  await assert.rejects(
    recordCreationAttempt(storage, Date.now(), locks),
    /opprettingsbegrensningen/,
  );
});
