# Coding-agent guidelines

## Scope and precedence

- These instructions apply repository-wide.
- Read any more-specific `AGENTS.md` files in the directories you change; the most specific instructions win within their scope.
- Follow higher-priority task, platform, and system instructions first.
- If a required dependency, acceptance criterion, or relationship is missing or contradictory, report it rather than guessing.

## Working principles

- Prefer the smallest change that satisfies the task.
- Preserve nearby style, naming, and existing architecture unless the task explicitly requires otherwise.
- Avoid unnecessary abstractions, dependencies, services, and generated-file churn.
- Coordinate with other active work; do not duplicate or overwrite unrelated changes.

## Code quality

- Trust checked-in formatter/linter configuration, but verify the installed tool actually uses it before relying on results.
- Keep functions and modules focused.
- Use clear names and actionable errors.
- Do not hand-edit generated or vendor files.
- If a tooling issue blocks validation, report it instead of swapping in a new tool as an unrelated fix.

## Security, privacy, and accessibility

- Never commit secrets, sensitive logs, or unnecessary real user data.
- Treat names, identifiers, IP addresses, and stored content as potentially sensitive.
- Validate untrusted input at boundaries, including type, length, count, size, and allowed formats or schemes.
- Render user content as text, not raw HTML, unless there is a deliberate and reviewed reason not to.
- Enforce authorization and ownership server-side for protected operations.
- Use CSRF protection for cookie-authenticated writes, constrain CORS to intended origins, and parameterize SQL where applicable.
- Apply proportionate rate and resource limits where relevant.
- For UI changes, verify keyboard access, focus handling, accessible labels, non-color-only feedback, and reduced-motion behavior.

## Tests and review

- Run relevant existing checks after changes, starting with targeted tests.
- Add focused regression tests for changed behavior when practical.
- Self-review the full diff before requesting human review.
- Do not self-approve or auto-merge as the implementing agent.
- Record any meaningful test failures, skipped checks, or unresolved blockers in the PR description.

## Commits and pull requests

- Use Conventional Commits for commit messages and PR titles: `type(scope): description`.
- Keep each PR to one coherent, independently reviewable purpose.
- In PR descriptions, include:
  - a brief summary of scope,
  - non-goals,
  - relevant risks or migrations,
  - test commands and results, or reasons checks were not run,
  - links to related issues only when they exist.
- Use closing keywords only when the linked issue is actually resolved; otherwise mark it as related work.

## Repository-specific notes

- Keep product, architecture, and verification specifics in maintained docs, issues, ADRs, or PRs rather than encoding them as permanent agent instructions.
- If a change depends on unresolved architecture or product decisions, pause and surface that dependency before implementing.
