import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../frontend/service-worker.js', import.meta.url), 'utf8');

function worker() {
  const listeners = new Map();
  const entries = new Map();
  const cache = {
    put: async (url, response) => {
      state.writes++;
      if (state.failWrite) throw new Error('Cache write failed');
      entries.set(url, response);
    },
    match: async (request) =>
      entries.get(typeof request === 'string' ? request : request.url)?.clone(),
  };
  const client = { id: 'page', type: 'window', url: 'https://app.test/app/' };
  const state = {
    skipped: 0,
    clients: [client],
    entries,
    requests: [],
    deleted: [],
    writes: 0,
    keys: [
      'unrelated',
      'puggern-app-shell-v11',
      'puggern-app-shell-0.0.0-11',
      'puggern-app-shell-not-ours',
    ],
  };
  runInNewContext(source, {
    URL,
    Request,
    Response,
    ReadableStream,
    Uint8Array,
    caches: {
      has: async () => Boolean(state.existed),
      open: async () => cache,
      keys: async () => state.keys,
      delete: async (key) => state.deleted.push(key),
    },
    fetch: async (request) => {
      state.requests.push(request);
      const path = new URL(request.url).pathname;
      const type = path.endsWith('.mjs')
        ? 'text/javascript'
        : path.endsWith('.css')
          ? 'text/css'
          : path.endsWith('.png')
            ? 'image/png'
            : path.endsWith('.webmanifest')
              ? 'application/manifest+json'
              : 'text/html';
      const body =
        state.truncated && path.endsWith('.mjs')
          ? new ReadableStream({
              start: (controller) => controller.error(new Error('Truncated download')),
            })
          : state.content || 'shell A';
      const response = new Response(body, {
        headers: { 'content-type': state.badMime && path.endsWith('.mjs') ? 'text/html' : type },
      });
      Object.defineProperty(response, 'url', { value: request.url });
      return response;
    },
    self: {
      registration: { scope: 'https://app.test/app/' },
      location: { origin: 'https://app.test' },
      addEventListener: (name, callback) => listeners.set(name, callback),
      skipWaiting: async () => state.skipped++,
      clients: {
        get: async (id) => state.clients.find((candidate) => candidate.id === id),
        matchAll: async () => state.clients,
        claim: async () => {},
      },
    },
  });
  state.dispatch = async (name, event = {}) => {
    let pending;
    listeners.get(name)({ ...event, waitUntil: (promise) => (pending = promise) });
    await pending;
  };
  state.message = async (type, requestId = 'request-1', sender = client) => {
    let result;
    await state.dispatch('message', {
      data: { type, requestId },
      source: sender,
      ports: [{ postMessage: (response) => (result = response) }],
    });
    return result && JSON.parse(JSON.stringify(result));
  };
  return state;
}

test('prepares the complete fresh shell without activating and reports its local identity', async () => {
  const state = worker();
  await state.dispatch('install');
  assert.equal(state.entries.size, 15);
  assert.ok(state.requests.every((request) => request.cache === 'reload'));
  assert.equal(state.skipped, 0);
  assert.deepEqual(await state.message('PUGGERN_IDENTITY'), {
    type: 'PUGGERN_RESULT',
    requestId: 'request-1',
    ok: true,
    version: '0.0.0',
    shell: '14',
  });
  assert.equal(state.skipped, 0);
});

test('failed MIME preparation never publishes a partial shell', async () => {
  const state = worker();
  state.badMime = true;
  await assert.rejects(state.dispatch('install'), /Invalid shell response/);
  assert.equal(state.entries.size, 0);
});

test('truncated bodies fail preparation before publishing any shell entries', async () => {
  const state = worker();
  state.truncated = true;
  await assert.rejects(state.dispatch('install'), /Truncated download/);
  assert.equal(state.entries.size, 0);
});

test('retained cache identities are immutable, with identical rollback content safely reusable', async () => {
  const state = worker();
  await state.dispatch('install');
  state.existed = true;
  await state.dispatch('install');
  assert.equal(state.writes, 15);
  state.content = 'unexpected new content';
  await assert.rejects(state.dispatch('install'), /new shell revision/);
  assert.equal(state.writes, 15);
  assert.deepEqual(state.deleted, []);
  assert.equal(await state.entries.get('https://app.test/app/index.html').text(), 'shell A');
});

