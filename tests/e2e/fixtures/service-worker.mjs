import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const workerSource = await readFile(
  new URL('../../../frontend/service-worker.js', import.meta.url),
  'utf8',
);
const shellPaths = [
  './',
  './index.html',
  './styles.css?v=9',
  './manifest.webmanifest',
  './icons/pug-192.png',
  './icons/pug-512.png',
  './src/main.mjs?v=10',
  './src/learning.mjs?v=6',
  './src/profiles.mjs?v=6',
  './src/word-sets.mjs?v=7',
  './src/creation-guard.mjs?v=3',
  './src/app-version.mjs',
  './src/app-updates.mjs',
];

export async function startWorkerFixture() {
  const state = {
    version: '1.0.0',
    shell: 'A',
    failure: null,
    legacy: false,
    gate: false,
    gated: false,
    requests: [],
  };
  let releaseGate;
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture.test');
    const path = url.pathname;
    state.requests.push({ url: request.url, cacheControl: request.headers['cache-control'] });
    response.setHeader('cache-control', 'no-store');
    if (path === '/app/activation-gate') {
      state.gated = true;
      releaseGate = () => response.end('continue');
      return;
    }
    if (path === '/app/service-worker.js') {
      response.setHeader('content-type', 'text/javascript');
      if (state.legacy) {
        response.end(`
          const name = 'puggern-app-shell-v8';
          self.addEventListener('install', event => event.waitUntil(
            caches.open(name).then(cache => cache.addAll(${JSON.stringify(shellPaths)}))
              .then(() => self.skipWaiting())));
          self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
          self.addEventListener('fetch', event => event.respondWith(
            caches.open(name).then(async cache => await cache.match(event.request) || fetch(event.request))));
        `);
      } else {
        let script = workerSource
          .replace(/^const APP_VERSION = .*;.*$/m, `const APP_VERSION = '${state.version}';`)
          .replace(/^const SHELL_REVISION = .*;$/m, `const SHELL_REVISION = '${state.shell}';`);
        if (state.gate) {
          script = script.replace(
            'await self.skipWaiting();',
            "await fetch(new URL('./activation-gate', self.registration.scope)); await self.skipWaiting();",
          );
        }
        response.end(script);
      }
      return;
    }
    if (
      (state.failure === 'missing' && path === '/app/src/app-version.mjs') ||
      (state.failure === 'http' && path === '/app/styles.css')
    ) {
      response.writeHead(state.failure === 'missing' ? 404 : 503);
      response.end('unavailable');
      return;
    }
    if (path === '/app/' || path === '/app/index.html' || path === '/outside/') {
      response.setHeader('content-type', 'text/html');
      response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8">
        <title>Shell ${state.shell}</title><link rel="stylesheet" href="./styles.css?v=9">
        </head><body><h1 id="identity">${state.version}:${state.shell}</h1>
        <script type="module" src="./src/main.mjs?v=10"></script></body></html>`);
      return;
    }
    if (path === '/app/styles.css') {
      response.setHeader('cache-control', 'max-age=3600');
      response.setHeader('content-type', 'text/css');
      response.end(`body { --fixture-shell: ${state.shell}; }`);
      return;
    }
    if (path === '/app/manifest.webmanifest') {
      response.setHeader('content-type', 'application/manifest+json');
      response.end('{}');
      return;
    }
    if (/^\/app\/icons\/pug-(192|512)\.png$/.test(path)) {
      response.setHeader('content-type', 'image/png');
      response.end(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=',
          'base64',
        ),
      );
      return;
    }
    if (shellPaths.some((asset) => new URL(asset, 'http://fixture.test/app/').pathname === path)) {
      response.setHeader('cache-control', 'max-age=3600');
      response.setHeader(
        'content-type',
        (state.legacy && path === '/app/src/profiles.mjs') ||
          (state.failure === 'mime' && path === '/app/src/app-updates.mjs')
          ? 'application/octet-stream'
          : 'text/javascript',
      );
      if (path.endsWith('/main.mjs')) {
        response.end(`import { APP_VERSION } from './app-version.mjs';
          import { shell } from './app-updates.mjs';
          window.loadedShell = { version: APP_VERSION, shell };
          window.loadCount = Number(sessionStorage.getItem('loads') || 0) + 1;
          sessionStorage.setItem('loads', window.loadCount);`);
      } else if (path.endsWith('/app-version.mjs')) {
        response.end(`export const APP_VERSION = '${state.version}';`);
      } else {
        response.end(`export const shell = '${state.shell}';`);
      }
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    state,
    origin: `http://127.0.0.1:${server.address().port}`,
    release: () => releaseGate?.(),
    close: async () => {
      releaseGate?.();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}

export async function installWorker(page, origin) {
  await page.goto(`${origin}/app/`);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('./service-worker.js', {
      updateViaCache: 'none',
    });
    const installing = registration.installing;
    if (installing) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Install stalled: ${installing.state}`)),
          5000,
        );
        const changed = () => {
          if (installing.state === 'redundant') {
            clearTimeout(timeout);
            reject(new Error('Fixture worker installation failed'));
          } else if (['installed', 'activating', 'activated'].includes(installing.state)) {
            clearTimeout(timeout);
            resolve();
          }
        };
        installing.addEventListener('statechange', changed);
        changed();
      });
    }
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });
}

export async function updateWorker(page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const finished = new Promise((resolve) => {
      registration.addEventListener(
        'updatefound',
        () => {
          const worker = registration.installing;
          worker.addEventListener('statechange', () => {
            if (['installed', 'redundant'].includes(worker.state)) resolve(worker.state);
          });
        },
        { once: true },
      );
    });
    await registration.update();
    return finished;
  });
}

export async function workerMessage(page, target, type, requestId = 'fixture-request') {
  return page.evaluate(
    async ({ target, type, requestId }) => {
      const registration = await navigator.serviceWorker.getRegistration('/app/');
      const worker =
        target === 'controller' ? navigator.serviceWorker.controller : registration[target];
      const channel = new MessageChannel();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Worker reply timed out')), 3000);
        channel.port1.onmessage = ({ data }) => {
          clearTimeout(timeout);
          channel.port1.close();
          resolve(data);
        };
        worker.postMessage({ type, requestId }, [channel.port2]);
      });
    },
    { target, type, requestId },
  );
}
