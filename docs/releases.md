# Releases

Puggern is released as one static application from `main`, not as an npm package.
There is no release build, deployment, registry publication, or asset packaging.
Publication stays inside the release workflow: tag/release events created with
`GITHUB_TOKEN` do not automatically start other workflows.

## Versions and owned files

Release-please uses the manifest-based `simple` strategy. It owns
`.release-please-manifest.json`, root `version.txt` (with a trailing newline),
the generated root `CHANGELOG.md`, `frontend/src/app-version.mjs`, and the
application version constant in `frontend/service-worker.js`. All four version
copies must agree; `npm run test:unit` enforces this in the Unit CI job, which
feeds the required Tests aggregate check.
Root `package.json` and `package-lock.json` remain unversioned development tooling.
Application versions do not change browser-storage schema versions. Shell cache
identity includes both application version and an independent `SHELL_REVISION`;
bump that revision whenever precached content changes between releases. A release
number alone is not sufficient cache invalidation, especially on untagged builds.

The checked-in pure version module exports `APP_VERSION` and
`isValidAppVersion(value)`, accepting only stable `X.Y.Z` identities without
leading zeroes, whitespace, prefixes, prerelease/build suffixes, or more than 64
characters. Importing it validates its own constant without DOM or network access.
The worker keeps its own literal so message replies never fetch version metadata.
Keep these exact inline generic updater markers on the version declarations:

```js
export const APP_VERSION = '0.0.0'; // x-release-please-version
```

```js
const APP_VERSION = '0.0.0'; // x-release-please-version
const SHELL_REVISION = '13';
```

The numbers above illustrate the unreleased seed and initial shell revision,
not values to restore after release. Do not annotate `SHELL_REVISION` with a
release-please marker. The package's `extra-files` entries explicitly select
`type: "generic"` for the module and worker paths. Installed release-please
17.6.0's `build/src/updaters/generic.js` recognizes `x-release-please-version`
on the same line and replaces that line's first SemVer-looking literal;
`build/src/strategies/base.js` dispatches the explicit generic updater. Keep only
one version literal on each annotated line. The isolated fixture executes this
updater through real release planning and proves first, minor, major, and patch
releases update both constants without changing the shell revision. Reverify the
installed updater, schema, and fixture when upgrading release tooling.

Metadata ships inside `frontend/` with no startup generator, root-file runtime
fetch, GitHub API polling, tokens, or separate version endpoint. Both the Docker
image and `python3 -m http.server 8000 --directory frontend` use the same files.

Tags are `v<major>.<minor>.<patch>` with no component prefix, for example `v0.1.0`.
The GitHub Release has the same name, is published (not draft), and is not a
prerelease. Release-please creates the tag at the merged release PR's commit on
`main`, with notes from the changelog. Do not invent historical changelog entries.
Generated `CHANGELOG.md` is narrowly excluded from Prettier to preserve upstream
formatting.

### Baseline and first release

The adoption check found **no tags and no GitHub Releases**. The manifest and
`version.txt` start at `0.0.0`, an unreleased seed: do **not** create `v0.0.0`.
`bootstrap-sha` is `1cf401a8b93b6be048e66179f7683d8ffff9efa6`, the inspected
pre-adoption boundary. Older commits are deliberately excluded from the first
release notes; commits after that boundary are included normally.

The initial adoption merged with the squash title **`feat(ci): adopt release-please`**.
The root package temporarily set `"release-as": "0.1.0"` to make the first release
deterministic. The **Mandatory follow-up immediately after publishing `v0.1.0`**
was to remove `release-as` from `packages["."]` in `release-please-config.json`;
that cleanup is now complete. Keep it absent: this persistent override would pin
every subsequent release to `0.1.0`. Retain `bootstrap-sha` as a historical
boundary; the latest release becomes the normal boundary. Never reset the manifest
to the seed. The fixture models the first release with a synthetic temporary
override and plans later releases from the checked-in config.

