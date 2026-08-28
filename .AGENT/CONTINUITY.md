# Continuity digest — knowshowgo-client (`main` / release)

**Updated:** 2026-08-28 · This tip is **release**.

## Now

- **`main` = tagged releases** (`v*-client`), paired with KSG. New work branches from **`dev`**.
- **TDD process:** [`docs/TDD-LADDER.md`](../docs/TDD-LADDER.md) → full table on KSG `dev`.
- S3 object SDK (`upsert_object_category` / `upsert_object` / `get_object` / `list_objects`) is **already on this tip**. No client change for Influence A.
- Do not `git switch` this shared checkout to `dev` while other agents use it — they should use a worktree for live-KSG rungs.

## Holds

- The v1 `.AGENT/README.md` / `resume-log.md` / `handoffs/latest.md` contract is stale (those files still exist on `main`). Prefer this digest + PRs. On `dev` they are archived.
- Client #44 (boolean/json types) rebases onto `dev`, not `main`.

## Anti-drift

Keep this file short. Do not copy the KSG slice table here.
