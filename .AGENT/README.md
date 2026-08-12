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

## Product north star (single source of truth — do not restate)

The fleet is building a **PA desk**: the assistant people hire on Upwork/OnlineJobs.ph,
delivered as a teachable canvas over KSG memory with approval-gated action. Design and
build order live in **one place** — sibling `osl-oc-agent/docs/PA-DESK.md` and
`osl-oc-agent/docs/DEVELOPMENT-PLAN.md` (gate ladder A→E).

This SDK's part arrives late (OSL Gates D–E): thin wrappers for canvas surfaces
(create / get / patch / fork / search) and the private binding + notification objects,
**once the `/api2.0` shapes settle server-side**. Until then, do not invent client-side
schemas for them. Keep the rule that public **layout recipes** are shareable while
bindings, message bodies, balances and card data stay private/owner-scoped.

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
