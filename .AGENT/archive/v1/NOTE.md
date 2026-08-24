# Archived v1 agent contract — do not follow

These three files are the v1 "client agent" operating contract. They are kept
for history and are **not** instructions. The sibling `knowshowgo` and
`osl-oc-agent` repos archived their equivalents (`.AGENT/archive/v1/`) when they
moved to the v2 continuity model; this repo had not, so a fresh agent reading
`.AGENT/README.md` got a different and wrong contract from the one in the root
`AGENTS.md`.

Follow instead: root [`AGENTS.md`](../../../AGENTS.md) → [`.AGENT/CONTINUITY.md`](../../CONTINUITY.md).

| Archived | What it said | Why it is wrong now |
|---|---|---|
| `README.md` | Required startup sequence: read `.AGENT/handoffs/latest.md`, read `.AGENT/resume-log.md`, continue the latest unchecked item, and append a log entry per session. Located the repo at `/workspace/api` with the server at `/workspace`. | The v2 model is explicit that append-only action logs and run-once queues are dead; work lives in issues, commits and PRs. The repo is a sibling checkout, not a `/workspace/api` submodule. |
| `resume-log.md` | Append-only session log, last meaningful entries mid-2026. | Superseded by PRs plus `.AGENT/CONTINUITY.md`. |
| `handoff-latest-2026-06-19.md` | Branch review dated 2026-06-19 telling the next agent to merge `cursor/client-dev-sync-eb91` and tag `v0.2.3-dev-client`; peer `ksg-server@0.2.3-dev`. | Six releases old. `main` is `0.2.8` / `v0.2.8-client`, `dev` is `0.2.9-dev`, and the server peer dependency was deliberately removed. |

Archived 2026-08-24.
