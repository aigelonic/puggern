import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppUpdates } from '../frontend/src/app-updates.mjs';

class Events {
  listeners = new Map();
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }
  fire(type) {
    for (const callback of this.listeners.get(type) || []) callback();
  }
}

class Channel {
  constructor() {
    this.port1 = { close() {}, start() {}, onmessage: null };
    this.port2 = {
      close() {},
      postMessage: (data) => this.port1.onmessage?.({ data }),
    };
  }
}

function worker(version = '2.0.0', shell = '2') {
  const target = new Events();
  target.state = 'installed';
  target.messages = [];
  target.postMessage = (data, [port]) => {
    target.messages.push(data.type);
    const reply = (patch = {}) =>
      port.postMessage({
        type: 'PUGGERN_RESULT',
        requestId: data.requestId,
        ok: true,
        version,
        shell,
        ...patch,
      });
    if (target.respond) target.respond(data, reply);
    else reply();
  };
  return target;
}

function fixture(options = {}) {
  const registration = new Events();
  registration.waiting = options.first ? null : worker();
  registration.update = async () => {
    updates += 1;
  };
  const serviceWorker = new Events();
  serviceWorker.controller = options.first ? null : worker('1.0.0', '1');
  serviceWorker.register = async (...args) => {
    registrations.push(args);
    return registration;
  };
  const window = new Events();
  const document = new Events();
  document.visibilityState = 'visible';
  const navigator = { onLine: true };
  const states = [];
  const registrations = [];
  let updates = 0;
  let reloads = 0;
  let clock = 0;
  const api = createAppUpdates({
    serviceWorker,
    window,
    document,
    navigator,
    version: '1.0.0',
    MessageChannel: Channel,
    timeoutMs: 35,
    onState: (state) => states.push(state),
    prepare: async () => true,
    reload: () => {
      reloads += 1;
    },
    now: () => clock,
    ...options,
  });
  return {
    api,
    registration,
    serviceWorker,
    window,
    document,
    navigator,
    states,
    registrations,
    get state() {
      return states.at(-1);
    },
    get updates() {
      return updates;
    },
    get reloads() {
      return reloads;
    },
    advance: () => {
      clock += 60_000;
    },
    control(target) {
      serviceWorker.controller = target;
      serviceWorker.fire('controllerchange');
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('registers stable URL once, checks once, and finds an existing waiting worker', async () => {
  const app = fixture();
  await Promise.all([app.api.start(), app.api.start()]);
  assert.deepEqual(app.registrations, [['./service-worker.js', { updateViaCache: 'none' }]]);
  assert.equal(app.updates, 1);
  assert.equal(app.state.status, 'ready');
  assert.equal(app.state.candidate.key, '2.0.0:2');
  assert.equal(app.state.banner, true);
  assert.equal(app.reloads, 0);
});

test('first install and its controllerchange never offer an update or reload', async () => {
  const app = fixture({ first: true });
  await app.api.start();
  const initial = worker('1.0.0', '1');
  app.registration.waiting = initial;
  app.registration.installing = initial;
  app.registration.fire('updatefound');
  initial.fire('statechange');
  app.control(initial);
  await flush();
  assert.equal(app.state.candidate, null);
  assert.equal(app.reloads, 0);
});

test('automatic checks throttle, foreground requires visible, manual bypasses and deduplicates', async () => {
  const app = fixture();
  await app.api.start();
  app.window.fire('online');
  app.document.fire('visibilitychange');
  await flush();
  assert.equal(app.updates, 1);
  app.advance();
  app.document.visibilityState = 'hidden';
  app.document.fire('visibilitychange');
  await flush();
  assert.equal(app.updates, 1);
  app.document.visibilityState = 'visible';
  app.document.fire('visibilitychange');
  await flush();
  assert.equal(app.updates, 2);
  let release;
  app.registration.update = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const first = app.api.check({ manual: true });
  assert.equal(app.api.check({ manual: true }), first);
  await flush();
  release();
  await first;
  assert.equal(app.state.busy, false);
});

test('dismissal is exact, reopening works, same-version content and rollback are ready', async () => {
  const app = fixture();
  await app.api.start();
  app.api.dismiss();
  await app.api.check({ manual: true });
  assert.equal(app.state.banner, false);
  app.api.reopen();
  assert.equal(app.state.banner, true);
  await app.api.check({ manual: true });
  assert.equal(app.state.banner, true);
  app.registration.waiting = worker('1.0.0', '3');
  await app.api.check({ manual: true });
  assert.equal(app.state.message, 'Oppdatert appinnhold er klart.');
  assert.equal(app.state.banner, true);
  app.registration.waiting = worker('0.9.0', '4');
  await app.api.check({ manual: true });
  assert.equal(app.state.candidate.version, '0.9.0');
  assert.equal(app.reloads, 0);
});

test('offline manual status preserves the candidate, automatic failures stay quiet', async () => {
  const app = fixture();
  await app.api.start();
  const candidate = app.state.candidate;
  app.navigator.onLine = false;
  await app.api.check({ manual: true });
  assert.equal(app.state.status, 'offline');
  assert.equal(app.state.candidate, candidate);
  const count = app.states.length;
  app.advance();
  await app.api.check();
  assert.equal(app.states.length, count);
  app.navigator.onLine = true;
  app.registration.update = async () => {
    throw new Error('network');
  };
  app.advance();
  await app.api.check();
  assert.equal(app.states.length, count);
  await app.api.check({ manual: true });
  assert.equal(app.state.message, 'Kunne ikke se etter oppdateringer. Prøv igjen senere.');
});

test('unsupported, registration rejection and hung registration are bounded', async () => {
  const unsupported = fixture({ serviceWorker: null });
  assert.equal(await unsupported.api.start(), false);
  assert.equal(unsupported.state.status, 'unsupported');
  for (const register of [() => Promise.reject(new Error('failed')), () => new Promise(() => {})]) {
    const app = fixture({ serviceWorker: { register } });
    assert.equal(await app.api.start(), false);
    assert.equal(app.state.status, 'error');
  }
});

test('updatefound waits for installed waiting identity; failed installation is not ready', async () => {
  const app = fixture({ first: true });
  app.serviceWorker.controller = worker('1.0.0', '1');
  await app.api.start();
  const incoming = worker();
  incoming.state = 'installing';
  app.registration.installing = incoming;
  app.registration.fire('updatefound');
  assert.equal(app.state.status, 'downloading');
  assert.equal(app.state.candidate, null);
  app.registration.waiting = incoming;
  incoming.state = 'installed';
  incoming.fire('statechange');
  await flush();
  assert.equal(app.state.status, 'ready');
  incoming.state = 'redundant';
  incoming.fire('statechange');
  assert.equal(app.state.candidate, null);
  assert.equal(app.state.status, 'error');
});

test('ignores malformed identity messages until a valid reply or timeout', async () => {
  const app = fixture();
  const target = app.registration.waiting;
  target.respond = (_data, reply) => {
    reply({ requestId: 'wrong' });
    reply({ version: '01.2.3' });
    reply({ version: '1.0.0-01' });
    reply({ shell: 'x'.repeat(65) });
    reply({ ok: 'yes' });
    reply({ version: '2.0.0-beta.1+build' });
  };
  await app.api.start();
  assert.equal(app.state.candidate.version, '2.0.0-beta.1+build');
  target.respond = (_data, reply) => reply({ version: '<script>' });
  await app.api.check({ manual: true });
  assert.equal(app.state.status, 'error');
  assert.equal(app.state.busy, false);
});

test('hung update recovers controls and can be retried', async () => {
  const app = fixture();
  await app.api.start();
  app.registration.update = () => new Promise(() => {});
  assert.equal(await app.api.check({ manual: true }), false);
  assert.equal(app.state.busy, false);
  app.registration.update = async () => {};
  assert.equal(await app.api.check({ manual: true }), true);
});

for (const order of ['event-first', 'reply-first']) {
  test(`applies once with ${order} activation, never on discovery`, async () => {
    const app = fixture();
    await app.api.start();
    const target = app.registration.waiting;
    target.respond = (data, reply) => {
      if (data.type === 'PUGGERN_IDENTITY') return reply();
      if (order === 'event-first') {
        app.control(target);
        reply();
      } else {
        reply();
        queueMicrotask(() => app.control(target));
      }
    };
    assert.deepEqual(await Promise.all([app.api.apply(), app.api.apply()]), [true, false]);
    app.serviceWorker.fire('controllerchange');
    assert.equal(await app.api.apply(), false);
    assert.equal(app.reloads, 1);
    assert.equal(target.messages.filter((type) => type === 'PUGGERN_ACTIVATE').length, 1);
  });
}

test('prepare false, throw, or timeout never activates; late preparation cannot reload', async () => {
  let release;
  for (const prepare of [
    async () => false,
    async () => {
      throw new Error('save');
    },
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  ]) {
    const app = fixture({ prepare });
    await app.api.start();
    assert.equal(await app.api.apply(), false);
    assert.equal(app.state.busy, false);
    release?.(true);
    await flush();
    assert.equal(app.registration.waiting.messages.includes('PUGGERN_ACTIVATE'), false);
    assert.equal(app.reloads, 0);
  }
});

test('reconciles a replaced candidate after preparation without stale activation', async () => {
  let release;
  const app = fixture({
    prepare: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  await app.api.start();
  const old = app.registration.waiting;
  const pending = app.api.apply();
  await flush();
  app.registration.waiting = worker('3.0.0', '3');
  release(true);
  assert.equal(await pending, false);
  assert.equal(old.messages.includes('PUGGERN_ACTIVATE'), false);
  assert.equal(app.state.candidate.version, '3.0.0');
  assert.equal(app.reloads, 0);
});

test('other windows block reload even when controllerchange preceded rejection', async () => {
  const app = fixture();
  await app.api.start();
  const target = app.registration.waiting;
  target.respond = (data, reply) => {
    if (data.type === 'PUGGERN_IDENTITY') return reply();
    app.control(target);
    reply({ ok: false, error: 'other-windows' });
  };
  assert.equal(await app.api.apply(), false);
  assert.equal(app.state.message, 'Lukk andre Puggern-vinduer og prøv igjen.');
  assert.equal(app.state.busy, false);
  assert.equal(app.reloads, 0);
});

test('activation timeout and wrong controller cannot reload, even on late expected control', async () => {
  const app = fixture();
  await app.api.start();
  const target = app.registration.waiting;
  target.respond = (data, reply) => {
    reply();
    if (data.type === 'PUGGERN_ACTIVATE') app.control(worker('3.0.0', '3'));
  };
  assert.equal(await app.api.apply(), false);
  assert.equal(app.state.busy, false);
  app.registration.waiting = null;
  app.control(target);
  await flush();
  assert.equal(app.reloads, 0);
});

test('unsolicited control offers guarded reload through client check without activation', async () => {
  let prepared = 0;
  const app = fixture({
    prepare: async () => {
      prepared += 1;
      return true;
    },
  });
  await app.api.start();
  const target = worker('3.0.0', '3');
  app.registration.waiting = null;
  app.control(target);
  await flush();
  assert.equal(app.state.candidate.controlled, true);
  assert.equal(app.reloads, 0);
  assert.equal(await app.api.apply(), true);
  assert.equal(prepared, 1);
  assert.equal(target.messages.includes('PUGGERN_RELOAD_CHECK'), true);
  assert.equal(target.messages.includes('PUGGERN_ACTIVATE'), false);
  assert.equal(app.reloads, 1);
});

test('manual check retries registration after an initial failure', async () => {
  const app = fixture();
  const register = app.serviceWorker.register;
  app.serviceWorker.register = async () => {
    throw new Error('registration');
  };
  assert.equal(await app.api.start(), false);
  app.serviceWorker.register = register;
  assert.equal(await app.api.check({ manual: true }), true);
  assert.equal(app.state.status, 'ready');
});

test('unchanged candidates are not reannounced by foreground checks', async () => {
  const app = fixture();
  await app.api.start();
  const count = app.states.length;
  app.advance();
  app.document.fire('visibilitychange');
  await flush();
  assert.equal(app.states.length, count);
});

test('manual check joining an automatic check receives its bounded failure status', async () => {
  const app = fixture();
  await app.api.start();
  app.advance();
  app.registration.update = () => new Promise(() => {});
  const automatic = app.api.check();
  assert.equal(app.api.check({ manual: true }), automatic);
  assert.equal(app.state.status, 'checking');
  await automatic;
  assert.equal(app.state.status, 'error');
  assert.equal(app.state.busy, false);
});

test('candidate disappearance and redundancy during preparation recover without activation', async () => {
  for (const disappear of [true, false]) {
    let release;
    const app = fixture({
      prepare: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    await app.api.start();
    const target = app.registration.waiting;
    const pending = app.api.apply();
    await flush();
    if (disappear) app.registration.waiting = null;
    else target.state = 'redundant';
    release(true);
    assert.equal(await pending, false);
    assert.equal(target.messages.includes('PUGGERN_ACTIVATE'), false);
    assert.equal(app.state.candidate, null);
    assert.equal(app.state.status, 'idle');
    assert.equal(app.state.busy, false);
  }
});

test('an identity change during apply is reoffered, never activated as the old selection', async () => {
  const app = fixture();
  await app.api.start();
  const target = app.registration.waiting;
  target.respond = (_data, reply) => reply({ shell: '3' });
  assert.equal(await app.api.apply(), false);
  assert.equal(app.state.candidate.key, '2.0.0:3');
  assert.equal(target.messages.includes('PUGGERN_ACTIVATE'), false);
});

test('an older identity reply cannot overwrite a newer candidate', async () => {
  const app = fixture({ first: true });
  app.serviceWorker.controller = worker('1.0.0', '1');
  await app.api.start();
  let replyOld;
  const old = worker();
  old.respond = (_data, reply) => {
    replyOld = reply;
  };
  app.registration.waiting = old;
  app.registration.installing = old;
  app.registration.fire('updatefound');
  old.fire('statechange');
  await flush();
  const replacement = worker('3.0.0', '3');
  app.registration.waiting = replacement;
  app.registration.installing = replacement;
  app.registration.fire('updatefound');
  replacement.fire('statechange');
  await flush();
  replyOld();
  await flush();
  assert.equal(app.state.candidate.key, '3.0.0:3');
});

test('no activation acknowledgement or invalid acknowledgement never permits reload', async () => {
  for (const mode of ['silent', 'invalid-client', 'wrong-identity', 'throw']) {
    const app = fixture();
    await app.api.start();
    const target = app.registration.waiting;
    target.respond = (data, reply) => {
      if (data.type === 'PUGGERN_IDENTITY') return reply();
      app.registration.waiting = null;
      app.control(target);
      if (mode === 'silent') return;
      if (mode === 'throw') throw new Error('message');
      if (mode === 'invalid-client') reply({ ok: false, error: 'invalid-client' });
      if (mode === 'wrong-identity') reply({ shell: '99' });
    };
    assert.equal(await app.api.apply(), false);
    assert.equal(app.reloads, 0);
    assert.equal(app.state.busy, false);
    assert.equal(app.state.candidate.controlled, true);
  }
});

test('timed-out activation can be retried as a guarded controlled reload', async () => {
  const app = fixture();
  await app.api.start();
  const target = app.registration.waiting;
  target.respond = (data, reply) => {
    if (data.type === 'PUGGERN_IDENTITY') return reply();
    app.registration.waiting = null;
    app.control(target);
  };
  assert.equal(await app.api.apply(), false);
  target.respond = (_data, reply) => reply();
  assert.equal(await app.api.apply(), true);
  assert.equal(app.reloads, 1);
});

test('controlled reload uses the client check and obeys the worker multiwindow rejection', async () => {
  const app = fixture();
  await app.api.start();
  const target = worker('3.0.0', '3');
  app.registration.waiting = null;
  app.control(target);
  await flush();
  target.respond = (data, reply) => {
    if (data.type === 'PUGGERN_IDENTITY') reply();
    else reply({ ok: false, error: 'other-windows' });
  };
  assert.equal(await app.api.apply(), false);
  assert.equal(app.state.message, 'Lukk andre Puggern-vinduer og prøv igjen.');
  assert.equal(app.reloads, 0);
  assert.equal(target.messages.includes('PUGGERN_RELOAD_CHECK'), true);
  assert.equal(target.messages.includes('PUGGERN_ACTIVATE'), false);
});

test('browser-style asynchronous message channels complete and close cleanly', async () => {
  const app = fixture({ MessageChannel: globalThis.MessageChannel, timeoutMs: 500 });
  await app.api.start();
  assert.equal(app.state.status, 'ready');
  const target = app.registration.waiting;
  target.respond = (data, reply) => {
    reply();
    if (data.type === 'PUGGERN_ACTIVATE') app.control(target);
  };
  assert.equal(await app.api.apply(), true);
  assert.equal(app.reloads, 1);
});

test('offline startup does not consume the network-check throttle on reconnect', async () => {
  const app = fixture();
  app.navigator.onLine = false;
  await app.api.start();
  assert.equal(app.updates, 0);
  const candidate = app.state.candidate;
  app.window.fire('online');
  await flush();
  assert.equal(app.updates, 0);
  app.navigator.onLine = true;
  app.window.fire('online');
  await flush();
  assert.equal(app.updates, 1);
  assert.equal(app.state.candidate, candidate);
});

test('offline manual checks explain connectivity even without a registration', async () => {
  const app = fixture();
  app.navigator.onLine = false;
  assert.equal(await app.api.check({ manual: true }), false);
  assert.equal(app.state.status, 'offline');
  assert.equal(app.registrations.length, 0);
});

test('external activation during preparation retains a controlled reload offer', async () => {
  let release;
  const app = fixture({
    prepare: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  await app.api.start();
  const pending = app.api.apply();
  await flush();
  const target = app.registration.waiting;
  const replies = [];
  target.respond = (_data, reply) => replies.push(reply);
  app.registration.waiting = null;
  app.control(target);
  await flush();
  release(true);
  await flush();
  for (const reply of replies) reply();
  assert.equal(await pending, false);
  assert.equal(app.state.candidate.worker, target);
  assert.equal(app.state.candidate.controlled, true);
  assert.equal(app.state.status, 'ready');
  assert.equal(app.state.busy, false);
  assert.equal(app.reloads, 0);
});
