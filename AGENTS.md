# AGENTS.md

> Product / MVP cold-start: [`README.md`](README.md). Client tip: `dev` (`0.2.9-dev`).

## Continuity

- **Digest:** [`.AGENT/CONTINUITY.md`](.AGENT/CONTINUITY.md)
- **Portfolio master:** sibling [`knowshowgo/docs/STACK-MASTER.md`](../knowshowgo/docs/STACK-MASTER.md)
- Gitflow: branch from **`dev`**, PR into **`dev`**.
- The v1 agent contract (`.AGENT/README.md` + `resume-log.md` + `handoffs/latest.md`)
  is archived under [`.AGENT/archive/v1/`](.AGENT/archive/v1/NOTE.md). It told agents
  to append a per-session resume log and resume a June 2026 handoff; **this file
  supersedes it.** No action logs, no run-once queues — work lives in PRs.

**Start:** [`README.md`](README.md). Pair with knowshowgo **`dev`**:
[CLIENT-SYNC](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/CLIENT-SYNC.md).
KSG execute queue (unified `dev` ladder: CH / K / IR / OSLO): [DEVELOPMENT-PLAN](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/DEVELOPMENT-PLAN.md).

## Engage now (client)

1. **K0 Logic IR SDK (on `dev`, not prod)** — R0 `evaluatePrototypeMatch`; R1 persist IR
   via `upsert_object` / `get_object`; R2 `evaluateLogicInference` +
   `get_object(..., { infer: true })`. Matching Argument ≠ VALID inference.
   Next client work follows the server PR into `dev` (IR3+ after CH0).
2. **Bearer API token support** — ✅ constructor `authToken` / `accessToken` /
   `apiToken` / `tokenProvider`; sends `Authorization: Bearer …` (soft
   `X-KSG-Owner` remains as fallback). Agent + Chrome should pass tokens.
3. **Entity object model** — `get_entity_properties` / `get_entity_types` /
   `EntityProxy` (`.middleName`, `.getType()`); then `load(name)` → KSGObject.
4. Parity tests JS + Python for every new `/api2.0` surface; dual-prefix where required.
   New methods must be fleet-testable (unit + offline mock).

QA matrix (client surfaces of): sibling `osl-oc-agent/docs/QA-FLEET.md`.

## Commands

```bash
npm install                                        # plain — see peerDependencies policy
node --test js/client.test.mjs                     # JS unit tests (NOT jest)
python3 -m unittest discover -s python -p 'test_*.py'
npm run build                                      # esbuild -> dist/index.cjs
```

**Verified on the `dev` tip, 2026-08-24:** `npm install` clean, JS **84 pass / 0
fail**, Python **76 pass / 0 fail**. Both suites mock the transport, so no server
is needed. `npm test` (jest) reports "no tests found" — that is expected, the JS
tests use the Node built-in runner.

`--legacy-peer-deps` is **not** required here. It is only needed when the sibling
**server** checkout is on `main`, which still carries
`peerDependencies.knowshowgo=0.2.8`; `dev` has no peer entry (see the policy
section below). Any doc telling you to always pass it is pre-0.2.9.

## Versions (this tip)

| | |
|---|---|
| Client | **`0.2.9-dev`** / branch **`dev`** |
| Server | knowshowgo **`0.2.9-dev`** / **`dev`** |
| Contract | `GET /api/release` → **`surfaces.clientContract`** |
| `connect()` default | **no pin** — discovers server; pass `expected_*` to assert |

