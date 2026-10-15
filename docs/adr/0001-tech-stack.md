# ADR 0001: Static Frontend and Local-Only Data

- Status: Accepted
- Date: 2026-10-14

## Context

Puggern is a small, low-traffic word practice app for kids. It should be cheap
to host, easy to maintain, and useful on mobile and when offline. There is no
current requirement for accounts, cross-device sync, or server-managed word
sets. The repository contained a Create React App placeholder and a Flask
"Hello, World!" endpoint, plus unused Django and Firebase dependencies; there
was no product behavior or server-side data to preserve.

## Decision

Choose option A: a static frontend with browser-local data. Keep the frontend
plain HTML, CSS, and JavaScript modules with no framework or build step. Use
versioned browser storage for progress and user-created word sets, and cache the
app shell with a service worker so the installed app can open offline. For
server deployment, package the static files in an unprivileged NGINX container
and run it with Docker Compose. Terminate TLS at a reverse proxy on the server.

Word-set sharing, when implemented, will use explicit export/import or
shareable data in a URL. It will not require a server or account.

## Consequences

- There is no application server or database to operate; the static files can
  also be hosted by a static-hosting service if deployment needs change.
- The server deployment requires a Docker host and TLS-terminating reverse
  proxy. The NGINX base image is pinned by digest and must be updated regularly.
- Offline access and mobile installation are supported by the app-shell cache;
  user data stays in the browser and is not sent to a server.
- There is no server write endpoint to abuse. Inputs still need validation, and
  user-provided content must be rendered as text.
- Progress does not sync between devices and can be lost when browser data is
  cleared. Users will need export/import for portable backups and sharing.
- The service worker requires HTTPS outside localhost. The reverse proxy must
  serve the app from a stable path and permit the worker to control that path.

## Alternatives Considered

- Small backend with SQLite: enables cross-device progress and shared hosted
  sets, but adds an API, database operations, authentication/authorization
  questions, and a larger abuse surface without a current product need.
- Serverless/BaaS: reduces server operations, but still introduces remote data,
  provider-specific services, access-control rules, and more setup than this
  app currently needs.

## Revisit When

Reconsider this decision if cross-device sync, accounts, collaborative/shared
word sets, or server-managed content becomes a product requirement. Before
adding a backend, define data ownership, privacy, and abuse controls, especially
because the intended audience includes children.