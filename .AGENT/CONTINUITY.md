# Continuity digest — knowshowgo-client

**Updated:** 2026-08-29 · Agents: read this at session start; keep it short.

## Now

- Policy is root [`AGENTS.md`](../AGENTS.md). Pair with KSG **`dev`** (`0.2.9-dev`).
- Logic IR SDK is on this tip: `evaluatePrototypeMatch`, persist via `upsert_object` /
  `get_object`, `evaluateLogicInference`, `get_object(..., { infer: true })`.
  Rungs live in KSG [`docs/DEVELOPMENT-PLAN.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/DEVELOPMENT-PLAN.md) § Engage #0.
- Gitflow: branch from **`dev`**, PR into **`dev`**. Do not cut work from `logic-ir-dev`.
- Install with plain `npm install` on `dev` (no server peerDependency).

## Holds / coordination

- Do not tag `vX.Y.Z-client` until KSG DEV is live-smoked (seed + match + infer).
- Server must be on KSG `dev` tip for Logic IR / semantic / slots; released prod (`v0.2.8`) does not have R1/R2.
- `prototype_filter` on `search_concepts` is accepted by the server but not enforced.
- Cross-repo version truth is `knowshowgo/docs/VERSION-MATRIX.md`.

## Anti-drift

Keep this file short. Point at KSG DEVELOPMENT-PLAN for rungs, not a parallel client ladder.
