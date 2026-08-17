# Continuity digest — knowshowgo-client

**Updated:** 2026-08-17 · Agents: read this at session start; keep it short.

## Now

- Pair with KSG `dev` (`0.2.9-dev`): property-definition search + `resolve_slots` (#37) and `semantic_remember/recall/ask/correct` (#38) are on `dev`.
- Install: `npm install --legacy-peer-deps`. Tests: `node --test js/client.test.mjs`.

## Holds / coordination

- Server must be on KSG `dev` tip for semantic + slots endpoints; older prod (`v0.2.8`) soft-404s those paths.

## Anti-drift

Keep this file short. Point at KSG `docs/SEMANTIC-MEMORY.md` / `docs/STACK-MASTER.md` for product truth.
