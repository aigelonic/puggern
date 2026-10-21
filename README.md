# Puggern

A small, offline-friendly word practice app for kids.

## Development

Serve the `frontend/` directory with any static HTTP server. For example:

```sh
python3 -m http.server 8000 --directory frontend
```

Then open <http://localhost:8000>. Service workers require HTTPS in production;
`localhost` is treated as a secure context for development.

Create named word sets by pasting one clue and spelling per line, separated by
a tab, semicolon, or ` - `. Review and edit the parsed entries before saving.
Each set supports up to 100 entries, either quiz direction or both directions,
and its own case/accent matching settings. Sets can be edited, copied, archived,
restored, and deleted. Word sets and progress are saved in browser storage on
this device; they are not synced to other devices.

The current progress and word-set storage formats are version 1; corrupt or
unsupported saved data is ignored rather than resumed or displayed.

## Tests

Use Node.js 24 and npm. Install the development dependency and Chromium once,
then run the unit and browser suites:

```sh
npm ci
npx playwright install --with-deps chromium
npm test
```

`npm run test:unit` runs the no-dependency core tests. `npm run test:e2e` runs
the browser workflows against a temporary static server. GitHub Actions runs
both suites for pull requests and pushes to `main`.

## Server Deployment

The production image serves the static app with unprivileged NGINX. On a server
with Docker Compose installed, run:

```sh
docker compose up --build -d
```

By default, the site is published on `127.0.0.1:8080`. Put a TLS-terminating
reverse proxy in front of it; do not expose the plain HTTP container port
directly to the internet. Set `PUGGERN_PORT` to change the host port. Keep the
loopback bind when the proxy runs on the host; only change
`PUGGERN_BIND_ADDRESS` when the proxy topology requires it, and restrict access
with the server firewall. The container runs read-only as a non-root user with
all Linux capabilities dropped. The NGINX base image is digest-pinned in
`Dockerfile`; review and update that digest regularly for security fixes.

The app is a static site with no build step, backend, or runtime dependencies.
Progress and word sets are intended to stay in the browser on the current
device. See [ADR 0001](docs/adr/0001-tech-stack.md) for the architecture decision.
