# Client Agent Operating Instructions

Repository: `knowshowgo-client`  
Repo path in cloud workspace: `/workspace/api`

## Required startup sequence

Before making any changes, the client agent must:

1. Read this file (`.AGENT/README.md`).
2. Read `.AGENT/handoffs/latest.md`.
3. Read `.AGENT/resume-log.md` and continue from the latest unchecked item.
4. Run access preflight:
   - `./scripts/agent-access-check.sh`
   - If syncing with private upstream core repo, also run:
     - `UPSTREAM_PRIVATE_REPO=<core-repo-url> ./scripts/agent-access-check.sh`

## Scope boundaries

- Primary scope: this repo only (`/workspace/api`).
- Upstream reference repo: `/workspace` (private core `knowshowgo`).
- Do not modify upstream files except for explicit coordination metadata.

## Sync expectations

- Keep wrappers aligned with upstream REST/API behavior.
- Add/adjust targeted tests when wrappers change.
- Commit small, traceable increments with clear messages.

## Logging requirements

For each work session, append one entry to `.AGENT/resume-log.md` including:

- timestamp (UTC)
- branch + commit started from
- files read
- files changed
- tests run and results
- final commit hash + push result
- next pending task
