const APP_VERSION = '0.2.0'; // x-release-please-version
const SHELL_REVISION = '20';
const CACHE_NAME = `puggern-app-shell-${APP_VERSION}-${SHELL_REVISION}`;
const SCOPE = new URL(self.registration.scope);
let requestedActivation = false;
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=14',
  './manifest.webmanifest',
  './icons/pug-192.png',
  './icons/pug-512.png',
  './src/main.mjs?v=19',
  './src/history.mjs?v=3',
  './src/history-view.mjs?v=2',
  './src/practice-feedback.mjs?v=2',
  './src/learning.mjs?v=10',
  './src/spelling-feedback.mjs?v=1',
  './src/profiles.mjs?v=12',
  './src/word-sets.mjs?v=11',
  './src/creation-guard.mjs?v=3',
  './src/share-word-set.mjs?v=4',
  './src/app-version.mjs',
  './src/app-updates.mjs',
];
const SHELL_URLS = new Set(APP_SHELL.map((path) => new URL(path, SCOPE).href));

function isAppClient(client) {
  if (!client || client.type !== 'window') return false;
  try {
    const url = new URL(client.url);
    return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
  } catch {
    return false;
  }
}

async function prepareShell() {
  const entries = await Promise.all(
    [...SHELL_URLS].map(async (url) => {
      const response = await fetch(
        new Request(url, { cache: 'reload', credentials: 'same-origin' }),
      );
      const pathname = new URL(url).pathname;
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      const validMime = pathname.endsWith('.mjs')
        ? /^(?:text|application)\/(?:javascript|ecmascript)$/.test(mime || '')
        : pathname.endsWith('.css')
          ? mime === 'text/css'
          : pathname.endsWith('.png')
            ? mime === 'image/png'
            : pathname.endsWith('.webmanifest')
              ? ['application/manifest+json', 'application/json'].includes(mime)
              : mime === 'text/html';
      if (!response.ok || !validMime || new URL(response.url).origin !== SCOPE.origin) {
        throw new Error(`Invalid shell response: ${url}`);
      }
      const body = await response.arrayBuffer();
      return [
        url,
        new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }),
      ];
    }),
  );
  const existed = await caches.has(CACHE_NAME);
  const cache = await caches.open(CACHE_NAME);
  if (existed) {
    const unchanged = await Promise.all(
      entries.map(async ([url, response]) => {
        const cached = await cache.match(url);
        if (
          !cached ||
          cached.headers.get('content-type') !== response.headers.get('content-type')
        ) {
          return false;
        }
        const previous = new Uint8Array(await cached.arrayBuffer());
        const prepared = new Uint8Array(await response.arrayBuffer());
        return (
          previous.length === prepared.length &&
          previous.every((value, index) => value === prepared[index])
        );
      }),
    );
    if (!unchanged.every(Boolean))
      throw new Error('Shell content changed without a new shell revision');
    return;
  }
  try {
    await Promise.all(entries.map(([url, response]) => cache.put(url, response)));
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(prepareShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (!requestedActivation && !clients.some(isAppClient)) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter(
              (key) =>
                /^puggern-app-shell-(?:v\d+|\d+\.\d+\.\d+(?:-[\w.-]+)?-\d+)$/.test(key) &&
                key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        );
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !['PUGGERN_IDENTITY', 'PUGGERN_ACTIVATE', 'PUGGERN_RELOAD_CHECK'].includes(data.type) ||
    typeof data.requestId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(data.requestId) ||
    event.ports.length !== 1
  ) {
    return;
  }
  const reply = (result) =>
    event.ports[0].postMessage({ type: 'PUGGERN_RESULT', requestId: data.requestId, ...result });
  event.waitUntil(
    (async () => {
      const sourceId = event.source?.id;
      const source =
        typeof sourceId === 'string' &&
        sourceId.length > 0 &&
        sourceId.length <= 256 &&
        (await self.clients.get(sourceId));
      if (!isAppClient(source)) {
        reply({ ok: false, error: 'invalid-client' });
        return;
      }
      if (data.type === 'PUGGERN_ACTIVATE' || data.type === 'PUGGERN_RELOAD_CHECK') {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const appClients = clients.filter(isAppClient);
        if (!appClients.some((client) => client.id === source.id)) {
          reply({ ok: false, error: 'invalid-client' });
          return;
        }
        if (appClients.length !== 1) {
          reply({ ok: false, error: 'other-windows' });
          return;
        }
        if (data.type === 'PUGGERN_ACTIVATE') {
          requestedActivation = true;
          await self.skipWaiting();
        }
      }
      reply({ ok: true, version: APP_VERSION, shell: SHELL_REVISION });
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    new URL(event.request.url).origin !== self.location.origin
  ) {
    return;
  }

  if (event.request.mode === 'navigate') {
    if (!new URL(event.request.url).pathname.startsWith(SCOPE.pathname)) return;
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const response = await cache.match(new URL('./index.html', SCOPE).href);
        return response || Response.error();
      }),
    );
    return;
  }

  if (!SHELL_URLS.has(event.request.url)) return;
  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => (await cache.match(event.request)) || Response.error()),
  );
});
