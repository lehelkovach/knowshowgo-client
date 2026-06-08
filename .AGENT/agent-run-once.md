# Agent Run Once Queue

One-time startup operations for agents working in this repository. Agents should read this
file at the start of each run after reading `.AGENT/agent.md` and `.AGENT/agent-run.md`.

## How to Process This File

1) Review Active Items
	a) Complete active items before unrelated work when safe.
	b) If an item is not safe or possible, leave it in place and add a blocked note.

2) Remove Completed Items
	a) Delete completed items from the "Active One-Time Items" section.
	b) Do not delete this file.
	c) Do not remove another agent's pending item unless the item is complete or explicitly
	   cancelled by a maintainer.

3) Log Results
	a) Append each completed, blocked, or cancelled run-once item to
	   `.AGENT/agent-action-log.md`.
	b) Include timestamp, agent name, role, branch, scope, actions, verification, and
	   follow-ups.
	c) Re-read `.AGENT/agent.md` after processing any run-once item that changes prompt or
	   runbook behavior.

## Active One-Time Items

No active one-time items.

<!--
Template for a new one-time item:

### YYYY-MM-DD - Short action title

1) Requested By
	a) <maintainer, master repo agent, sub-agent, or system>
2) Assigned Agent
	a) <agent name, role, or "any agent">
3) Action
	a) <one-time startup action to perform>
4) Completion Rule
	a) <what makes this item complete>
5) Notes
	a) <context, constraints, or blockers>
-->
