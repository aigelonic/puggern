const CACHE_NAME = 'puggern-app-shell-v14';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=11',
  './manifest.webmanifest',
  './icons/pug-192.png',
  './icons/pug-512.png',
  './src/main.mjs?v=13',
  './src/practice-feedback.mjs?v=1',
  './src/learning.mjs?v=7',
  './src/profiles.mjs?v=7',
  './src/word-sets.mjs?v=8',
  './src/creation-guard.mjs?v=3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('puggern-app-shell-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
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
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
