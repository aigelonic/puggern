import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const frontend = new URL('../../../frontend/', import.meta.url);

async function readFrontend(directory = frontend, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = `${prefix}${entry.name}`;
      const url = new URL(entry.name, directory);
      return entry.isDirectory()
        ? readFrontend(new URL(`${entry.name}/`, directory), `${path}/`)
        : [[path, await readFile(url)]];
    }),
  );
  return files.flat();
}

function replaceMarker(source, pattern, replacement) {
  assert.equal([...source.matchAll(new RegExp(pattern.source, 'gm'))].length, 1);
  return source.replace(pattern, replacement);
}

const types = {
  html: 'text/html',
  mjs: 'text/javascript',
  js: 'text/javascript',
  css: 'text/css',
  png: 'image/png',
  webmanifest: 'application/manifest+json',
};

export async function startAppShellFixture() {
  const files = new Map(await readFrontend());
  let deployed;
  let releaseActivation;
  const state = { requests: [], activationHeld: false };

  function deploy({ version = '1.2.3', shell = 'A', holdActivation = false } = {}) {
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.match(shell, /^[A-Za-z0-9._-]+$/);
    const snapshot = new Map(files);
    const identity = JSON.stringify({ version, shell });
    snapshot.set(
      'index.html',
      replaceMarker(
        files.get('index.html').toString(),
        /<html lang="nb">/,
        `<html lang="nb" data-fixture-shell="${shell}">`,
      ),
    );
    snapshot.set(
      'src/app-version.mjs',
      replaceMarker(
        files.get('src/app-version.mjs').toString(),
        /export const APP_VERSION = '[^']+';[^\n]*/,
        `export const APP_VERSION = '${version}';`,
      ),
    );
    snapshot.set(
      'src/main.mjs',
      `${files.get('src/main.mjs').toString()}\nglobalThis.fixtureLoadedShell = ${identity};\n`,
    );
    let worker = replaceMarker(
      files.get('service-worker.js').toString(),
      /^const APP_VERSION = '[^']+';[^\n]*/m,
      `const APP_VERSION = '${version}';`,
    );
    worker = replaceMarker(
      worker,
      /^const SHELL_REVISION = '[^']+';/m,
      `const SHELL_REVISION = '${shell}';`,
    );
    if (holdActivation) {
      worker = replaceMarker(
        worker,
        /await self\.skipWaiting\(\);/,
        "await fetch(new URL('./fixture-activation', self.registration.scope)); await self.skipWaiting();",
      );
    }
    snapshot.set('service-worker.js', worker);
    deployed = snapshot;
  }

  deploy();
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture.test').pathname;
    state.requests.push(request.url);
    response.setHeader('cache-control', 'no-store');
    if (path === '/app/fixture-activation') {
      state.activationHeld = true;
      releaseActivation = () => response.end('continue');
      return;
    }
    const name = path === '/app/' ? 'index.html' : path.slice('/app/'.length);
    const body = path.startsWith('/app/') && deployed.get(name);
    if (!body) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.setHeader('content-type', types[name.split('.').at(-1)] ?? 'application/octet-stream');
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    state,
    deploy,
    release: () => releaseActivation?.(),
    async close() {
      releaseActivation?.();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}

export async function startStandaloneApp() {
  const display = spawn(
    'Xvfb',
    ['-displayfd', '1', '-screen', '0', '1280x1024x24', '-nolisten', 'tcp'],
    {
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  const stopped = new Promise((resolve) => {
    display.once('exit', resolve);
    display.once('error', resolve);
  });
  let context;
  try {
    const number = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Xvfb display startup timed out')), 5000);
      let output = '';
      const finish = (error, value) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      };
      display.once('error', (error) =>
        finish(new Error(`Standalone UI tests require Xvfb: ${error.message}`)),
      );
      display.once('exit', (code) => finish(new Error(`Xvfb exited during startup: ${code}`)));
      display.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (/^\d+\n$/.test(output)) finish(null, output.trim());
      });
    });
    context = await chromium.launchPersistentContext('', {
      headless: false,
      viewport: { width: 320, height: 568 },
      args: ['--app=about:blank'],
      env: { ...process.env, DISPLAY: `:${number}` },
    });
    return {
      context,
      async close() {
        try {
          await context.close();
        } finally {
          display.kill();
          await stopped;
        }
      },
    };
  } catch (error) {
    await context?.close();
    display.kill();
    await stopped;
    throw error;
  }
}
