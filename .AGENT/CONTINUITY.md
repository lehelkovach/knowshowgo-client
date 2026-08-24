# Continuity digest — knowshowgo-client

**Updated:** 2026-08-24 · Agents: read this at session start; keep it short.

## Now

- Policy is root [`AGENTS.md`](../AGENTS.md). The v1 `.AGENT/README.md` contract (resume log, `latest.md` handoff, `/workspace/api` paths) is archived under [`archive/v1/`](./archive/v1/NOTE.md) — do not follow it.
- Pair with KSG `dev` (`0.2.9-dev`): property-definition search + `resolve_slots` (#37) and `semantic_remember/recall/ask/correct` (#38) are on `dev`.
- Install with plain `npm install`. `--legacy-peer-deps` is only needed if the sibling **server** checkout is on `main`, which still carries `peerDependencies.knowshowgo=0.2.8`; `dev` deliberately has none.
- Verified 2026-08-24 on the `dev` tip: `npm install` clean, `node --test js/client.test.mjs` **84/84**, `python3 -m unittest discover -s python -p 'test_*.py'` **76/76**. Both are offline mocks; no server needed.

## Holds / coordination

- Server must be on KSG `dev` tip for semantic + slots endpoints; released prod (`v0.2.8`) soft-404s those paths.
- `prototype_filter` on `search_concepts` is accepted by the server but not enforced — type ∩ value still needs two calls. Stated in AGENTS.md; do not "fix" it client-side.
- Cross-repo version truth is `knowshowgo/docs/VERSION-MATRIX.md`. Do not restate release numbers here.

## Anti-drift

Keep this file short. Point at KSG `docs/SEMANTIC-MEMORY.md` / `docs/STACK-MASTER.md`
for product truth.
