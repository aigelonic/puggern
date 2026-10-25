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
account, shared-set endpoint, or server-side user data to expire; user content is
not automatically uploaded or publicly listed. Explicit sharing links contain the
selected set's text (see below). The app is marked `noindex`
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

## Sharing between devices

Choose **Del** beside an active or archived word set to share a link using the
device's share sheet. If unavailable, Puggern copies the link or shows a selectable
link for manual copying. **Anyone with the link can view the set contents**; avoid
including identifying or sensitive text. Only the set name, hint/answer pairs,
direction, and case/accent settings are transferred—not profiles, progress, rewards,
or local IDs and timestamps. There is no account, backend storage, sync, or revocation.

Open the link on another device, review the preview, and choose **Lagre ordsett**.
It creates a new active set with fresh local metadata; duplicate names are allowed.
Existing set and creation limits still apply. In an installed PWA, especially on
iOS, the operating system may open links in the browser rather than the installed
app. Open Puggern yourself, choose **Importer lenke**, paste the link, and choose
**Forhåndsvis** instead. This manual path works offline once the app shell is cached.

The stable `share` query parameter contains version-1 `word-set-share` JSON encoded
as UTF-8 and unpadded Base64URL. Links over 8,000 characters are blocked on export
and import; reduce the number of entries or text length. Import parsing is entirely
client-side and never fetches a pasted link. As with any query URL, opening a link
online can expose its contents to browser history, the hosting server/request logs,
and the chosen sharing service. Puggern removes `share` from the current address
after reading it, but cannot erase copies elsewhere. No file export is included.

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
and bump the shell cache version so existing installations replace stale assets.

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
Progress stays in the browser on the current device; word sets can be explicitly
transferred by link. See [ADR 0001](docs/adr/0001-tech-stack.md) for the architecture
decision.
