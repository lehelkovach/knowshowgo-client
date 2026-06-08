# Agent Prompt

This repository uses the `agent-repo-boilerplate` `.AGENT/` layout for durable agent
instructions, run state, handoffs, and audit logging. Agents should read this file before
editing and should keep repository-specific guidance below the repository-specific section.

## Base-Agent Section

1) Mission
	a) Deliver small, reviewable improvements while preserving repository integrity.
	b) Read available context before acting, including `.AGENT/agent.md`, the README, and
	   task-specific files.
	c) Make focused changes, verify them, and leave clear handoff notes.

2) Operating Loop
	a) Inspect repository state, branch, and current changes before editing.
	b) Identify the smallest safe change that satisfies the task.
	c) Use existing project conventions, tools, and file organization.
	d) Run targeted verification before broad or expensive checks.
	e) Update `.AGENT/agent-action-log.md` for meaningful setup, implementation,
	   verification, migration, release, or handoff events.
	f) Commit and prepare work for review when the workflow or maintainer request requires
	   it.

3) Startup and Run Files
	a) At the start of a new agent run, read `.AGENT/agent.md`, `.AGENT/agent-run.md`,
	   `.AGENT/agent-run-once.md`, `.AGENT/dev-notes.md`, and the latest relevant entries
	   in `.AGENT/agent-action-log.md`.
	b) Treat `.AGENT/agent-run.md` as the persistent runbook for recurring startup
	   operations and standing checks.
	c) Treat `.AGENT/agent-run-once.md` as the one-shot queue for startup operations that
	   should run once and then be removed from that file.
	d) When a run-once item is completed, delete that item from `.AGENT/agent-run-once.md`,
	   then append the completed operation to `.AGENT/agent-action-log.md` with timestamp,
	   agent name, role, scope, result, verification, and follow-ups.
	e) If a run-once item cannot be completed, leave it in `.AGENT/agent-run-once.md` with
	   a short blocked note and append the blocker to the action log.
	f) Re-read `.AGENT/agent.md` after processing run-once items because those actions may
	   have updated the prompt or repository-specific directions.

4) Prompt Feedback Loop
	a) When a maintainer gives a new standing instruction, decide whether it belongs in
	   `.AGENT/agent.md`, `.AGENT/agent-run.md`, `.AGENT/agent-run-once.md`,
	   `.AGENT/dev-notes.md`, or only current task notes.
	b) Add repository-specific rules to `.AGENT/agent.md` below `#### Below:
	   Repository-Specific Directions` and keep them ordered by priority.
	c) Add recurring operational instructions to `.AGENT/agent-run.md`.
	d) Add one-time startup operations to `.AGENT/agent-run-once.md`.
	e) Log every prompt, runbook, or run-once change in `.AGENT/agent-action-log.md`.
	f) When a new instruction requires the agent to pivot or update its own operating
	   behavior, write the behavior into `.AGENT/agent.md` before relying on it.

5) Agent Identity and Roles
	a) Identify yourself in action-log entries by agent name or tool, role, and branch.
	b) Use "master repo agent" for the primary agent coordinating repository-level prompt,
	   runbook, release, and synchronization changes.
	c) Use "worker sub-agent" for delegated agents working on narrower tasks.
	d) If multiple agents touch `.AGENT/` files, preserve each agent's log entries and avoid
	   overwriting another agent's queued work.

6) Repository Safety
	a) Preserve existing user work and never discard unrelated changes.
	b) Do not expose or commit secrets, credentials, tokens, or machine-specific
	   configuration.
	c) Avoid adding dependencies unless the task clearly requires them.
	d) Keep generated or boilerplate edits scoped to the requested files.
	e) Do not rewrite history or force push unless explicitly instructed.

7) Default Engineering Behavior
	a) Prefer repository-local patterns over new abstractions.
	b) Favor readable, maintainable code over cleverness.
	c) Add tests for behavior changes when a test framework exists.
	d) Explain skipped verification with the reason and residual risk.
	e) Escalate blockers with concrete evidence and suggested next steps.

8) Agent Action Log Usage
	a) Treat `.AGENT/agent-action-log.md` as the authoritative activity log for agent work.
	b) Add an entry for non-trivial setup, implementation, verification, migration,
	   permission, release, or handoff work.
	c) Keep entries in reverse chronological order.
	d) Update "Verification" from pending to actual commands or manual checks before
	   finishing a task.
	e) Record follow-ups as "None currently known" when there are no known gaps.
	f) Use this entry shape:

	   ```markdown
	   ## YYYY-MM-DD - Short title

	   1) Timestamp
	    a) YYYY-MM-DD HH:MM UTC
	   2) Agent
	   	a) <agent name or tool>
	   3) Role
	    a) <master repo agent, worker sub-agent, or other role>
	   4) Branch
	    a) <branch name>
	   5) Scope
	   	a) <files, subsystem, or issue>
	   6) Actions
	   	a) <what changed>
	   7) Verification
	   	a) <commands or manual checks>
	   8) Follow-ups
	   	a) <known gaps or none>
	   ```

9) Support Files
	a) Keep agent support files inside `.AGENT/`.
	b) Use `.AGENT/dev-notes.md` for future agent infrastructure notes, including
	   inter-agent communication rules, release coordination, and agentic environment
	   variables.
	c) Durable release handoff decisions belong in `.AGENT/agent-action-log.md` and
	   `docs/release-coordination.md`, not only in chat.

#### Below: Repository-Specific Directions

1) Highest Priority Rules
	a) This repository is the KSG client SDK package. Keep the npm package installable,
	   testable, and aligned with the KSG service API contract.
	b) Keep SDK behavior focused on HTTP request construction, response handling, and
	   ergonomic helper methods; do not embed service persistence or graph algorithms in
	   the client.
	c) Preserve compatibility with existing snake_case method names while allowing
	   camelCase aliases for JavaScript callers.
	d) Document service endpoints and release-version coordination when changing the client
	   surface.

2) Verification
	a) Use `npm test` for endpoint contract tests.
	b) Use `npm run build` before packaging or release workflow changes.
	c) Use `npm pack --dry-run` when package manifest or included files change.
	d) Use `python3 .AGENT/tests/agent_architecture_smoke.py` after changing `.AGENT/`
	   files.

3) Release and Coordination
	a) Stable client releases are coordinated from `main` or `release/*` branches and use
	   the package version in `package.json`.
	b) Development client releases are coordinated from the `dev` branch and should publish
	   under the npm `dev` dist-tag with a generated prerelease version.
	c) Record observed client/service/CPMS release stats in docs when they affect the
	   compatibility plan.
	d) The KSG service repository currently has no tracked API source files on
	   `main`; contract tests in this repository assert the intended client request surface
	   until the service publishes an authoritative OpenAPI spec.

4) Known Local Context
	a) At bootstrap time this repo had no handoff files, no README, no `src/` directory, and
	   no published npm package visible in the public registry.
	b) The sibling CPMS repository has tagged releases `v0.1.3` and `v0.2.0`, with CPMS
	   package versions at `0.2.0`.
