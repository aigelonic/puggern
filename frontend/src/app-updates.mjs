const COPY = {
  unsupported: 'Nettleseren støtter ikke appoppdateringer.',
  offline: 'Du trenger internett for å se etter oppdateringer.',
  checking: 'Ser etter oppdateringer.',
  idle: 'Ingen nedlastet oppdatering er klar.',
  downloading: 'Laster ned og klargjør oppdateringen.',
  error: 'Kunne ikke se etter oppdateringer. Prøv igjen senere.',
  applying: 'Klargjør oppdatering og ny innlasting.',
  applyError: 'Kunne ikke oppdatere appen. Prøv igjen senere.',
  prepareError: 'Oppdateringen ble avbrutt. Kontroller at fremdriften er lagret og prøv igjen.',
  otherWindows: 'Lukk andre Puggern-vinduer og prøv igjen.',
};

function validIdentity(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const number = '(?:0|[1-9][0-9]*)';
  const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
  const semver = new RegExp(
    `^${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
  );
  return (
    typeof data.version === 'string' &&
    data.version.length <= 128 &&
    semver.test(data.version) &&
    typeof data.shell === 'string' &&
    /^[A-Za-z0-9._-]{1,64}$/.test(data.shell)
  );
}

export function createAppUpdates({
  navigator = globalThis.navigator,
  serviceWorker = navigator?.serviceWorker,
  window = globalThis.window,
  document = globalThis.document,
  version,
  onState = () => {},
  prepare = async () => false,
  reload = () => window.location.reload(),
  MessageChannel = globalThis.MessageChannel,
  now = Date.now,
  timeoutMs = 10_000,
} = {}) {
  let registration;
  let starting;
  let checking;
  let manualCheck = false;
  let applying;
  let lastCheck = -Infinity;
  let sequence = 0;
  let observation = 0;
  let previousController = serviceWorker?.controller;
  let reloaded = false;
  const dismissed = new Set();
  const watched = new WeakSet();
  let state = { status: 'idle', message: '', candidate: null, banner: false, busy: false };

  function emit(patch) {
    const next = { ...state, ...patch };
    if (Object.keys(next).every((key) => next[key] === state[key])) return;
    state = next;
    onState({ ...state });
  }

  function ready(candidate) {
    if (
      state.candidate?.worker === candidate.worker &&
      state.candidate.key === candidate.key &&
      state.candidate.controlled === candidate.controlled
    ) {
      candidate = state.candidate;
    }
    const message =
      candidate.version === version
        ? 'Oppdatert appinnhold er klart.'
        : `En oppdatering er klar. Ny versjon ${candidate.version} er klar.`;
    emit({
      status: 'ready',
      message,
      candidate,
      banner: !dismissed.has(candidate.key),
      busy: Boolean(applying),
    });
  }

  function bounded(operation) {
    let timer;
    return Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  function request(worker, type, transition) {
    return new Promise((resolve, reject) => {
      let channel;
      let timer;
      const requestId = `update:${++sequence}`;
      const finish = (error, data) => {
        clearTimeout(timer);
        if (channel) {
          channel.port1.onmessage = null;
          channel.port1.close();
          channel.port2.close();
        }
        transition?.cleanups.delete(cancel);
        if (error) reject(error);
        else resolve(data);
      };
      const cancel = () => finish(new Error('cancelled'));
      try {
        channel = new MessageChannel();
        transition?.cleanups.add(cancel);
        timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
        channel.port1.onmessage = ({ data }) => {
          if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data) ||
            data.type !== 'PUGGERN_RESULT' ||
            data.requestId !== requestId ||
            typeof data.ok !== 'boolean'
          ) {
            return;
          }
          if (data.ok && validIdentity(data)) finish(null, data);
          else if (!data.ok && ['other-windows', 'invalid-client'].includes(data.error)) {
            finish(new Error(data.error));
          }
        };
        channel.port1.start?.();
        worker.postMessage({ type, requestId }, [channel.port2]);
      } catch (error) {
        finish(error);
      }
    });
  }

  async function inspect(worker, controlled = false) {
    const ticket = ++observation;
    if (
      !worker ||
      (!controlled &&
        (!serviceWorker.controller ||
          serviceWorker.controller === worker ||
          worker.state !== 'installed'))
    ) {
      return false;
    }
    const identity = await request(worker, 'PUGGERN_IDENTITY');
    if (
      ticket !== observation ||
      (controlled
        ? serviceWorker.controller !== worker
        : registration.waiting !== worker ||
          serviceWorker.controller === worker ||
          worker.state !== 'installed')
    ) {
      return false;
    }
    ready({
      worker,
      version: identity.version,
      shell: identity.shell,
      key: `${identity.version}:${identity.shell}`,
      ...(controlled ? { controlled: true } : {}),
    });
    return true;
  }

  function background(operation) {
    void Promise.resolve()
      .then(operation)
      .catch(() => {});
  }

  function watch(worker) {
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') background(reconcile);
      if (worker.state === 'redundant') {
        if (state.candidate?.worker === worker) {
          emit({ candidate: null, banner: false });
        }
        if (!applying) emit({ status: 'error', message: COPY.error, busy: false });
      }
    });
  }

  async function reconcile() {
    if (
      registration.waiting &&
      registration.waiting !== serviceWorker.controller &&
      serviceWorker.controller &&
      registration.waiting.state === 'installed'
    ) {
      return inspect(registration.waiting);
    }
    if (state.candidate && state.candidate.worker === serviceWorker.controller) {
      if (!state.candidate.controlled) return inspect(serviceWorker.controller, true);
      ready(state.candidate);
      return true;
    }
    ++observation;
    emit({
      candidate: null,
      banner: false,
      status: registration.installing ? 'downloading' : 'idle',
      message: registration.installing ? COPY.downloading : COPY.idle,
    });
    return false;
  }

  function check({ manual = false } = {}) {
    if (checking) {
      if (manual) {
        manualCheck = true;
        emit({ status: 'checking', message: COPY.checking, busy: true });
      }
      return checking;
    }
    if (!serviceWorker) {
      emit({ status: 'unsupported', message: COPY.unsupported, busy: false });
      return Promise.resolve(false);
    }
    if (applying) return Promise.resolve(false);
    if (navigator?.onLine === false) {
      if (manual) emit({ status: 'offline', message: COPY.offline, busy: false });
      return Promise.resolve(false);
    }
    if (!registration) return start();
    if (!manual && now() - lastCheck < 60_000) return Promise.resolve(false);
    lastCheck = now();
    manualCheck = manual;
    if (manual) emit({ status: 'checking', message: COPY.checking, busy: true });
    checking = (async () => {
      try {
        await bounded(() => registration.update());
        watch(registration.installing);
        if (!(await reconcile())) {
          emit({
            status: registration.installing ? 'downloading' : 'idle',
            message: registration.installing ? COPY.downloading : COPY.idle,
            busy: false,
          });
        }
        return true;
      } catch {
        if (manualCheck) emit({ status: 'error', message: COPY.error, busy: false });
        return false;
      } finally {
        checking = null;
        if (!applying && state.busy) emit({ busy: false });
      }
    })();
    return checking;
  }

  function start() {
    if (starting) return starting;
    starting = (async () => {
      if (!serviceWorker) {
        emit({ status: 'unsupported', message: COPY.unsupported });
        return false;
      }
      try {
        registration = await bounded(() =>
          serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }),
        );
        serviceWorker.addEventListener('controllerchange', () => {
          const controller = serviceWorker.controller;
          const wasControlled = Boolean(previousController);
          const changed = controller !== previousController;
          previousController = controller;
          if (wasControlled && changed && controller && applying?.expected !== controller) {
            background(() => inspect(controller, true));
          }
        });
        registration.addEventListener('updatefound', () => {
          watch(registration.installing);
          if (!applying && !state.candidate) {
            emit({ status: 'downloading', message: COPY.downloading, busy: false });
          }
        });
        watch(registration.installing);
        window?.addEventListener('online', () => background(() => check()));
        document?.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') background(() => check());
        });
        try {
          await reconcile();
        } catch {
          emit({ status: 'error', message: COPY.error });
        }
        await check();
        return true;
      } catch {
        emit({ status: 'error', message: COPY.error, busy: false });
        return false;
      }
    })().then((result) => {
      if (!result) starting = null;
      return result;
    });
    return starting;
  }

  async function apply() {
    if (applying || reloaded || !state.candidate) return false;
    const selected = state.candidate;
    const transition = { active: true, expected: null, cleanups: new Set() };
    applying = transition;
    emit({ status: 'applying', message: COPY.applying, busy: true });
    try {
      return await bounded(async () => {
        let prepared;
        try {
          prepared = await prepare();
        } catch {
          throw new Error('prepare');
        }
        if (!transition.active) return false;
        if (prepared !== true) throw new Error('prepare');
        const worker = selected.worker;
        const current = () =>
          selected.controlled
            ? serviceWorker.controller === worker && !registration.waiting
            : registration.waiting === worker && worker.state === 'installed';
        if (!current()) {
          await reconcile();
          return false;
        }
        const identity = await request(worker, 'PUGGERN_IDENTITY', transition);
        if (!transition.active) return false;
        if (!current() || `${identity.version}:${identity.shell}` !== selected.key) {
          await reconcile();
          return false;
        }
        if (selected.controlled) {
          const result = await request(worker, 'PUGGERN_RELOAD_CHECK', transition);
          if (
            !transition.active ||
            !current() ||
            `${result.version}:${result.shell}` !== selected.key
          ) {
            await reconcile();
            return false;
          }
          reloaded = true;
          reload();
          return true;
        }
        transition.expected = worker;
        let controlled;
        const control = new Promise((resolve, reject) => {
          controlled = () => {
            if (serviceWorker.controller === worker) resolve();
          };
          serviceWorker.addEventListener('controllerchange', controlled);
          transition.cleanups.add(() => {
            serviceWorker.removeEventListener('controllerchange', controlled);
            reject(new Error('cancelled'));
          });
          controlled();
        });
        const activation = request(worker, 'PUGGERN_ACTIVATE', transition);
        const [result] = await Promise.all([activation, control]);
        if (
          !transition.active ||
          serviceWorker.controller !== worker ||
          `${result.version}:${result.shell}` !== selected.key
        ) {
          throw new Error('changed');
        }
        reloaded = true;
        reload();
        return true;
      });
    } catch (error) {
      emit({
        status: 'error',
        message:
          error.message === 'other-windows'
            ? COPY.otherWindows
            : error.message === 'prepare'
              ? COPY.prepareError
              : COPY.applyError,
      });
      return false;
    } finally {
      transition.active = false;
      for (const cleanup of transition.cleanups) cleanup();
      applying = null;
      if (
        !reloaded &&
        state.candidate?.worker === serviceWorker.controller &&
        !registration.waiting
      ) {
        emit({ candidate: { ...state.candidate, controlled: true } });
      }
      emit({ busy: false });
    }
  }

  function dismiss() {
    if (!state.candidate) return;
    dismissed.add(state.candidate.key);
    emit({ banner: false });
  }

  function reopen() {
    if (!state.candidate) return;
    dismissed.delete(state.candidate.key);
    ready(state.candidate);
  }

  return { start, check, apply, dismiss, reopen };
}
