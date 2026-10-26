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
a tab, semicolon, or `-`. Review and edit the parsed entries before saving.
Each set supports up to 100 entries, either quiz direction or both directions,
and its own case/accent matching settings. Sets can be edited, copied, archived,
restored, and deleted. Create a local profile for each child, with an optional
emoji avatar. Practice progress is kept separately for each profile and word
set, so an unfinished session can be continued or restarted, including after a
page reload. Profiles, word sets, and progress are saved in browser storage on
this device; they are not synced to other devices. Profiles store a name,
optional emoji, and practice rewards.

The current profile, progress, and word-set storage formats are version 1;
corrupt or unsupported saved data is ignored rather than resumed or displayed.
The app allows up to 10 profiles, 50 word sets per browser, 100 entries per
set, and 200 characters per clue or answer. Creating profiles or sets is
limited to five attempts per ten minutes in this browser, with a hidden
honeypot and a 250-millisecond minimum form time. Practice and progress saving do
not show a challenge or use this creation limit.

These are client-side safeguards, not server-enforced abuse controls: browser
storage and JavaScript can be changed by the device owner. The app has no
account, shared-set endpoint, or server-side user data to expire; all user
content stays local and is not publicly listed. The app is marked `noindex`
and disallowed in `robots.txt`. NGINX logs requests, but spike alerting and
per-IP write throttling require a backend/hosting layer and are not available
for localStorage writes. No third-party challenge is used because the static
app has no server to validate one and must remain usable offline.

Finishing practice opens a summary with learned practice entries, first-try
correct entries, and incorrect-answer counts for entries needing more practice.
Practicing both directions counts each direction as a separate entry; copying a
correction does not count as learning an entry. The latest completed summary
survives reload, and you can practice the same set again or return to word sets.
If saving progress fails, practice still continues and a warning explains that
progress may be lost on reload.

Each independent correct answer earns 10 points, including scheduled repetitions.
Copying a correction earns no points. The combo counts consecutive correct answers
within a session and resets on an incorrect answer; there is no time limit or
speed bonus. A labeled progress bar shows learned entries, and completing a set
shows a brief celebration (static when reduced motion is requested).

Storage retains each profile's current session per word set, not a history of
completed attempts. Session points and combos survive reloads. Total points, best
combo, and the number of completed sets are saved in the profile and retained when
starting a new session or deleting a set. Existing profiles and sessions without
rewards start their reward counters at zero. Daily streaks, stars, badges,
unlockables, sounds, and leaderboards are not part of this MVP.

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

To check the production NGINX MIME types, headers, profile workflow, and
service-worker upgrade/offline behavior, start the deployment container described
below and run:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run test:e2e
```

This uses the running server instead of the development server. All `.mjs`
modules must be served as JavaScript, not `application/octet-stream`. When
changing module URLs, update their imports and the service-worker shell together
and bump `SHELL_REVISION` so existing installations can prepare a distinct shell.

## Pull Request Checks

GitHub Actions runs separate `Quality`, `Tests`, and `Dependency security`
checks on pull requests and pushes to `main`. Quality runs ESLint and checks
formatting with Prettier. Dependency security runs `npm audit` and reviews
dependency changes in pull requests; moderate and higher severity
vulnerabilities fail the check. Dependabot checks npm packages and GitHub
Actions weekly.

Repository administrators must enable Dependabot alerts and security updates
in the repository's **Settings → Code security and analysis** page, then
require the `Quality`, `Tests`, and `Dependency security` checks in branch
protection or rulesets for `main`. These repository settings cannot be
configured from the workflow files.

## Releases

See [the release process](docs/releases.md) for versioning, release PR review,
required administrator setup, and the human close/reopen step that runs CI on
bot-created release PRs. Releases do not deploy or publish packages.

## Application Version and Updates

The footer shows the version of the loaded application, including offline.
`0.0.0` is labeled `Utviklingsversjon`, not a published release. Other versions
offer an optional `Utgivelsesnotater` link to the matching GitHub tag; the app
does not poll GitHub. Untagged development deployments retain the last release
number, so a version label alone is not proof of a published release.

`Se etter oppdateringer` checks this server for a complete new app shell.
Prepared updates offer `Oppdater og last inn på nytt` or `Senere`; deferring
keeps practice running and leaves an `Oppdatering klar` footer action. The app
never automatically reloads on discovery. A same-version shell update or a
deployed rollback can also be offered. Close other Puggern tabs and installed
app windows before applying, then retry. Progress and pending rewards must save
successfully before activation; failed saves block the update. Unsaved editor,
profile, or unsubmitted answer input requires explicit discard confirmation.

Offline practice and already prepared updates can work without a connection;
discovering or downloading an update requires internet access. Closed or suspended
mobile PWAs check after reopening or returning to the foreground; exact timing
depends on the browser. The first installation does not prompt or reload.
Legacy installed clients need to load this implementation before they can show
these controls. Do not unregister workers or clear site data to update, as that
can lose local profiles and progress.

Version metadata is checked in and works with both the static development server
and Docker, without startup generation. See the [operating guide](docs/releases.md#deployed-updates)
for marker ownership, shell revisions, deployment verification, recovery, and the
mobile checklist. Physical Android and iOS/iPadOS device coverage is unavailable
in this development environment and remains a required maintainer smoke test.

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

Deploy production from the corresponding `v<version>` tag as a complete image,
switching traffic only after all assets and health checks pass. Never publish
the index or worker ahead of the rest of the shell. A tag or GitHub Release alone
does not deploy anything or notify app users. Keep the stable worker URL and
preserve JavaScript MIME types, security headers, and cache revalidation through
the reverse proxy; see the [deployment checks](docs/releases.md#deployment-verification).

The app is a static site with no build step, backend, or runtime dependencies.
Progress and word sets are intended to stay in the browser on the current
device. See [ADR 0001](docs/adr/0001-tech-stack.md) for the architecture decision.
