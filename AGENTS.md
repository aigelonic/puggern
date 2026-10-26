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

- Default workflow: implement, run targeted checks, obtain one independent local review, then create the PR and let CI run its configured checks.
- The implementing agent owns routine tests, lint, format checks, and acceptance-criteria validation. Use the [Verification agent](.github/agents/verification.agent.md) when substantial changes, complex reproductions, long-running checks, or independent execution warrant a separate context; it is not a mandatory handoff. Documentation-only changes need only applicable documentation/format checks.
- Use the [Security Review agent](.github/agents/security-review.agent.md) when changes affect authentication, authorization, trust boundaries, sensitive-data handling, unsafe rendering, or meaningful dependency risk (such as new install scripts, permissions, or security advisories). Routine dependency maintenance without these risks does not automatically require a specialist.
- Use the [UI / Accessibility Review agent](.github/agents/ui-accessibility-review.agent.md) when changes affect interactions, keyboard operation, focus, dialogs, dynamic announcements, or significant layout behavior. Small copy or cosmetic changes do not automatically require a specialist; the implementer must still check applicable accessibility and responsive behavior.
- Record why specialist reviews apply or are unnecessary. Give each invoked agent the task, acceptance criteria, intended PR base, complete change scope, and existing check results. Run independent checks/reviews in parallel only when they will not conflict over shared tooling or state.
- These agents report evidence and findings without fixing the implementation or invoking other agents. The implementing agent batches related fixes and reruns only checks/reviews invalidated by those fixes. Reuse evidence for unchanged code, identifying its tested/reviewed state and relevant paths.
- If a custom agent cannot be invoked, use an available separate agent with the same instructions. If required verification or an applicable review cannot be completed, report the blocker and stop before PR creation.
- Complete applicable verification and specialist reviews before the independent local review. Pass their results, limitations, and finding resolutions to the local reviewer; they do not replace its final pass.

### Findings and rechecks

- Distinguish blocking defects from optional suggestions. Unresolved critical/high findings and concrete correctness, security, accessibility, or acceptance-criteria failures block a pass regardless of severity. Optional improvements and style preferences do not.
- Fix blocking defects and batch corrections before requesting a recheck. Record non-blocking suggestions without requiring a fix or user acceptance; explicitly user-accepted lower-severity risks must include the rationale and must not waive an unmet acceptance criterion.
- Any later change requires a final state/diff check, but not an automatic full re-review. Recheck the delta since the last reviewed state, affected paths, and invalidated validation evidence. Expand to a full review when scope materially grows or prior reasoning no longer holds.

### Independent local review gate

- After implementation and relevant checks, invoke the [Local Review agent](.github/agents/local-review.agent.md) in a separate agent context. Prefer a different model when available; a separate reviewer agent is required even when only the same model is available.
- If the runtime cannot invoke that custom agent, use an available independent review agent with the same review instructions. If no independent reviewer is available, stop before PR creation and report the blocker; never substitute the implementing agent's own review.
- Give the reviewer the task and acceptance criteria, intended PR base branch, full diff against the merge base (including committed, staged, unstaged, and intended untracked files), and check commands/results. Include relevant context and known limitations, not just a summary of the edits.
- Have the independent reviewer consume existing verification/specialist evidence and investigate gaps or cross-cutting regressions, rather than routinely repeating completed checks. Apply the findings and recheck rules above.
- Do not create the PR until the reviewer explicitly reports `PASS` for the final state, with no unresolved blocking findings or missing required evidence.
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
  - check ownership and applicable specialist review results (or why specialists were unnecessary), including limitations and finding resolutions,
  - independent local review evidence: reviewer agent/model (if known), reviewed base and final commit/worktree state, verdict, findings and resolutions or user-accepted risks, and recheck results,
  - links to related issues only when they exist.
- Use closing keywords only when the linked issue is actually resolved; otherwise mark it as related work.

## Repository-specific notes

- Keep product, architecture, and verification specifics in maintained docs, issues, ADRs, or PRs rather than encoding them as permanent agent instructions.
- If a change depends on unresolved architecture or product decisions, pause and surface that dependency before implementing.
