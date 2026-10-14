# Coding-agent guidelines

## Before changing code

- These instructions apply repository-wide. Read any `AGENTS.md` in the path to
  files you change; more deeply scoped instructions take precedence within their
  scope. Follow higher-priority task/platform instructions first.
- Read the saved issue's acceptance criteria, relevant comments, ADRs (if present),
  current files, and relevant open PRs before choosing an approach. Verify actual
  GitHub blocking dependencies; hierarchy and old chat exports are not proof.
  If metadata is unavailable or contradictory, report that blocker rather than
  inventing relationships.
- The goal is simple, engaging weekly word practice for children: correct spelling,
  repetition of wrong answers, and resumable progress. Issues #13–#20 describe the
  MVP. Architecture issue [#15](https://github.com/aigelonic/puggern/issues/15)
  remains undecided; agree and record the architecture before dependent
  implementation. Do not silently migrate the current React/Flask scaffold.
- Choose the smallest simple solution meeting acceptance criteria. Avoid
  unnecessary services, accounts, abstractions, and dependencies. Coordinate
  shared-file ownership with other agents; do not duplicate active PR work.

## Style and code quality

- Verified, checked-in formatter/linter configuration is authoritative. Confirm
  that the installed tool actually reads it before relying on it. If tooling is
  broken, report it; do not substitute a new tool in an unrelated PR.
- Otherwise preserve nearby style and existing naming conventions. Keep functions
  and modules focused, use clear names and actionable errors without sensitive
  details, and separate pure learning/queue logic from UI and persistence where
  practical.
- Use the declared package manager (currently Yarn 4.4.1 for the client). Change
  dependencies and lockfiles intentionally with that manager; review advisories
  and transitive/lockfile changes. Do not hand-edit generated/vendor files or
  reformat unrelated code.

## Commands and known limitations

Paths below are relative to the repository root; run commands in the stated
directory. Recheck scripts and prerequisites on your branch. Use the bundled
Yarn via `node .yarn/releases/yarn-4.4.1.cjs` in place of `yarn` if the system Yarn
is not the declared version.

| Working directory | Command | Verified status / purpose |
| --- | --- | --- |
| `backend/client` | `node .yarn/releases/yarn-4.4.1.cjs --version` | Reports 4.4.1. |
| `backend/client` | `yarn install --immutable --mode=skip-build` | Succeeded with peer-dependency warnings; dependency build scripts deliberately skipped. Full lifecycle install not verified. |
| `backend/client` | `CI=true yarn test --watchAll=false --runInBand` | Existing Jest/Testing Library test passed (1 test), with a React `act` deprecation warning. |
| `backend/client` | `CI=true yarn build` | Succeeded with Node/Browserslist warnings. Can add default `browserslist` settings to `package.json`; inspect and exclude unintended generated changes. Output: ignored `build/`. |
| `backend/client` | `yarn start` | Declared development server; not run in this documentation task. |
| `backend/client` | `yarn check` / `yarn format` | **Not working code-quality checks.** See below. |
| `backend` | `python -m venv /tmp/puggern-venv` then `/tmp/puggern-venv/bin/python -m pip install -r requirements.txt` | Isolated backend install procedure; not run/verified here. |
| `backend` | `/tmp/puggern-venv/bin/python -m flask --app api.app run --host=127.0.0.1` | Local development only; not run (Flask unavailable in sandbox). No backend test/lint/build scripts found. |
| repository root | `docker compose up --build` | Compose configuration exists; application build/start not verified. Not a verified one-command setup. |

The client declares `biome ^0.3.3`, locked to `biome` 0.3.3, an environment-variable
manager, **not** the Biome formatter/linter. It has no `check` or `format` commands.
`yarn check` and a non-writing `yarn format --help` probe exited silently without
performing code-quality validation. Do not treat exit zero as proof of linting or
assume `backend/client/.biome.json` is applied. Repair requires a separate tooling
change; do not install a replacement just to pass a task.

Run relevant existing checks after code changes, starting with targeted tests.
Report exact commands, working directories, results, warnings, and missing tools
or unrun checks with reasons. Never claim unrun or ineffective checks passed.
Docs-only changes need content/link/diff review; do not add a test framework just
for documentation. Do not disable checks to make a build pass.

## Commits and pull requests

- Both commit messages **and PR titles** use Conventional Commits:
  `type(scope): description`, with optional `(scope)` and optional `!` before the
  colon. Allowed types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`,
  `ci`, `chore`, `revert`. Use a nonempty, specific description.
  Examples: `docs(agents): clarify review rules`, `fix: preserve resume state`,
  `feat(storage)!: change progress format`. Mark breaking changes with `!` and/or
  a `BREAKING CHANGE: explanation` footer in the commit body; explain migration.
- Give each PR one coherent, independently reviewable purpose. Split unrelated
  changes; explain unavoidable size rather than imposing an arbitrary line limit.
- PR descriptions include a saved issue link (only if one exists), scope and
  non-goals, actual test commands/results or not-run reasons, risks/migrations,
  and synthetic screenshots or other UI/accessibility evidence when relevant.
  Do not invent issue numbers or create duplicate issues. Use closing keywords
  only when all linked issue acceptance criteria are met; otherwise say
  “Related to” and state the partial scope.

## Security, privacy, and accessibility

- Never commit secrets or sensitive logs, fixtures, exports, or screenshots.
  Scan changed files for secrets before committing; use synthetic evidence.
  Minimize children's data collection and retention, including telemetry and
  logs. Names, IP addresses, and “anonymous” identifiers are not automatically
  non-personal; do not promise “no personal data” without verifying the design.
- Validate untrusted words, imports, stored state, URLs, and API payloads at
  boundaries: schema/type, length, count, total size, and allowed URL schemes.
  Render user content as text, not raw HTML.
- Where a backend is used, enforce authorization and ownership server-side on
  every protected operation; IDs are not authorization. Protect cookie-authenticated
  writes against CSRF, constrain CORS to intended origins, and parameterize SQL
  when applicable. Apply proportionate server-side rate and resource limits where
  relevant; robots directives and CAPTCHA are not substitutes for security.
- Use HTTPS in deployment and never enable production debug. The current
  `backend/api/app.py` direct entry point enables Flask debug for development;
  do not use it as a production server.
- For CI changes, use least-privilege permissions, pin external actions to verified
  full commit SHAs, and never expose secrets or privileged execution to untrusted
  PR code. Review dependency advisories; do not suppress security checks.
- For UI changes, verify keyboard and mobile use, accessible labels/focus,
  non-color-only feedback, and reduced-motion preferences.

## Tests and review

- Add focused regression, boundary, and security tests for changed behavior.
  Changes to spelling normalization must cover whitespace, case, and diacritics
  according to settings; queue changes must test wrong-answer repetition and
  completion; state changes must test resume/reload and restart behavior.
- Self-review the complete diff and generated outputs before requesting an
  independent review where available. Record whether that review actually
  occurred and resolve substantive findings; otherwise explicitly state review
  is still required.
- Reviewers check correctness, scope, simplicity, security/privacy, accessibility,
  tests/results, dependencies/lockfiles, and documentation. Disclose unresolved
  blockers and risks; do not conceal failing or unavailable checks.
- Relevant checks and required independent review must complete before merge.
  Implementing agents must not self-approve or auto-merge; leave the PR for human
  review. This guidance does not enforce branch protection or repository settings.
