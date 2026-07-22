# AGENTS.md

Canonical instructions for coding agents working in the KnowShowGo client SDK.

This repo ships the JavaScript (`js/client.js`) and Python (`python/client.py`)
client SDKs for the KnowShowGo (KSG) REST API. The `osl-oc-agent` OpenClaw agent
consumes this SDK to reach the KSG service.

## Commands

```bash
npm install --legacy-peer-deps        # see cloud note below
node --test js/client.test.mjs        # JS unit tests
python3 -m unittest discover -s python -p 'test_*.py'   # Python unit tests
npm run build                         # esbuild bundle -> dist/index.cjs
```

## Versions

| Branch | Version | Pairs with server |
|--------|---------|-------------------|
| `main` | `0.2.4` (`v0.2.4-client`) | KSG `v0.2.4` |
| `dev` | `0.2.5-dev` | KSG `0.2.5-dev` / `v0.2.5-dev` |

## API versioning

The KSG service introduces new REST features under the canonical `/api2.0`
namespace while retaining `/api` as a backward-compatible alias. SDK methods for
new features default to `/api2.0` and accept a prefix override
(`prototypeApiPrefix` in JS, `prototype_api_prefix` in Python) so callers can
fall back to `/api`. When adding a wrapper for a new feature endpoint, build its
path from that prefix and add parity tests for both namespaces.

## Dynamic object materializer (`js/materialize.js`)

`materializeObject(client, objectUuid, opts?)` turns a KSG object into a live JS
object **without hardcoding any names**:

- **Properties** are the object's own stored properties, coerced to JS types
  using the prototype's declared `valueType` (e.g. `"56"` → `56`).
- **Methods** are the procedures a prototype is linked to, discovered two ways
  (in order): (1) precise `has_procedure` assertions, then (2) **semantic recall**
  via `search_procedures` when no edges exist — using the prototype's stored
  `subprocedureQuery` (preferred) or its name/label, or an explicit
  `opts.discoveryQuery`. So methods bind with zero hand-wired edges. Tune with
  `opts.semanticDiscovery` (default true), `opts.top_k`, `opts.minSimilarity`.
  The method name is derived from each procedure's KSG **title** (`toMethodName`,
  e.g. `"Send Welcome Email"` → `sendWelcomeEmail`). Rename/relink the procedure
  in KSG and the materialized method follows — no hardcoded function names.
- Calling a method runs `opts.runProcedure({ procedureUuid, title, object, args })`
  if provided; otherwise it returns the compiled procedure bound to the object
  (`{ procedure, procedureUuid, boundTo, compiled, args }`).
- `opts.discoverProcedures(client, prototypeUuid)` and
  `opts.procedureLinkPredicate` (default `has_procedure`) let callers override
  discovery. Non-enumerable `__ksg` (uuid/title/prototypeUuid/raw) and
  `__methods` (method→procedure map) are attached for introspection.

### Specialization (Layer 2)

The SDK is layered, most abstract → most specialized:

- **Layer 0 — the client class (`js/client.js`)**: generic graph primitives
  (concepts, categories, objects, assertions, procedures).
- **Layer 1 — `materializeObject`**: a generic node "becomes objective" — a live
  object with typed properties + graph-derived methods.
- **Layer 2 — specialization**: hand-written domain functions layered on top,
  that delegate DOWN to the client. Never fork the client.

Register domain functions by type name with `defineSpecialization(typeName, methods)`,
or pass them inline via `opts.specialize`. Each is invoked as
`fn.call(instance, client, args)` — so `this` is the live object and the second
argument is the generic client beneath. Registered specializations attach when an
object of that type is materialized (type name resolved from the prototype, or via
`opts.typeName`). A specialization may override a graph-derived method (top layer
wins). Introspect with `obj.__type` and `obj.__specialized`.

Additive only — it does not change the client class. Tests:
`node --test js/materialize.test.mjs`. Live demos (need a running service):
`node scripts/materialize_demo.mjs` and `node scripts/layered_demo.mjs`.

## Soft owner identity (read ACL)

KSG filters private objects by caller identity. The client supports:

- Constructor: `defaultOwnerUserId` / `defaultAgentSessionId` (JS) or
  `default_owner_user_id` / `default_agent_session_id` (Python)
- Per-call: `owner_user_id` / `agent_session_id` on `get_object`, `list_objects`,
  `search_concepts`, etc.
- Transport: sends `X-KSG-Owner` / `X-KSG-Session` and fills `ownerUserId` on
  query/body when set

Agents should set `defaultOwnerUserId` to the session namespace so list/search/get
cannot leak other users' private data. This is soft identity — server-side token
auth is a follow-up.

## Cursor Cloud specific instructions

- Install with `npm install --legacy-peer-deps`. The `peerDependencies` entry
  for the sibling service package is **not published to npm**, so a plain
  `npm install` fails with an E404. The SDK's own runtime dep is just
  `node-fetch`; the peer is only relevant when co-locating the service package.
- The JS tests use the **Node built-in test runner**, not jest. `npm test`
  (jest) reports "No tests found" because the test file is `js/client.test.mjs`.
  Run `node --test js/client.test.mjs` instead. All JS + Python tests are unit
  tests with mocked transport (no live server needed).
- For live integration against a running KSG service, construct the client with
  an explicit base URL, e.g. `new KnowShowGoClient({ baseUrl: 'http://localhost:3000' })`
  (Python: `KnowShowGoClient("http://localhost:3000")`). Start the service from
  the sibling service repo with `PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start`
  (no Docker needed). The Python client requires the `requests` package.
