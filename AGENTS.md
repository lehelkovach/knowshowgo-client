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
- **Methods** are the procedures the object's prototype is linked to via
  `has_procedure` assertions. The method name is derived from each procedure's
  KSG **title** (`toMethodName`, e.g. `"Send Welcome Email"` → `sendWelcomeEmail`).
  Rename/relink the procedure in KSG and the materialized method follows — there
  are no hardcoded function names in the SDK.
- Calling a method runs `opts.runProcedure({ procedureUuid, title, object, args })`
  if provided; otherwise it returns the compiled procedure bound to the object
  (`{ procedure, procedureUuid, boundTo, compiled, args }`).
- `opts.discoverProcedures(client, prototypeUuid)` and
  `opts.procedureLinkPredicate` (default `has_procedure`) let callers override
  discovery. Non-enumerable `__ksg` (uuid/title/prototypeUuid/raw) and
  `__methods` (method→procedure map) are attached for introspection.

Additive only — it does not change the client class. Tests:
`node --test js/materialize.test.mjs`. Live demo (needs a running service):
`node scripts/materialize_demo.mjs`.

## Cursor Cloud specific instructions

- Install with `npm install --legacy-peer-deps`. The `peerDependencies` entry
  `knowshowgo@^0.2.1` is the sibling service package and is **not published to
  npm**, so a plain `npm install` fails with an E404. The SDK's own runtime dep
  is just `node-fetch`; the peer is only relevant when co-locating the service
  package.
- The JS tests use the **Node built-in test runner**, not jest. `npm test`
  (jest) reports "No tests found" because the test file is `js/client.test.mjs`.
  Run `node --test js/client.test.mjs` instead. All JS + Python tests are unit
  tests with mocked transport (no live server needed).
- For live integration against a running KSG service, construct the client with
  an explicit base URL, e.g. `new KnowShowGoClient({ baseUrl: 'http://localhost:3000' })`
  (Python: `KnowShowGoClient("http://localhost:3000")`). Start the service from
  the sibling `knowshowgo` repo with `PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start`
  (no Docker needed). The Python client requires the `requests` package.
