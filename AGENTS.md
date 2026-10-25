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
- Before creating any PR (including drafts), complete the independent local review below; self-review and post-PR review do not satisfy this gate.
- Do not self-approve or auto-merge as the implementing agent.
- Record any meaningful test failures, skipped checks, or unresolved blockers in the PR description.

### Verification and specialist reviews

- For behavior changes, bug fixes, and final executable validation, use the [Verification agent](.github/agents/verification.agent.md) to run relevant existing checks and verify acceptance criteria. Documentation-only changes need only applicable documentation/format checks.
- Use the [Security Review agent](.github/agents/security-review.agent.md) for security-sensitive changes, such as authorization, untrusted input, sensitive data, or dependency changes.
- Use the [UI / Accessibility Review agent](.github/agents/ui-accessibility-review.agent.md) for user-facing UI changes, including keyboard, focus, responsive layout, and reduced-motion behavior.
- Give each agent the task, acceptance criteria, intended PR base, complete change scope, and relevant check results. Run only applicable specialists; do not add unrelated handoffs.
- These agents report evidence and findings without fixing the implementation. The implementing agent owns fixes and reruns affected validation/reviews. They must not recursively invoke this workflow.
- If a custom agent cannot be invoked, use an available separate agent with the same instructions. If required verification or an applicable review cannot be completed, report the blocker and stop before PR creation.
- Complete applicable verification and specialist reviews before the independent local review. Pass their results, limitations, and finding resolutions to the local reviewer; they do not replace its final pass.

### Independent local review gate

- After implementation and relevant checks, invoke the [Local Review agent](.github/agents/local-review.agent.md) in a separate agent context. Prefer a different model when available; a separate reviewer agent is required even when only the same model is available.
- If the runtime cannot invoke that custom agent, use an available independent review agent with the same review instructions. If no independent reviewer is available, stop before PR creation and report the blocker; never substitute the implementing agent's own review.
- Give the reviewer the task and acceptance criteria, intended PR base branch, full diff against the merge base (including committed, staged, unstaged, and intended untracked files), and check commands/results. Include relevant context and known limitations, not just a summary of the edits.
- Fix actionable findings and rerun affected checks. Have the independent reviewer recheck fixes and the final diff; any subsequent change invalidates the prior pass until reviewed.
- Do not create the PR until the reviewer explicitly reports `PASS` for the final state. Unresolved critical/high-severity findings block a pass. Other actionable findings must be fixed or explicitly accepted by the user with the rationale recorded.
- This gate applies to all PR changes, including documentation and agent instructions. A local pass is not a GitHub approval and does not replace CI or human review.

## Commits and pull requests

- Use Conventional Commits for commit messages and ordinary PR/squash titles: `type: description` or `type(scope): description` (optional scope), for example `feat(profiles): add avatars` or `fix: restore focus`.
- Mark breaking changes with `!` before the colon (`feat!: change import format`) or a `BREAKING CHANGE: description` footer separated from the body by a blank line. Preserve this information in the final squash commit.
- Use `feat` for new behavior and `fix` for corrections; maintenance-only `docs`, `test`, `ci`, `chore`, and dependency updates normally do not initiate releases. Do not rename release-please's generated release PR titles or remove its tracking labels. See [the release process](docs/releases.md) for version policy and maintainer steps.
- Keep each PR to one coherent, independently reviewable purpose.
- Preserve PR descriptions as literal Markdown: use `##` headings and `-` list markers, and verify the submitted body rather than relying on rendered formatting. When providing a description for copy/paste in chat, wrap the complete body in a `markdown` code fence.
- In PR descriptions, include:
  - a brief summary of scope,
  - non-goals,
  - relevant risks or migrations,
  - test commands and results, or reasons checks were not run,
  - applicable verification and specialist review results, including limitations and finding resolutions,
  - independent local review evidence: reviewer agent/model (if known), reviewed base and final commit/worktree state, verdict, findings and resolutions or user-accepted risks, and recheck results,
  - links to related issues only when they exist.
- Use closing keywords only when the linked issue is actually resolved; otherwise mark it as related work.

## Repository-specific notes

- Keep product, architecture, and verification specifics in maintained docs, issues, ADRs, or PRs rather than encoding them as permanent agent instructions.
- If a change depends on unresolved architecture or product decisions, pause and surface that dependency before implementing.