If a real stable application release/tag appears before adoption merges, align
the manifest and version file to that latest stable version, remove `release-as`,
and replace the bootstrap boundary with that existing release's commit. Record
the exact discovered version, tag, and SHA in the implementation PR. Never overwrite
an existing release or tag.

## Conventional Commits

Ordinary PR squash titles and commits must use `type: description` or
`type(scope): description`:

```text
feat(profiles): add avatars
fix: restore focus after saving
feat!: change the import format
```

A breaking change can alternatively be expressed in a commit body/footer:

```text
feat(import): accept the new format

BREAKING CHANGE: imports now require a header row
```

Preserve the breaking marker/footer when squashing. `fix` bumps patch, `feat`
bumps minor. Before `1.0.0`, breaking changes bump minor rather than automatically
releasing `1.0.0`; at/after `1.0.0`, breaking changes bump major. The explicit
`bump-minor-pre-major: true` and `bump-patch-for-minor-pre-major: false` options
encode this policy. `docs`, `test`, `ci`, `chore`, and dependency-maintenance
commits alone do not normally initiate a release (a `fix(deps)` or a breaking
change is still release-worthy).

Release-please's generated release PR titles must remain recognizable to the
tool; do not rename them to an ordinary feature/fix title. Keep its normal
`autorelease: pending` / `autorelease: tagged` tracking labels intact.

## One-time administrator setup

In **Settings → Actions → General → Workflow permissions**, enable **Allow GitHub
Actions to create and approve pull requests**. The workflow does not approve,
auto-merge, or require bot approval; this setting permits it to create PRs.
Ensure organization/enterprise policy permits this setting and the pinned
`googleapis/release-please-action`. Retain required **Quality**, **Tests**, and
**Dependency security** checks on `main` in branch protection/rulesets, and keep
human review requirements.