test('cache write failures remove only the incomplete candidate cache', async () => {
  const state = worker();
  state.failWrite = true;
  await assert.rejects(state.dispatch('install'), /Cache write failed/);
  assert.deepEqual(state.deleted, ['puggern-app-shell-0.0.0-14']);
  assert.equal(state.skipped, 0);
});

test('activation checks all app windows, then retains old and unrelated caches', async () => {
  const state = worker();
  state.clients.push({ id: 'other', type: 'window', url: 'https://app.test/app/other' });
  assert.equal((await state.message('PUGGERN_ACTIVATE')).error, 'other-windows');
  assert.equal(state.skipped, 0);
  state.clients.pop();
  assert.equal((await state.message('PUGGERN_ACTIVATE')).ok, true);
  assert.equal(state.skipped, 1);
  await state.dispatch('activate');
  assert.deepEqual(state.deleted, []);
});

test('controlled reload checks app windows without requesting activation', async () => {
  const state = worker();
  assert.deepEqual(await state.message('PUGGERN_RELOAD_CHECK'), {
    type: 'PUGGERN_RESULT',
    requestId: 'request-1',
    ok: true,
    version: '0.0.0',
    shell: '14',
  });
  assert.equal(state.skipped, 0);
  state.clients.push({ id: 'other', type: 'window', url: 'https://app.test/app/other' });
  assert.equal((await state.message('PUGGERN_RELOAD_CHECK')).error, 'other-windows');
  assert.equal(state.skipped, 0);
});

test('natural activation only cleans recognized obsolete app shells when no app windows exist', async () => {
  const state = worker();
  await state.dispatch('activate');
  assert.deepEqual(state.deleted, []);
  state.clients = [{ id: 'outside', type: 'window', url: 'https://app.test/outside/' }];
  await state.dispatch('activate');
  assert.deepEqual(state.deleted, ['puggern-app-shell-v11', 'puggern-app-shell-0.0.0-11']);
});

test('malformed and unsupported requests are ignored without activating', async () => {
  const state = worker();
  for (const requestId of ['', 'a'.repeat(129), 42, null, 'has spaces']) {
    assert.equal(await state.message('PUGGERN_ACTIVATE', requestId), undefined);
  }
  assert.equal(await state.message('UNKNOWN'), undefined);
  for (const data of [null, [], 'PUGGERN_ACTIVATE', { type: 'PUGGERN_ACTIVATE' }]) {
    await state.dispatch('message', { data, ports: [], source: { id: 'page' } });
  }
  assert.equal(state.skipped, 0);
});

test('invalid, vanished and out-of-scope clients cannot query or activate', async () => {
  const state = worker();
  for (const sender of [{}, { id: 'absent' }, { id: 'a'.repeat(257) }]) {
    assert.equal(
      (await state.message('PUGGERN_ACTIVATE', 'request', sender)).error,
      'invalid-client',
    );
  }
  for (const url of ['https://other.test/app/', 'https://app.test/application/', 'invalid']) {
    state.clients[0].url = url;
    assert.equal((await state.message('PUGGERN_IDENTITY')).error, 'invalid-client');
  }
  assert.equal(state.skipped, 0);
});

test('shell and navigation fetches read only their own cache and unknown requests pass through', async () => {
  const state = worker();
  await state.dispatch('install');
  for (const request of [
    { url: 'https://app.test/app/route', method: 'GET', mode: 'navigate' },
    { url: 'https://app.test/app/src/app-version.mjs', method: 'GET', mode: 'cors' },
  ]) {
    let response;
    await state.dispatch('fetch', { request, respondWith: (promise) => (response = promise) });
    assert.equal(await (await response).text(), 'shell A');
  }
  for (const request of [
    { url: 'https://app.test/app/missing.mjs', method: 'GET' },
    { url: 'https://other.test/app/', method: 'GET', mode: 'navigate' },
    { url: 'https://app.test/outside/', method: 'GET', mode: 'navigate' },
    { url: 'https://app.test/app/src/app-version.mjs', method: 'POST' },
  ]) {
    let handled = false;
    await state.dispatch('fetch', { request, respondWith: () => (handled = true) });
    assert.equal(handled, false);
  }
});
