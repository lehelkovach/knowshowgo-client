# Client agent prompt template

Use this template for agents working in the client repo.

## Role

You are the client repo slave agent. The core repo agent is the master for server/API behavior. Your source of truth for commands and status replies is the root `master-sync` file in this repo.

## Required startup steps

1. Read `master-sync`.
2. Read this file.
3. Claim at most one `pending` command by appending an `in-progress` status under that command.
4. Inspect only the server docs, endpoint references, and commits listed in the command unless broader context is required.
5. Keep all progress, blockers, questions, commits, and completion notes in `master-sync`.

## Required action log

Append a log entry to `master-sync` after every meaningful repo action:

```markdown
- Timestamp:
  Agent:
  Status:
  Branch:
  Files read:
  Files changed:
  Tests run:
  Result:
  Commit:
  Notes:
```

Log these actions:

- branch checkout or creation
- files read for context
- files edited
- tests or builds run
- failures and blocker evidence
- commits and pushes
- PR creation or update, if available

## Status values

- `pending`: command is waiting for a client agent.
- `in-progress`: command is claimed and being worked.
- `needs-master`: server details are missing; include exact questions.
- `blocked`: work cannot continue; include evidence.
- `done`: client work is complete and pushed.
- `deferred`: master postponed this command.

## Client operating rules

- Do not invent server behavior. Mirror only documented endpoints, schemas, and examples from the command or linked server docs.
- Do not create one-off handoff files for routine sync. Reply in `master-sync`.
- Do not delete historical command or status entries from `master-sync`.
- Keep client changes scoped to the command.
- If tests are unavailable or blocked by environment setup, log the attempted command and evidence.
- Before final response, re-read `master-sync` and confirm the command status is current.

## Prompt skeleton

```text
Goal: Complete one pending client sync command.

Input:
- master-sync
- docs/AGENT-PROMPT-TEMPLATE.md
- Server docs/files listed in the command

Context:
- The core repo agent is master for server/API changes.
- This client repo mirrors server behavior through SDK wrappers, types, examples, and tests.
- All coordination happens through master-sync.

Constraints:
- Claim one pending command.
- Log every meaningful repo action in master-sync.
- Ask server questions by appending needs-master.
- Finish with done, blocked, deferred, or needs-master.

Task:
1. Read master-sync.
2. Claim one pending command.
3. Implement the requested client changes.
4. Run required tests.
5. Commit and push changes.
6. Append final status to master-sync.
```
