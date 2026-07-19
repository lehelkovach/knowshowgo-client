# Status — KSG Client SDK

_Last updated: 2026-07-19_

**Version:** `0.2.3` (dev)
**Active branch:** `cursor/dynamic-object-materializer-5e19` (PR → `dev`)
**Releases:** unpublished to npm yet; versioned alongside the KSG service.

## Feature status

| Feature | Status |
|---|---|
| JS SDK (`js/client.js`) over KSG REST — concepts, objects, categories, assertions, procedures, prototypes, search | ✅ shipped |
| Python SDK (`python/client.py`) | ✅ shipped |
| `/api2.0` defaults with `/api` fallback (prefix override) | ✅ shipped |
| **Dynamic object materializer** — graph node → live JS object (typed props + graph-named methods) | 🟡 in dev (this branch) |
| **Layer-2 specialization** — `defineSpecialization()` domain fns that delegate to the client | 🟡 in dev (this branch) |
| **Semantic procedure discovery** — bind methods via `search_procedures` when no `has_procedure` edges | 🟡 in dev (this branch) |

## Recent changes (this session)
- Added `js/materialize.js`: `materializeObject`, `defineSpecialization`, `toMethodName`, `coerceValue`.
- Discovery = precise `has_procedure` edges → semantic recall fallback (`semanticDiscovery`, `top_k`, `minSimilarity`).
- Tests: `js/materialize.test.mjs` (14) + `js/client.test.mjs` (46) = **60 pass**. Demos: `scripts/materialize_demo.mjs`, `scripts/layered_demo.mjs`.

## TODO / next
- [ ] Unify the server-side ORM and the client materializer into one contract.
- [ ] Tune semantic-discovery precision (default `minSimilarity`, dedupe edge cases).
- [ ] Add a `LICENSE` file (currently missing).
- [ ] Decide npm publish / packaging story.
