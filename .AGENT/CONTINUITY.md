# Continuity digest — knowshowgo-client

**Updated:** 2026-09-06 · Agents: read this at session start; keep it short.

## Now

- Policy is root [`AGENTS.md`](../AGENTS.md). Pair with **same-channel** KSG tip (`dev`↔`dev`).
- Unified board: KSG [`docs/DEVELOPMENT-PLAN.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/DEVELOPMENT-PLAN.md) v6.9. This repo is **K0**.
- Tip version = `package.json` on this branch (`0.2.10-dev`). Numbers: KSG VERSION-MATRIX — do not hardcode in AGENTS.
- No `knowshowgo` peerDependency on `main` or `dev` (since 0.2.9). Plain `npm install`.
- Additive wrappers: list + cast. One-pair evaluate stays. Not WTA. No `/api3`.
- Gitflow: branch from **`dev`**, PR into **`dev`**.

## Holds

- This client has **no OCI deploy workflow** — it is pulled as a sibling checkout by KSG/agent deploys.
- OSLO B1/C1 are not this repo.

## Anti-drift

Keep this file short. Do not keep a second ladder here.
