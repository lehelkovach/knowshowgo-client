# API reference

Typed wrappers over the KnowShowGo REST API. The JavaScript and Python clients
are at parity: JS uses `camelCase` option objects, Python uses `snake_case`
keyword arguments, and method names are identical. Where JS takes `obj` for an
assertion object value, Python takes `obj` too (mapped to `object` on the wire).

- JS import: `import { KnowShowGoClient } from '@lehelkovach/knowshowgo-client';`
- Python import: `from client import KnowShowGoClient`

All methods return the parsed JSON response (JS: a `Promise`). Errors throw with
the HTTP status and server message.

## Contents

- [Construction & connection](#construction--connection)
- [Health & release](#health--release)
- [Assertions & entities](#assertions--entities)
- [Facts (verification helpers)](#facts-verification-helpers)
- [Concepts & associations](#concepts--associations)
- [Topics & tags](#topics--tags)
- [Objects & object categories](#objects--object-categories)
- [Concept objects](#concept-objects)
- [Composites](#composites)
- [Prototypes (centroid theory)](#prototypes-centroid-theory)
- [Procedures](#procedures)
- [Logic, market, channels, events, ratings](#logic-market-channels-events-ratings)
- [Private vault & payments](#private-vault--payments)
- [Seeding & graph query](#seeding--graph-query)

---

## Construction & connection

### `new KnowShowGoClient(options)`

| Option (JS / Python) | Default | Purpose |
|---|---|---|
| `baseUrl` / `base_url` | env or `http://localhost:3000` | Service URL |
| `fetchImpl` / — | global `fetch` | Inject a fetch mock (JS) |
| `prototypeApiPrefix` / `prototype_api_prefix` | `/api2.0` | Prefix for prototype endpoints |
| `topicApiPrefix` / `topic_api_prefix` | `/api2.0` | Prefix for topic endpoints |
| `auto_connect` | `false` | Call `connect()` on construction (JS) |
| `defaultOwnerUserId` / `default_owner_user_id` | `null` | Soft identity → `X-KSG-Owner` |
| `defaultAgentSessionId` / `default_agent_session_id` | `null` | Soft identity → `X-KSG-Session` |

### `KnowShowGoClient.publicApi(options)` / `public_api(**kwargs)`

Convenience for the hosted API (`https://api.knowshowgo.com`).

### `connect(options)`

Reads the release manifest and validates it.

| Option | Default | Purpose |
|---|---|---|
| `expected_channel` | `'release'` | Throws if `manifest.channel` differs |
| `expected_release` | `'v0.2.7'` | Throws if `manifest.release` differs |
| `enforce_contract` | `false` | Restrict calls to `surfaces.clientContract` paths |
| `adopt_advertised_base_url` | `false` | Re-point `baseUrl` to `manifest.api.publicBaseUrl` |

Exported constants: `PUBLIC_API_BASE_URL`, `LOCAL_API_BASE_URL`, and the helper
`resolveBaseUrl(explicit)` (JS).

---

## Health & release

| Method | Purpose |
|---|---|
| `health_check()` | Liveness + build metadata (`GET /health`) |
| `get_release_manifest()` | Full release manifest (`GET /api/release`) |

---

## Assertions & entities

The append-only truth layer: subject-predicate-object claims with provenance,
resolved into current snapshots.

| Method | Signature (JS) |
|---|---|
| `create_assertion` | `{ subject, predicate, obj, source?, confidence?, ... }` |
| `get_assertions` | `{ subject?, predicate?, obj? }` |
| `vote_assertion` | `(assertionId, { delta = 1 })` |
| `get_snapshot` | `(entityId)` |
| `get_evidence` | `(entityId, { predicate? })` |
| `explain_entity` | `(entityId, { predicate? })` |

```js
await client.create_assertion({ subject: 'Ada', predicate: 'is_a', obj: 'Mathematician', source: 'app' });
const snap = await client.get_snapshot('Ada');
```

---

## Facts (verification helpers)

Higher-level helpers over assertions for claim verification.

| Method | Signature (JS) |
|---|---|
| `store_fact` | `{ subject, predicate, obj, status?, confidence?, source? }` |
| `store_facts_bulk` | `(facts[])` — array of objects or `[s, p, o]` tuples |
| `verify` | `(claim, { threshold = 0.7 })` → adds `verified` boolean |
| `get_fact_stats` | `()` |
| `add_verified_fact` | `{ subject, predicate, obj, sources? }` (alias) |
| `check` | `(claim)` (alias for `verify`) |

---

## Concepts & associations

Legacy semantic nodes and edges (prefer objects/topics for new work, but fully
supported).

| Method | Signature (JS) |
|---|---|
| `create_concept` | `{ name, ... }` |
| `get_concept` | `(uuid)` |
| `search_concepts` | `(query, { top_k = 5 })` |
| `add_association` | `{ from_concept_uuid, to_concept_uuid, relation_type, strength? }` |
| `get_associations` | `(uuid, { direction = 'both' })` |
| `create_node_with_document` | `{ ... }` |
| `update_node_embedding` | `(uuid)` |

---

## Topics & tags

Canonical subjects addressed by phrase tags.

| Method | Signature (JS) |
|---|---|
| `create_topic` | `{ label?, phrase?, summary?, aliases?, kind?, language?, provenance? }` |
| `get_topic` | `(uuid)` |
| `resolve_topic_tag` | `{ tag?, phrase?, language?, top_k?, create_if_missing? }` |
| `resolve_tag` | alias of `resolve_topic_tag` |

---

## Objects & object categories

Schema-typed objects (instances) and their category prototypes.

| Method | Signature (JS) |
|---|---|
| `create_object_category` | `{ ... }` schema-backed category |
| `upsert_object_category` | `{ ... }` versioned upsert with lineage |
| `get_object_category` | `(uuid)` |
| `list_object_categories` | `()` |
| `upsert_object` | `{ ... }` create/update instance with assertion-backed props |
| `get_object` | `(uuid, { owner_user_id?, agent_session_id? })` |
| `list_objects` | `{ category?, limit?, owner_user_id?, agent_session_id? }` |
| `resolve_object` | `{ ... }` resolve by tag, title, or embedding |
| `generalize_object` | `{ ... }` promote a concrete object to a prototype |

Owner/session args on `get_object`/`list_objects` override the client defaults
per call, so you can read another namespace's public data explicitly.

---

## Concept objects

Smart tag/concept suggestion and search.

| Method | Signature (JS) |
|---|---|
| `suggest_concept_objects` | `{ text?, query?, context?, top_k?, create_tag_if_missing? }` |
| `search_concept_objects` | `{ query?, text?, context?, top_k? }` |
| `suggest_concept_object_prototypes` | `{ label?, properties, context?, category_prototype_uuids?, top_k? }` |
| `suggest_prototypes` | alias |

---

## Composites

Objects composed of component objects with versioned component assertions.

| Method | Signature (JS) |
|---|---|
| `create_composite` | `{ category_prototype_uuid, title, summary?, tags?, properties?, components?, provenance? }` |
| `get_composite` | `(uuid)` |
| `update_composite_component` | `(compositeUuid, componentUuid, { title?, summary?, tags?, properties?, provenance? })` |

---

## Prototypes (centroid theory)

A category is a centroid embedding plus graded exemplars. This is a **server**
feature; the client exposes the endpoints.

| Method | Signature (JS) |
|---|---|
| `generalize_from_exemplar` | `{ ... }` create prototype from an exemplar |
| `match_prototypes` | `{ text?, embedding?, top_k?, threshold? }` |
| `search_prototypes` | `{ query?, top_k? }` label autocomplete |
| `attach_exemplar` | `(prototypeUuid, conceptUuid)` |
| `create_prototype` | `{ ... }` (legacy create) |
| `get_prototype` | `(uuid)` |
| `register_prototype` | `(prototypeName, options)` |
| `create_instance` | `(prototypeName, properties)` |
| `get_instance` | `(prototypeName, uuid)` |

---

## Procedures

Executable workflow DAGs with steps, dependencies, and selector repair.

| Method | Signature (JS) |
|---|---|
| `create_procedure` | `{ title, description?, steps?, dependencies?, guards?, extra_props? }` |
| `get_procedure` | `(uuid)` — compiles and returns the DAG |
| `add_procedure_step` | `(procedureUuid, { ... })` |
| `generalize_procedure` | `(procedureUuid, { title, description?, mode?, provenance? })` |
| `repair_procedure_selector` | `(procedureUuid, { ... })` |
| `repair_selector` | alias |
| `search_procedures` | `(query, { top_k = 5 })` |
| `import_procedure_json` | `{ procedure, form_element_category_prototype_uuid?, provenance? }` |

---

## Logic, market, channels, events, ratings

| Method | Purpose |
|---|---|
| `create_syllogism` / `get_syllogism` | Predicate-logic DAGs |
| `register_market_match` / `search_market_matches` | Barter/listing matches |
| `subscribe_channel` / `post_channel_message` / `get_channel_feed` | Concept-tag channels |
| `create_repeating_event` | Recurring calendar/event objects |
| `rate_entity` / `get_ratings` | Entity ratings |

---

## Private vault & payments

Owner-scoped private storage. Requires an identity (`defaultOwnerUserId`).

| Method | Purpose |
|---|---|
| `create_vault` | Create a private vault |
| `personal_remember` / `personal_recall` | Store / recall private facts |
| `ingest_private_payment` | Store a private payment record |
| `list_private_payments` / `get_private_payment` / `lookup_private_payment` | Read private payments |

---

## Seeding & graph query

| Method | Purpose |
|---|---|
| `seed_osl_agent` / `seed_openclaw_agent` | Seed ontology prototypes |
| `query_graph` | Structured graph query |
| `create_knode` | Legacy knode create (Python; deprecated) |

---

## Errors & identity notes

- A non-2xx response throws with the status and server error body.
- Setting `defaultOwnerUserId` scopes private reads; passing `owner_user_id` on a
  supported call overrides it for that call.
- Prefer `/api2.0` (the default). Only set `/api` prefixes to target the legacy
  alias, e.g. for regression tests.

## Using this SDK inside an agent

The OpenClaw agent ([`osl-oc-agent`](https://github.com/lehelkovach/osl-oc-agent))
wraps this SDK as its durable-memory skill (`memory.*`, `profile.*`, `dataset.*`,
`procedure.*` tools). If you are building an agent, that skill is a working
reference: [`docs/KSG-SKILL.md`](https://github.com/lehelkovach/osl-oc-agent/blob/main/docs/KSG-SKILL.md).
