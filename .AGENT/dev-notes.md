# Agent Dev Notes

Development notes for future agent support files and agent infrastructure.

## Current Repository Context

1) Package Shape
	a) This repo publishes the KSG JavaScript SDK to npm.
	b) The Python client is kept as a source reference, but npm release automation validates
	   the JavaScript package.
	c) Contract tests use mock fetch implementations so they can run without a live
	   KSG service.

2) Observed Release Stats at Boilerplate Import
	a) Client `package.json` version: `0.2.1`.
	b) Public npm registry: package not found at bootstrap time.
	c) KSG client GitHub releases: none observed.
	d) KSG service GitHub releases: none observed.
	e) KSG service `main` tracked files: `.gitignore` and `LICENSE` only.
	f) CPMS tags observed: `v0.1.3`, `v0.2.0`.
	g) CPMS package versions observed: `@lehelkovach/cpms-core` `0.2.0`,
	   `@lehelkovach/cpms-server-node` `0.2.0`, and `cpms_client` `0.2.0`.

## Future Inter-Agent Communication

1) Communication Rules
	a) Define message formats before agents exchange task state.
	b) Include sender agent UUID, recipient or channel, timestamp, task scope, and expected
	   response behavior.
	c) Record durable decisions in `.AGENT/agent-action-log.md` rather than relying only on
	   transient bus messages.

2) Agentic Environment Variables
	a) `IAC_BUS_HOST`: Placeholder host or IP address for a future inter-agent
	   communication bus.
	b) `IAC_BUS_PORT`: Placeholder port for the future inter-agent communication bus.
	c) `AGENT_UUID`: Placeholder UUID registered for the current agent runtime.
	d) `AGENT_REPO_SLUG`: Placeholder repository owner/name value for agent registration.
	e) `AGENT_RUN_ID`: Placeholder run identifier for correlating logs and bus messages.
	f) `KSG_BASE_URL`: Optional service base URL for live integration tests.
	g) `KSG_DEV_BASE_URL`: Optional dev service base URL for pre-release checks.
	h) `KSG_API_TOKEN`: Optional API token if the service requires authentication.
	i) `NPM_TOKEN`: GitHub Actions secret used by package publishing workflows.
	j) `SLACK_WEBHOOK_URL`: Optional secret for Slack or compatible webhook notifications.
	k) `SLACK_CHANNEL`: Optional default channel name or identifier for agent status
	   messages when the webhook service supports it.
	l) `AGENT_NOTIFY_LEVEL`: Optional notification threshold such as `off`, `blockers`,
	   `handoff`, or `all`.

3) Registration Notes
	a) Future agents may register their UUID, capabilities, repository scope, and current
	   branch with an IAC bus when that service exists.
	b) Registration should never require committing secrets or machine-local credentials.
	c) Any required local-only values should be documented here as names and purpose, not as
	   live values.

## Agent Runtime Coordination

1) Run Files
	a) `.AGENT/agent-run.md` is the persistent runbook for recurring startup operations.
	b) `.AGENT/agent-run-once.md` is the one-shot queue for startup operations that should
	   be removed after completion.
	c) Agents should append completed or blocked one-shot work to
	   `.AGENT/agent-action-log.md` before finishing.

2) Prompt Feedback
	a) New maintainer instructions that should persist beyond the current chat should be
	   written into the appropriate `.AGENT/` file.
	b) Repository-only prompting belongs below the repository-specific section of
	   `.AGENT/agent.md`.

3) Synchronization Notes
	a) Feature branches are safer for review or concurrent edits.
	b) When merging prompt updates, preserve other agents' log entries and pending
	   run-once items.
	c) Release coordination changes should update both human docs and action-log evidence.
