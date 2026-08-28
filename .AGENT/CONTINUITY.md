# Continuity digest — knowshowgo-client

**Updated:** 2026-08-28 · Agents: read this at session start; keep it short.

## Now

- This tip is **`dev`** (integration). Release is **`main`**. `dev` is not `master`.
- **TDD process:** [`docs/TDD-LADDER.md`](../docs/TDD-LADDER.md) → canonical [`knowshowgo/docs/TDD-LADDER.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/TDD-LADDER.md).
- Policy is root [`AGENTS.md`](../AGENTS.md). The v1 `.AGENT/README.md` contract is archived under [`archive/v1/`](./archive/v1/NOTE.md) — do not follow it.
- **S3 (object SDK) is done.** Influence A uses `upsert_object_category` / `upsert_object` / `get_object` / `list_objects`. No client change required for rung A.
- Pair with KSG `dev`. Install with plain `npm install` on this tip.
- Verified 2026-08-24 on `dev`: JS **84/84**, Python **76/76** (offline mocks).

## Holds / coordination

- Next stack merge is **KSG S1 composition**, not this repo. Do not start Influence rung B from the client.
- P1 (client #44 boolean/json types): rebase onto `dev`; not a blocker for A–F.
- Server must be on KSG `dev` for semantic + slots; released prod soft-404s those paths.
- OSL `file:../knowshowgo-client` must stay on **`dev`** for live-KSG rungs. Shared checkouts: use a worktree, do not `git switch` out from under other agents.
- Cross-repo version truth is `knowshowgo/docs/VERSION-MATRIX.md`.

## Anti-drift

Keep this file short. Do not copy the KSG slice table here.

## Anti-drift

Keep this file short. Point at KSG `docs/SEMANTIC-MEMORY.md` / `docs/STACK-MASTER.md`
for product truth.