Released pairing: see the server repo's
[`docs/VERSION-MATRIX.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/VERSION-MATRIX.md)
— do not restate release numbers here.

## Known broken / open

| Thing | State |
|---|---|
| `prototype_filter` on `search_concepts` | Accepted by the server, **not enforced**. Type ∩ value is two calls. Do not paper over it in the SDK. |
| Semantic + slots endpoints against prod | `main`/prod is `v0.2.8` and soft-404s `/api2.0/semantic/*` and `resolve_slots`. They need a server on the KSG `dev` tip. |
| `dataset.remember` against prod (agent path) | Times out after ~20s as of 2026-08-23; root cause unknown. It is a **server/host** problem, not an SDK one — do not add retries or a client-side workaround before it is diagnosed. |
| CI | A run that fails in 2–3s with `steps=0` and `BlobNotFound` logs is a GitHub Actions **budget** block, not a test failure. Check Settings → Billing → Budgets. |

## peerDependencies policy (deliberate, since 0.2.9)

This SDK is **transport-only**: `package.json` intentionally has **no
`peerDependencies` entry** for the `knowshowgo` server package.

- The server package is **not published to npm**, so a peer entry breaks plain
  `npm install` with an E404 (the reason `--legacy-peer-deps` used to be
  required).
- Server-version compatibility is enforced at **runtime, not install time**:
  `connect()` discovers `GET /api/release` and callers may pass
  `expected_release` / `expected_channel` to assert a contract.
- Do not re-add the peer entry without revisiting this section; `main` still
  carrying `peerDependencies.knowshowgo=0.2.8` is pre-policy and ends with the
  v0.2.9-client release.

The package version and the advertised release are **not** the same number and
drift apart on purpose: `package.json` is `0.2.9-dev` on both repos while
`GET /api/release` on server tip advertises `v0.2.9-dev`; client `connect()` is unpinned
tracks the manifest rather than the package. Check both before assuming a
mismatch is a bug.

## Querying the graph data model (properties are concepts)

KSG models an entity's **properties and each property value as their own
concepts**, joined by edges — not as keys in a props blob. A `CreditCard` object
links `has_property` → property-definition concept and `has_property_value` →
an embedded value concept; a `concept_ref` property (or `has_component`) points
at a nested object such as `BillingAddress`, which hangs its own
`billing_city` / `billing_zip` value concepts.

That means "find the billing city that looks like *washington*" is a graph +
vector query, not a string scan. Compose it from three shipped methods:

```js
// value-first: semantic hit on the value concept, then walk back to its owner
const hits = await client.search_concepts('washington', { top_k: 10 });
await client.get_associations(hits[0].uuid, { direction: 'outgoing' }); // value_of_property
await client.get_object(hits[0].props.objectUuid);

// type-first: rank field/category prototypes by meaning
await client.match_prototypes({ text: 'billing city', top_k: 5 });

// seed + traverse in one round trip
await client.query_graph({
  search: { text: 'washington', topK: 5 },
  traverse: { edgeTypes: ['value_of_property', 'has_property_value', 'has_component'], depth: 2 },
});
```

Each value is typed by a **`PropertyValue:<name>`** prototype whose embedding is
the running centroid of values seen for that field, so `match_prototypes({ text:
'billing city' })` resolves a real node and its `has_exemplar` edges lead to the
stored values (edge weight `props.w` is typicality).

One limit to state plainly rather than work around: **type ∩ value is not one
call.** `prototype_filter` on `search_concepts` is accepted by the server but not
enforced, so constrain the field with `match_prototypes` and rank the value with
`search_concepts` yourself.

## No domain-specific SDK surfaces

**A new kind of data does not get its own methods.** Cards, form prototypes,
résumés, job-application datasets and bio are all written with `upsert_object`
and read back semantically. Wrappers are welcome when they are *query shorthand*
over the generic endpoints (as the topic/tag helpers are); a bespoke write path
for a domain is not, because it puts that data outside prototype matching and
vector recall.

The payment wrappers (`ingest_private_payment`, `list_private_payments`,
`get_private_payment`, `lookup_private_payment`) and `personal_remember` /
`personal_recall` predate this rule. They stay for compatibility with deployed
agents — do not extend them, and do not add siblings for new domains.

Server-side canonical model:
[`docs/ONTOLOGY-PROTOTYPE-MODEL.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/ONTOLOGY-PROTOTYPE-MODEL.md)
(Layer 3c).

## API prefixes

Default `/api2.0`; pass `/api` for regression tests.

| Family | JS | Python |
|---|---|---|
| Prototypes | `prototypeApiPrefix` | `prototype_api_prefix` |
| Topics | `topicApiPrefix` | `topic_api_prefix` |
| Visual | `visualApiPrefix` | `visual_api_prefix` |


## Public API base URL

Explicit `baseUrl` → `KSG_API_URL` → `KSG_PUBLIC_API_URL` → `http://localhost:3000`.
Hosted: `KnowShowGoClient.publicApi()` / `PUBLIC_API_BASE_URL` (`https://api.knowshowgo.com`).
Server runbook: [PUBLIC-API.md](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/PUBLIC-API.md).

## Soft owner identity + tokens

`defaultOwnerUserId` / `defaultAgentSessionId` → `X-KSG-Owner` / `X-KSG-Session`.
Soft headers remain for legacy/local, and are spoofable by definition — they are
whatever the caller typed.

Hard identity is wired: `authToken` (JS) / `auth_token` (Python) sends
`Authorization: Bearer ksg_…`, and the server prefers a verified token over the
soft headers, so a token cannot be overridden by a spoofed `X-KSG-Owner`.

| Need | JS | Python |
|---|---|---|
| Send a token | `authToken`, `set_auth_token()` | `auth_token`, `set_auth_token()` |
| Mint / list / revoke | `create_api_token` · `list_api_tokens` · `revoke_api_token` | same names |
| Mint for **another** owner | `adminSecret` → `X-KSG-Admin` | `admin_secret` |
| Usage counters | `get_admin_usage()` | `get_admin_usage()` |

Two different admin mechanisms, which is easy to get wrong: the token endpoints
authenticate the admin via the **`X-KSG-Admin` header**, while `/api/admin/usage`
expects the admin secret as the **bearer**. `adminSecret` covers both.

Minting needs `KSG_API_TOKEN_SECRET` set on the server; without it the endpoint
returns 503 rather than issuing an unverifiable token.

## Environments

| Prefer | |
|---|---|
| Local KSG `dev` | `http://127.0.0.1:3000` |
| Dev/demo VM | `144.24.32.97` (often firewalled) |
| Prod | use client **`main`**, not this tip |

## Cloud

- Plain `npm install` (no server peerDependency on `dev`).
- JS tests: `node --test …` (not jest).
- Access check: `./scripts/agent-access-check.sh`.
- For live integration, start the sibling service with
  `PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start` and construct the client
  with an explicit `baseUrl` (`http://127.0.0.1:3000`). No Docker required.
- The Python client needs `requests` installed; the unit tests do not.

## Prompting

No separate prompt/handoff docs. Rules here or server CLIENT-SYNC.

## Considerations (filed)

- Client SDK health / fuzzy-ORM gap analysis: [`docs/SDK-ASSESSMENT-2026-08.md`](docs/SDK-ASSESSMENT-2026-08.md)
