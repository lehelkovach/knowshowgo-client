# Continuity digest — knowshowgo-client

**Updated:** 2026-10-06 · Agents: read this at session start; keep it short.

## Now

- Policy is root [`AGENTS.md`](../AGENTS.md). Pair with the **same-channel** KSG tip (`dev`↔`dev`, `main`↔`main`). Numbers live only in KSG `docs/VERSION-MATRIX.md` and this branch's `package.json`; do not restate them.
- Board: KSG [`docs/DEVELOPMENT-PLAN.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/DEVELOPMENT-PLAN.md) **v7.3**; this repo is **K0** and track **S** in KSG `docs/PARALLEL-TRACKS.md`.
- **Two packages, one repo** (#60): npm ships `js/` + `dist/` only; Python is the package `knowshowgo_client` under `python/` with `pyproject.toml`, tests in `python/tests/`, and a `python/client.py` shim so `from client import …` still works. `npm test` runs every `js/*.test.mjs`. `node scripts/bump-version.mjs X.Y.Z[-dev]` bumps both.
- Publishing: `publish.yml` (npm) and `publish-pypi.yml` (PyPI trusted publishing; register the workflow once on pypi.org). Both fire on `v*` tags. **2026-10-06: neither package has ever been published.** The `0.2.22` npm run (dispatch from `main`, run 37402901152) built and signed provenance, then the registry answered `403: Two-factor authentication or granular access token with bypass 2fa enabled is required` — the `NPM_TOKEN` secret is a classic or non-bypass token. Operator fix: a **granular** npm access token with *bypass 2FA* for this package (or publish `0.2.22` once by hand and then switch the workflow to npm trusted publishing, which needs the package to exist first). PyPI: the trusted publisher is not registered, so `publish-pypi.yml` has nothing to authenticate against. Until one of them succeeds, the install instructions in `docs/INSTALL.md` only work from a git checkout.
- **2026-10-06 state.** `main` is `0.2.22` (released by another session, paired with KSG v0.2.22; first KSG release to ship `POST /mcp` to prod); `dev` carries the public documentation set (#74–#77: README landing, `docs/WHAT-IS-KNOWSHOWGO.md`, `USING-THE-API.md`, `INSTALL.md`, `CONCEPTS.md`, `USE-CASES.md`, `PROTOTYPES-AND-CASTING.md`, `PROCEDURES-AND-LOGIC.md`, `BASICS.md`, `llms.txt`) and the `withoutNulls` fix for `reinforce_assertion`/`contradict_assertion`. The commons design those docs point at as "designed, not built" is now KSG `docs/COMMONS-PROTOCOL.md` and rungs `KG17`–`KG20`; a client rung follows KG20 (a node list instead of one hostname).
- `search_concepts` no longer defaults a similarity floor (#59); `prototype_filter` **is** enforced server-side.
- Gitflow: branch from **`dev`**, PR into **`dev`**. No `knowshowgo` peerDependency.

## Holds

- No OCI deploy workflow here; KSG/agent deploys pull this repo as a sibling checkout.
- Do not hardcode pairing versions in AGENTS.md or docs.

## Next

1. Wrap KG2 in both SDKs: `record` on `evaluateLogicInference`, an `evaluate_logic_ir` wrapper for `POST /logic-ir/evaluate`, `explain_derivation(uuid)`, `list_derivations(conclusion)`; parity tests.
2. ~~The MCP server over this SDK (track S)~~ — shipped server-side instead: `POST /mcp` on the KSG host (knowshowgo v0.2.22) replays the REST routes, so no SDK wrapper is needed. Client-facing setup: `docs/MCP.md`. After KSG `KG20` (editions), this repo's rung is a node list instead of one hostname.
3. Docs sweep — **done 2026-10-05 for README + GETTING-STARTED** (new newcomer intro `docs/WHAT-IS-KNOWSHOWGO.md`; GETTING-STARTED rewritten as a hands-on tour covering tokens, beliefs/contradiction, `verify`, objects + `hydrate`, `search_knowledge`, semantic memory, `timeoutMs`; README no longer hardcodes a version table or tag pins). `API.md` still carries old examples; fix when touching it.

## Anti-drift

Keep this file short. Do not keep a second ladder here.
