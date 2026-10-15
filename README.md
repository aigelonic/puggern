# Puggern

A small, offline-friendly word practice app for kids.

## Development

Serve the `frontend/` directory with any static HTTP server. For example:

```sh
python3 -m http.server 8000 --directory frontend
```

Then open <http://localhost:8000>. Service workers require HTTPS in production;
`localhost` is treated as a secure context for development.

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
