# Agent Runbook

Persistent startup operations and standing checks for agents working in this repository.
Agents should read this file at the start of each run after reading `.AGENT/agent.md`.

## Recurring Startup Operations

1) Refresh Agent Context
	a) Read `.AGENT/agent.md`, `.AGENT/dev-notes.md`, `.AGENT/agent-run.md`,
	   `.AGENT/agent-run-once.md`, and the latest relevant entries in
	   `.AGENT/agent-action-log.md`.
	b) Check the current branch and working tree before editing.
	c) Preserve existing user or agent work.

2) Process One-Shot Queue
	a) Review `.AGENT/agent-run-once.md` for active one-time operations.
	b) Complete active run-once items before starting unrelated work when safe.
	c) Remove completed items from `.AGENT/agent-run-once.md`.
	d) Append completed or blocked run-once results to `.AGENT/agent-action-log.md` with
	   timestamp, agent name, role, branch, scope, verification, and follow-ups.

3) Prompt Feedback Loop
	a) If the maintainer gives a new standing instruction, persist it in the correct
	   `.AGENT/` file rather than leaving it only in chat context.
	b) Re-read `.AGENT/agent.md` after changing prompt instructions.
	c) Log prompt, runbook, and run-once changes in `.AGENT/agent-action-log.md`.

4) Branch Synchronization
	a) Use feature branches for review, concurrent work, or changes that may conflict.
	b) Avoid creating competing edits to `.AGENT/agent-run-once.md`; consume one-shot items
	   carefully and preserve other agents' pending work.
	c) Keep shared `.AGENT/` state synced to `main` through normal PR review unless the
	   maintainer explicitly requests direct branch updates.

5) Release Readiness Checks
	a) Before changing package publishing, inspect `package.json`, `.github/workflows/`, and
	   public release stats for the client/service/CPMS repos when available.
	b) Update `docs/release-coordination.md` when version synchronization rules change.
	c) Run `npm test`, `npm run build`, and `npm pack --dry-run` after package layout,
	   export, or workflow changes.

## Active Recurring Items

1) Maintain Client/Service Contract Evidence
	a) Keep contract tests focused on generated HTTP methods and request payloads.
	b) Add live integration tests only when a stable dev service URL and required secrets are
	   documented.
	c) Prefer OpenAPI-derived updates if the KSG service publishes a schema.
