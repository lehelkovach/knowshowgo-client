# Continuity digest — knowshowgo-client

**Updated:** 2026-10-05 · Agents: read this at session start; keep it short.

## Now

- Policy is root [`AGENTS.md`](../AGENTS.md). Pair with the **same-channel** KSG tip (`dev`↔`dev`, `main`↔`main`). Numbers live only in KSG `docs/VERSION-MATRIX.md` and this branch's `package.json`; do not restate them.
- Board: KSG [`docs/DEVELOPMENT-PLAN.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/DEVELOPMENT-PLAN.md) **v7.2**; this repo is **K0** and track **S** in KSG `docs/PARALLEL-TRACKS.md`.
- **Two packages, one repo** (#60): npm ships `js/` + `dist/` only; Python is the package `knowshowgo_client` under `python/` with `pyproject.toml`, tests in `python/tests/`, and a `python/client.py` shim so `from client import …` still works. `npm test` runs every `js/*.test.mjs`. `node scripts/bump-version.mjs X.Y.Z[-dev]` bumps both.
- Publishing: `publish.yml` (npm, needs repo secret `NPM_TOKEN`; never succeeded before #60 for that reason) and `publish-pypi.yml` (PyPI trusted publishing; register the workflow once on pypi.org). Both fire on `v*` tags.
- `search_concepts` no longer defaults a similarity floor (#59); `prototype_filter` **is** enforced server-side.
- Gitflow: branch from **`dev`**, PR into **`dev`**. No `knowshowgo` peerDependency.

## Holds

- No OCI deploy workflow here; KSG/agent deploys pull this repo as a sibling checkout.
- Do not hardcode pairing versions in AGENTS.md or docs.

## Next

1. Wrap KG2 in both SDKs: `record` on `evaluateLogicInference`, an `evaluate_logic_ir` wrapper for `POST /logic-ir/evaluate`, `explain_derivation(uuid)`, `list_derivations(conclusion)`; parity tests.
2. ~~The MCP server over this SDK (track S)~~ — shipped server-side instead: `POST /mcp` on the KSG host (knowshowgo v0.2.22) replays the REST routes, so no SDK wrapper is needed. Client-facing setup: `docs/MCP.md`.
3. Docs sweep — **done 2026-10-05 for README + GETTING-STARTED** (new newcomer intro `docs/WHAT-IS-KNOWSHOWGO.md`; GETTING-STARTED rewritten as a hands-on tour covering tokens, beliefs/contradiction, `verify`, objects + `hydrate`, `search_knowledge`, semantic memory, `timeoutMs`; README no longer hardcodes a version table or tag pins). `API.md` still carries old examples; fix when touching it.

## Anti-drift

Keep this file short. Do not keep a second ladder here.
