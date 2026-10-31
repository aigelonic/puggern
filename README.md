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
emoji avatar. The front page puts **Ordsettene dine** and practice buttons first.
Use the profile chip at the right of the header to switch profiles or choose
**Legg til profil**; **Ferdig** closes this non-modal panel. Practice progress is kept separately for each profile and word
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
Practicing both directions counts each direction as a separate entry. Each entry
needs one correct answer per session; mistakes, including repeated ones, never add
extra repetitions, and the first correct answer after a mistake finishes the entry. The latest completed summary
survives reload, and you can practice the same set again or return to word sets.
If saving progress fails, practice still continues and a warning explains that
progress may be lost on reload.

Each entry earns 10 points once, on its first correct answer; incorrect answers
earn no points. Saved sessions with duplicated or already-learned queue entries are
repaired when loaded, without awarding points or completion credit. The combo counts consecutive correct answers
within a session and resets on an incorrect answer; there is no time limit or
speed bonus. A labeled progress bar shows learned entries, and completing a set
shows a brief confetti celebration only when finishing live, not when restoring
a completed summary. Answer cues last 600 milliseconds; confetti is removed within
1.6 seconds. Reduced motion keeps the text and icons without moving effects,
including when the preference changes during practice.

Optional, locally generated sound effects work offline. Use the “Lydeffekter”
icon button in the header (🔇 / 🔊) to turn them on or off at any time. Sound starts off on
each page load and is not stored with a child's profile. Answer effects and
sounds are replaced rather than queued, and stop when leaving practice.

Storage retains each profile's current session per word set. Session points and combos survive reloads. Total points, best
combo, and the number of completed sets are saved in the profile and retained when
starting a new session or deleting a set. Existing profiles and sessions without
rewards start their reward counters at zero. Daily streaks, stars, badges,
unlockables, and leaderboards are not part of this MVP.

## Øvingshistorikk

Choose **Øvingshistorikk** in the compact greeting strip above the word sets,
outside the profile switcher, to revisit that profile's completed
runs, newest first (20 at a time, with **Vis flere**). Expand **Vis øvingsdetaljer**
for practiced entries, entries needing extra practice, and saved answer settings.
Results retain the set name and settings captured at the start, even after a set
is edited, renamed, archived, or deleted. History is read-only; viewing it never
awards rewards or restarts practice.

Collection is forward-only: old completed summaries and aggregate rewards are
not converted into history. New runs receive a stable ID when started; unfinished
legacy sessions receive one when resumed. Resuming keeps the same run, while
explicitly starting again creates a new run. Only the actual completion transition
records a result, not opening or reloading a completion screen.

First-try accuracy is the number of learned entries without mistakes divided by
the practiced entry count, displayed as a whole percentage. Total errors sums all
incorrect answers; entries needing extra practice counts entries with any errors.
Correction-copy answers do not independently improve accuracy or award extra
points. Points and best consecutive-correct streak come unchanged from the
learning engine; higher points are not presented as better mastery.

The variant selector compares only runs of the same set ID, ordered source
hint/answer content, direction mode, order mode, and effective case/accent settings.
A SHA-256 content fingerprint excludes names, timestamps, and mixed mode's random
direction realization. Renaming or archiving alone keeps the variant; changed
content/order/settings and copied sets do not. The chart shows the latest 10
comparable attempts, oldest to newest on a fixed 0–100% scale, spaced by attempt
sequence rather than elapsed time. Its table provides equivalent dates and values.
Previous-run differences use unrounded accuracy and display one decimal percentage
point; ties are not records. A first result establishes a baseline.

Only the latest 500 completed results per profile are retained, sorted by UTC
completion timestamp then run ID (both descending); dates display in local time.
Personal best accuracy and streak refer to this retained history, not lifetime
records. Pruning never reduces profile reward totals. Optional history/run metadata
extends the existing version-1 state without resetting profiles or progress.
Malformed history entries are ignored with a warning, separately from valid data.
Unsupported profile-state versions are not overwritten by this client.

Progress, result, and pending rewards are saved in one localStorage write, merging
the latest state and deduplicating run IDs under Web Locks where available.
Without Web Locks the existing best-effort fallback remains: localStorage is not
transactional, so simultaneous writes from tabs can overwrite each other.
If saving fails, previously saved data is retained, practice remains usable, and
**Prøv å lagre igjen** retries the in-memory result with its original ID/time.
Reloading before a successful retry can lose unsaved results and progress.

All history stays in this browser/origin, including offline use after caching.
There are no accounts, backend storage, telemetry, cloud sync, or cross-device
history. Local profiles are convenience separation, not authentication or
encryption; anyone using the same browser/origin may access the data. Clearing
site storage removes it. Shared word-set links do not include history.

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

For reproducible home-page screenshots, `tests/e2e/fixtures/home.mjs` exports
`seedHome(page, options)`: synthetic 🦊 Ola with one unfinished, one completed,
and one new set. Start `python3 -m http.server 4173 --directory frontend`,
then capture Chromium in a separate terminal:

```sh
node --input-type=module -e "
import { chromium } from 'playwright';
import { seedHome } from './tests/e2e/fixtures/home.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await seedHome(page);
await page.goto('http://127.0.0.1:4173');
await page.locator('#saved-sets-title').waitFor();
await page.evaluate(() => document.fonts.ready);
await page.mouse.move(0, 0);
await page.screenshot({ path: '/tmp/puggern-home.png' });
await browser.close();
"
```

Use 1280×900 with `{ count: 5 }` for desktop, `{ count: 0, name: 'Min profil', avatar: '' }`
for the empty state, or 320×844 with a long `name` for truncation.
Open `#profile-chip` or `#new-set-button` for panel/editor captures, blur the focused
control and move the pointer away before capturing. The fixture writes only into
an empty browser context, so reloads do not overwrite subsequent interactions.

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

GitHub Actions runs `Quality`, `Unit`, `Release planning`, `E2E`, `E2E production`,
and `Dependency security` in parallel on pull requests and pushes to `main`.
`Tests` remains the required aggregate check: it succeeds only when all four
test jobs succeed, and fails if any fail, are canceled, or are skipped.
Quality runs ESLint and checks formatting with Prettier.
Dependency security runs `npm audit` and reviews
dependency changes in pull requests; moderate and higher severity
vulnerabilities fail the check. Dependabot checks npm packages and GitHub
Actions weekly.

Unit runs the core tests without browser setup. Release planning installs only
its own dependencies and runs the offline GitHub fixtures. E2E runs all browser
specs against the static server. E2E production builds and health-checks the NGINX
image, then runs `modules`, `profiles`, `service-worker`, and `production-update`
specs against it; container cleanup runs even after failures.

Superseded PR runs are canceled per workflow/ref; pushes to `main` are not
canceled. Both browser jobs cache `~/.cache/ms-playwright` using the runner OS,
installed Playwright version, and root lockfile hash, while still installing
system dependencies on cache hits. The production image uses Buildx with the
GitHub Actions layer cache and loads the image locally without publishing it.
Look for browser-cache hit/miss messages and Buildx `CACHED` layers in the logs.

To validate the speedup after rollout, compare the median elapsed time of 3–5
successful PR runs with recent successful runs of the old workflow, separating
cold-cache and warm-cache results. Confirm parallel startup, cache reuse, and
cancellation on rapid PR pushes, and monitor retries for flake regressions.
Hosted-run evidence is needed; local test timings do not establish CI speedup.

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
Progress stays in the browser on the current device; word sets can be explicitly
transferred by link. See [ADR 0001](docs/adr/0001-tech-stack.md) for the architecture
decision.