Only the release job receives `contents: write`, `pull-requests: write`, and
`issues: write` (needed for release-please's issue/PR labels). Workflow defaults
and existing CI remain read-only. The workflow uses only `GITHUB_TOKEN`, not a
PAT or GitHub App.

If policy blocks bot PR creation, an administrator must enable that Actions
setting or have the organization administrator allow it. If tag rules, release
rules, or token restrictions block publication, an administrator must explicitly
permit this release workflow to create the intended `v*` tags/releases under the
repository's policy. Do not weaken required PR checks, silently change credentials,
or bypass review to work around a restriction.

## Maintainer sequence

1. Merge reviewed changes to `main` with Conventional Commit squash titles.
   The serialized release workflow collects qualifying commits into one pending
   release PR; later qualifying merges update that same PR.
2. Inspect/update the release PR: check the version, manifest, `version.txt`,
   module and worker version markers, independent shell revision, generated
   changelog, and included commits. Wait for release-please to finish
   its final update before starting CI.
3. **Using your own GitHub account, close and reopen the release PR.**
   PRs created or updated by `GITHUB_TOKEN` do **not** automatically trigger the
   ordinary `pull_request` workflows. The human-triggered `pull_request: reopened`
   event is handled by the existing unfiltered trigger in `tests.yml`.
4. Wait for **Quality**, **Tests**, and **Dependency security** on the **current
   release-PR head SHA**, then perform human review and merge normally. Repeat
   close/reopen and verify the latest SHA after **every subsequent bot update**;
   an older successful check is not evidence for the new head. Never skip/fake
   checks or weaken branch protection.
5. The push of the merged release PR to `main` publishes its matching tag and
   GitHub Release. Confirm the manifest/version, tag name and target commit,
   release name/notes, and release link under the repository's **Releases** page.
   No release artifacts are published on non-release runs.
6. The first-release `release-as` cleanup is complete. Keep the override absent; a
   safe rerun should leave exactly one tag/release and no duplicate pending PRs.

## Recovery and pausing

Inspect the failed **Release please** workflow logs first, including token
permissions, Actions settings, organization policy, and tag/ruleset restrictions.
Resolve the specific permission or configuration failure, then rerun the workflow
or dispatch it against `main`; the job guard refuses other branches. Runs are
serialized without cancelling an in-progress write. Release-please reuses its
tracked PR and recognizes already-published releases, so rerunning is safe.
Do not remove its tracking labels or independently create tags/releases.

If an existing pending release PR is incorrectly pinned to `0.1.0`, remove
`release-as` in a reviewed config change and merge that fix to `main`. Let the
normal push workflow or a maintainer dispatch against `main` regenerate the
existing pending release PR. Do not manually edit its title or body, remove the
`autorelease: pending` tracking label, or create a replacement PR. Verify that the
bot update includes the intended post-release commits and advances the manifest,
`version.txt`, module, and worker version markers together; it must not duplicate
historical changelog entries or alter the published `v0.1.0` tag. After the bot's
final update, use your own GitHub account to close and reopen the PR, then verify
the required checks on its new current head SHA as described above.

Never delete or move a published tag as routine recovery. Reverting application
code requires a new reviewed commit and a new release, not rewriting a published
version. To pause releases, disable **Release please** in the Actions UI (or merge
a reviewed change disabling its triggers); leave ordinary CI running. Re-enable
only after resolving the problem and inspecting the pending release state.

## Validation and post-merge smoke test

Branch validation can check config/schema, workflow constraints and syntax,
offline upstream release planning/publication requests with mocked GitHub data,
and existing lint, formatting, unit, browser, and production-container tests.
The isolated fixture under `tests/release-please/` pins the same release-please
version as the action. Install and run it with:

```sh
npm ci --prefix tests/release-please
node --test tests/release-please/*.test.mjs
```

Tests never contact GitHub or publish real tags/releases. Root unit tests remain
network-independent; fixture dependencies are installed separately and exercised
by existing CI. Action updates must also update the fixture version and verify
the new upstream config schema and action inputs.

The adopted action is
[`v5.0.0`](https://github.com/googleapis/release-please-action/releases/tag/v5.0.0),
verified at commit `45996ed1f6d02564a971a2fa1b5860e934307cf7`; its
[action definition](https://github.com/googleapis/release-please-action/blob/45996ed1f6d02564a971a2fa1b5860e934307cf7/action.yml)
supports the explicit token, target-branch, config-file, and manifest-file inputs
used here. It bundles release-please **17.6.0**. Configuration is validated against
that version's packaged
[upstream schema](https://github.com/googleapis/release-please/blob/v17.6.0/schemas/config.json).
The first-release `release-as` option is supported but deprecated upstream. It was
used only for the initial `v0.1.0` release and must remain absent now that cleanup
is complete.

Live publication can only be verified after merging to `main`. A maintainer must
confirm: one release PR opens/updates; human close/reopen runs all required checks
on its current head; human review/merge creates exactly one matching tag and
published GitHub Release; a rerun creates no duplicates. Record the release URL
and check SHAs. This is a post-merge operational smoke test, **not** permission to
self-merge or publish during implementation. Administrator-only setup and this
live smoke test must be reported separately from completed local verification.

## Deployed updates

The footer identifies the **loaded code**, not the latest available release or
waiting worker. The unreleased seed `0.0.0` displays `Utviklingsversjon`; other
versions display `Versjon X.Y.Z` with an optional `Utgivelsesnotater` link to
`https://github.com/aigelonic/puggern/releases/tag/v<version>`. The link is built
from the validated local version, is not prefetched, and is not needed offline.
Untagged development deployments use the last release version, which does not
prove a tag exists. Deploy production from the corresponding published tag.

Updates are discovered only when this origin serves a complete new shell. The
stable `./service-worker.js` registration uses `updateViaCache: 'none'`. A new
worker freshly precaches the whole shell before waiting; a partial download,
missing module, or wrong JavaScript MIME type must leave the old shell usable,
not report readiness. The first installation is not an update and does not
prompt or reload. Active workers serve their own cached HTML and modules, so a
deployment cannot silently mix old HTML with new application code.

Automatic checks happen after registration, reconnect, and visible foreground,
at most once per 60 seconds with in-flight requests deduplicated. The explicit
`Se etter oppdateringer` action bypasses the throttle, not deduplication. Mobile
operating systems suspend PWAs: closed/suspended apps check on reopening or
foregrounding, with browser-dependent timing. There is no continuous/background
polling, push notification, runtime release API, or deployment automation.

When ready, `En oppdatering er klar.` offers `Oppdater og last inn på nytt` and
`Senere`. A different version can show `Ny versjon X.Y.Z er klar.`; a changed
shell with the same version shows `Oppdatert appinnhold er klart.`. A complete
deployed rollback is actionable too, not rejected by version ordering. `Senere`
hides only that candidate for this page lifetime; `Oppdatering klar` reopens it
from the footer. A replacement candidate or a later relaunch may offer again.

Applying an update must wait for ongoing answer/save operations and retry locked
session/progress and pending-reward persistence. Failed saves or remaining
unsaved progress block activation and reload, with a retry message and no forced
discard bypass. Typed-but-unsubmitted answers and unsaved editor/profile input
instead require accessible explicit discard confirmation; `Avbryt` retains input
and focus. Never submit an answer or save an incomplete editor merely to update.
Saved profiles, sets, totals, current profile, and resumable progress survive;
the existing resume UI may require choosing the saved session after reload.

Close other in-scope Puggern tabs/PWA windows before applying. The worker checks
immediately before activation, including uncontrolled app windows where possible;
`Lukk andre Puggern-vinduer og prøv igjen.` means close them and retry. Unrelated
out-of-scope pages do not block. Only the consenting page reloads once after the
expected controller takes over; activation has a 10-second timeout and retry on
failure. Discovery, reconnect, foreground, and unsolicited controller changes
never automatically reload. A single-window check cannot eliminate every race:
nonconsenting old pages retain their loaded label and usable old shells, and
receive a guarded reload offer rather than a forced refresh. Activation must not
delete old shells still needed by live clients, unrelated caches, or localStorage.

Manual checks show checking, preparation, ready, no downloaded update, or a
bounded retry error. Offline checks explain the connection requirement without
clearing a prepared candidate; automatic network failures remain quiet. Offline
practice and a fully prepared update can work without a network connection;
discovering/downloading an update cannot. Browsers without service workers still
show the loaded version and an explanatory status rather than crashing.

First adoption has a one-time limitation: the legacy auto-activating worker and
older open client cannot retroactively display these controls. That client must
first load this implementation before consent-based updates are available. Test
the migration, including the historical bad-MIME cache, before production rollout.
Do not unregister workers or clear site data as an update/recovery strategy;
browser storage contains local user work that is not synced elsewhere.

## Deployment verification

Build a whole image from the intended `v<version>` tag and validate it before
switching origin traffic atomically. Do not copy the worker/index before the
remaining assets or overwrite a live static directory piecemeal. A GitHub
tag/release is not a deployment and cannot notify users by itself. No image
publication or production deployment is performed by the release workflow.

Use the existing non-root/read-only Compose deployment. Preserve its health
check, dropped capabilities, stable module URLs, JavaScript content types, CSP,
and other security headers at every proxy/cache layer. NGINX revalidates index,
navigation, worker, and fixed version/update modules using `expires -1`
(`Cache-Control: no-cache`). Other modules retain their existing policy, while
fresh worker precache requests bypass HTTP caches. Do not introduce location-level
`add_header` directives without repeating all server security headers: NGINX
otherwise stops inheriting them. Missing modules must remain ordinary 404s, not
HTML fallback responses. Do not add startup metadata generation.

For a locally built image, run the production browser regressions and inspect
responses (use a free local port if 8080 is occupied):

```sh
docker build -t puggern:test .
docker run -d --name puggern-test --read-only --cap-drop ALL \
   --tmpfs /tmp --tmpfs /var/cache/nginx --tmpfs /var/run \
   -p 127.0.0.1:8080:8080 puggern:test
curl --fail http://127.0.0.1:8080/healthz
curl --fail -I http://127.0.0.1:8080/
curl --fail -I http://127.0.0.1:8080/service-worker.js
curl --fail -I http://127.0.0.1:8080/src/app-version.mjs
curl --fail -I http://127.0.0.1:8080/src/app-updates.mjs
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run test:e2e -- \
   tests/e2e/modules.spec.mjs tests/e2e/profiles.spec.mjs tests/e2e/service-worker.spec.mjs \
   tests/e2e/production-update.spec.mjs
docker rm -f puggern-test
```

Verify module responses are JavaScript, all four fixed URLs revalidate, missing
modules return 404, and security headers also survive index/internal redirects
and error responses. Compare served module/worker literals to the tag's
`version.txt` and manifest; CI checks all four checked-in copies, not the health
endpoint. Run a real A-to-B update from the same origin, not a fresh profile alone:
A remains A until consent, B waits only after complete precaching, accepting B
retains stored work and reloads once, and prepared B works offline. Repeat after
the public reverse proxy before declaring deployment complete. A rollback should
deploy a complete prior tagged image and use the same consent flow; never rewrite
tags or mix shell files. Keep failed-update clients on their usable old shell
while correcting the server or deploying a reviewed fix.

## Mobile and lifecycle smoke checklist

Physical Android Chrome installed-PWA and iOS/iPadOS Safari Home Screen coverage
is **unavailable in this development environment**. Chromium viewport/standalone
emulation is not proof of iOS service-worker behavior. Record device/OS/browser,
installed versus browser mode, origin, A/B version and shell revisions, result,
and remaining gaps when a maintainer runs these steps:

- Install A, relaunch online and offline, and confirm the loaded footer in setup,
  practice, and completion. First installation must not announce/reload.
- Atomically deploy B while A stays open. Check manually, reconnect, and return
  from suspension/foreground; confirm no reload or lost practice and one candidate
  announcement. Test same-version shell changes and a complete rollback too.
- Choose `Senere`, keep practicing, reopen `Oppdatering klar`, and accept. Confirm
  exactly one reload to B, correct notes link, retained profiles/sets/progress and
  rewards, and offline practice after disabling the network once B is prepared.
- Cancel discard confirmation separately for an unsaved set editor, profile form,
  and unsubmitted answer. Verify text/focus survives. Confirm only those inputs
  can be discarded; failed progress/reward persistence must block activation.
- Accept during an in-flight save and double-tap apply; verify no premature reload,
  accidental answer submission, or duplicated rewards. Exercise timeout/retry.
- Open two app windows (browser plus installed PWA where supported); applying must
  request closing the other, then succeed on retry. Exercise controller takeover
  in another window: the nonconsenting page must not reload or mislabel itself.
- Interrupt B's download, serve a missing version module or bad MIME, then retry
  after repair. A stays usable with no false-ready banner. Verify legacy upgrade
  and that unrelated origin caches and localStorage remain intact.
- Check 320px portrait, tablet portrait/landscape, standalone safe-area insets,
  keyboard-open forms, touch targets, readable footer/banner with no answer-control
  overlap, keyboard navigation, visible focus, and polite screen-reader status.
  Announcements must not steal focus; repeat with reduced motion enabled.
- Record browser-specific delays for reopening/foreground checks and unavailable
  worker support. Do not claim exact background timing or physical-device coverage
  from desktop automation. Report skipped cases and follow-up owners explicitly.
