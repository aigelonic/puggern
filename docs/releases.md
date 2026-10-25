# Releases

Puggern is released as one static application from `main`, not as an npm package.
There is no release build, deployment, registry publication, or asset packaging.
Publication stays inside the release workflow: tag/release events created with
`GITHUB_TOKEN` do not automatically start other workflows.

## Versions and owned files

Release-please uses the manifest-based `simple` strategy. It owns
`.release-please-manifest.json`, root `version.txt` (with a trailing newline),
and the generated root `CHANGELOG.md`. The manifest and version file must agree.
Root `package.json` and `package-lock.json` remain unversioned development tooling.
Application versions do not change browser-storage schema versions or
service-worker cache identifiers; existing cache invalidation rules still apply.

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

Merge the implementation with the squash title **`feat(ci): adopt release-please`**.
The root package temporarily sets `"release-as": "0.1.0"` so the first release is
deterministic. **Mandatory follow-up immediately after publishing `v0.1.0`: remove
`release-as` from `packages["."]` in `release-please-config.json` in a reviewed
maintenance PR, before merging further release-worthy changes.** Otherwise it
continues forcing `0.1.0`. Retain `bootstrap-sha` as a historical boundary; the
latest release becomes the normal boundary. Never reset the manifest to the seed.
The fixture tests model this cleanup and prove subsequent bumps are not pinned.

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
   generated changelog, and included commits. Wait for release-please to finish
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
6. After the first release, complete the `release-as` cleanup above. A safe rerun
   should leave exactly one tag/release and no duplicate pending PRs.

## Recovery and pausing

Inspect the failed **Release please** workflow logs first, including token
permissions, Actions settings, organization policy, and tag/ruleset restrictions.
Resolve the specific permission or configuration failure, then rerun the workflow
or dispatch it against `main`; the job guard refuses other branches. Runs are
serialized without cancelling an in-progress write. Release-please reuses its
tracked PR and recognizes already-published releases, so rerunning is safe.
Do not remove its tracking labels or independently create tags/releases.

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
The first-release `release-as` option is supported but deprecated upstream;
it is intentionally temporary under the cleanup policy above.

Live publication can only be verified after merging to `main`. A maintainer must
confirm: one release PR opens/updates; human close/reopen runs all required checks
on its current head; human review/merge creates exactly one matching tag and
published GitHub Release; a rerun creates no duplicates. Record the release URL
and check SHAs. This is a post-merge operational smoke test, **not** permission to
self-merge or publish during implementation. Administrator-only setup and this
live smoke test must be reported separately from completed local verification.
