# KnowShowGo client SDK assessment (filed 2026-08)

> Consideration note for `knowshowgo-client` updates. Not a committed roadmap —
> a durable dump of an external review so packaging / auth / ORM work does not
> get rediscovered from scratch. Prefer landing fixes in ordered PRs below.

## Verdict

**The plain-JavaScript ESM choice is appropriate for KnowShowGo.** The current
`knowshowgo-client` is best described as a **substantial REST transport SDK
exposing fuzzy-graph operations**, not yet a true client-side fuzzy graph ORM
with prototype hydration, duck-typed behaviors, or polymorphic dispatch.

| Area | Current state |
| --- | --- |
| Dynamic JavaScript/ESM foundation | **Good** |
| REST endpoint coverage | **Good alpha** |
| Fuzzy prototype operations on server | **Exposed well** |
| Client-side fuzzy object runtime | **Mostly absent** |
| Tests | **Broad mapping coverage; limited behavioral coverage** |
| Authentication/security | **Not production-ready** |
| Packaging and CI | **Currently broken** |
| Documentation/version consistency | **Known drift** |
| Overall | **Useful SDK alpha, not yet robust ORM/runtime** |

## What is already good

Broad coverage of the live KSG surface: prototypes / match / exemplars /
generalization, concepts, associations, object categories, versioned objects,
assertions + provenance, procedures, composites, topics, market matching,
ratings, vaults, private memory, release handshake, `fetch` DI, owner/session
propagation, JS + Python.

Open-ended payloads (properties, metadata, provenance, context, components,
steps) are preserved without rigid client classes — consistent with
schema-light fuzzy-graph goals.

JS tests cover endpoint selection, snake↔camel translation, unwrapping,
aliases, scope propagation, prefix overrides, release-manifest behavior. This
is a comprehensive manually written API façade, not a toy.

## Gaps vs fuzzy-ORM intention

### 1. Raw JSON, not prototype-bearing objects

Responses are plain `res.json()` objects. No `hydrate` / `PrototypeRegistry` /
`Proxy` / capability resolver. Fine if the server owns the ORM and the client
stays thin; not enough for:

```js
const person = await client.objects.get(uuid);
person.describe();
person.matches(other);
```

### 2. Function-valued properties cannot survive JSON transport

`JSON.stringify` drops functions / symbols / prototypes / closures; cycles
throw. Executable behavior must be **behavior-refs** (e.g. procedure UUID)
bound through a **trusted local registry** — never `eval` / `new Function` on
server-delivered code.

### 3. Cognitive prototypes ≠ JavaScript `[[Prototype]]`

KSG memberships are weighted, multi-category, context-dependent. Prefer:

```text
JS prototype     → shared GraphEntity behavior
KSG memberships  → weighted state on the entity
Behavior registry → semantic capability → trusted impl
Resolver         → precedence from weights + context
```

Composition over multiple simultaneous JS prototype chains.

## Robustness problems (priority)

### P0 — Auth missing

Soft identity only (`X-KSG-Owner` / `X-KSG-Session`). Server has tokens; SDK
does not send `Authorization: Bearer`. Related: open **PR #25**. Add
`accessToken` / `tokenProvider`; prefer headers over identity in query strings.

### P0 — `knowshowgo` must not be a peerDependency

This is a remote REST client. Peer on the server package breaks `npm ci` and
forces `--legacy-peer-deps`. Remove it; express compatibility via release
manifest + contract tests + version matrix.

### P0 — CI does not protect the repo

Workflow watches wrong paths (`src/**` vs `js/**`/`python/**`), skips PRs,
`continue-on-error`, no Python tests, stale action versions, install fails on
main. Split **`ci.yml`** (every PR/push, matrix, pack+import) from
**`publish.yml`** (tags only, never continue-on-error). Keep live smoke out of
`prepublishOnly` unless an ephemeral server is provided.

### P0 — `connect()` hard-pins release

Default `expected_release = "v0.2.8"` (channel `release`) breaks when public
API moves. Prefer discover-and-accept-compatible; exact pin only when asked.
**PR #25** addresses design; **PR #26** mostly bumps the pin + Python fixtures
— resolve overlap in favor of #25’s direction, cherry-pick #26’s doc/test fixes.

### P0 — Contract path matching defective

Concrete `/api/objects/<uuid>` vs template `/api/objects/:uuid` — current
`split("/:")` normalization does nothing useful. Match segment-by-segment
(`:param` wildcards). Add tests.

### P1 — `auto_connect` races

Constructor fires `connect()` but requests never `await` it; failures can be
unhandled rejections. Expose `await client.ready()` or drop auto-connect.

### P1 — Transport controls

Need timeout, `AbortSignal`, retries + `Retry-After`, idempotency keys,
caller headers, correlation IDs, structured errors, `204` / problem+json
handling, logging hooks.

### P1 — Invariant guards without hard schemas

Assert operation contracts (non-empty strings, finite weights, membership
ranges) while keeping `additionalProperties` open for graph data.

### P1 — Prototype-pollution hygiene on hydrate

Never blind `Object.assign` of untrusted maps; guard `__proto__` /
`constructor` / `prototype`; prefer null-prototype dicts / `Map`.

## Packaging contradictions

- `"types": "js/client.js"` is not a declaration file
- `dist/` built but `main`/`exports` point at unbundled `js/`
- `node-fetch` unused given Node 18+ `globalThis.fetch`
- Jest installed; tests use `node:test`
- Python shipped in npm tarball but not on PyPI
- Exports lack types/browser conditions

Target shape: ESM `exports` → `dist/index.js` + `.d.ts` from JSDoc; drop unused
deps; separate PyPI packaging.

## Docs drift

Package `0.2.8` vs README/API/`AGENTS.md` still saying `0.2.7`; camelCase docs
vs snake_case option keys in JS. Long-term: generate JS/Python/JSDoc/d.ts/API
tables/contract tests from one contract source.

## Recommended fuzzy-runtime architecture (optional layer)

Keep transport thin; add:

```text
KnowShowGoClient     raw network
PrototypeRegistry    semantic prototype → trusted behaviors
GraphEntity          shared methods + metadata
hydrate / dehydrate  JSON ↔ entity
CapabilityResolver   weighted multi-membership dispatch
```

## Recommended order of work (client)

1. Remove server peerDependency; restore green CI.
2. Bearer / tokenProvider support.
3. Resolve PR **#25** vs **#26** (prefer #25 design; fold #26 truth fixes).
4. Fix contract route matching + `auto_connect` / `ready()`.
5. Timeouts, abort, structured errors, headers, safe retries.
6. Package exports, d.ts, drop dead deps, packed-artifact tests.
7. Optional PrototypeRegistry + hydrate layer.
8. Multi-prototype capability resolution + behavior-refs.
9. Generate JS/Python/docs/tests from one contract.
10. Security / round-trip tests for malicious dynamic property maps.

## Related open PRs (at file time)

| PR | Notes |
| --- | --- |
| [#25](https://github.com/lehelkovach/knowshowgo-client/pull/25) | `connect()` vs public release; closer to right design |
| [#26](https://github.com/lehelkovach/knowshowgo-client/pull/26) | docs → v0.2.8-client + 2 Python test fixes; pin bump only postpones drift |
| #2 / #3 / #4 | belief / temporal / visual embeddings — land after P0 CI+auth |

## Core design call

**Plain JS ESM remains a strong fit.** Broad transport surface exists; the
distinctive fuzzy prototype DX needs a **separate runtime layer**. Fix
packaging, auth, and CI before presenting the SDK as production-ready.
