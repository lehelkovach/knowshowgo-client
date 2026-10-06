# API reference

Typed wrappers over the KnowShowGo REST API. The JavaScript and Python clients
are at parity: JS uses `camelCase` option objects, Python uses `snake_case`
keyword arguments, and method names are identical. Where JS takes `obj` for an
assertion object value, Python takes `obj` too (mapped to `object` on the wire).

- JS import: `import { KnowShowGoClient } from '@lehelkovach/knowshowgo-client';`
- Python import: `from knowshowgo_client import KnowShowGoClient`

New to the model? Read [Concepts](CONCEPTS.md) first, and [Using the API](USING-THE-API.md)
for create/read/update/delete per primitive and recipes per job; this page lists
methods, it does not explain them.

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
- [Revision-pinned matching and casting](#revision-pinned-matching-and-casting)
- [Logic IR](#logic-ir)
- [Semantic memory](#semantic-memory)
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
| `defaultOwnerUserId` / `default_owner_user_id` | `null` | Owner namespace → `X-KSG-Owner` and `ownerUserId` on calls |
| `defaultAgentSessionId` / `default_agent_session_id` | `null` | Sub-scope of an owner → `X-KSG-Session` |
| `authToken` / `auth_token` (aliases `accessToken`, `apiToken`) | `null` | Bearer token → `Authorization: Bearer …`. Overrides the soft owner header; required for writes on the hosted API |
| `tokenProvider` / `token_provider` | `null` | Function returning the current token, for rotation |
| `adminSecret` / — | `null` | `X-KSG-Admin`, only for minting a token for another owner |
| `timeoutMs` / — | `30000` (env `KSG_TIMEOUT_MS`) | Per-request timeout (JS). Python uses the `requests` default |

### `KnowShowGoClient.publicApi(options)` / `public_api(**kwargs)`

Convenience for the hosted API (`https://api.knowshowgo.com`).

### `connect(options)`

Reads the release manifest and validates it.

| Option | Default | Purpose |
|---|---|---|
| `expected_channel` | none | When set, throws if `manifest.channel` differs |
| `expected_release` | none | When set, throws if `manifest.release` differs |
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
| `get_entity_properties` | `(entityId, { predicate?, entityApiPrefix? })` → ranked `{ value, confidence, contested, claims[] }` map (`/api2.0`) |
| `get_entity_types` | `(entityId, { top_k?, persist?, entityApiPrefix? })` → ranked prototype matches (fuzzy duck typing) |
| `get_entity_snapshot` / `entity` | `(entityId, …)` → `EntityProxy` (`.middleName` → winner; `.getType()` → prototypes) |
| `hydrate` | `(entityId, { topK?, threshold? })` → `KSGObject` in **one** request: synchronous members, `type()`, `typesNow()`, `explain(name)`, `cell(name)`, `claims(name)`, `isContested(name)`, `as(prototype)`. See [The duck-typed ORM](DUCK-TYPED-ORM.md) |
| `get_beliefs` | `(entityId, { predicate? })` → winner + alternatives + speakers (`belief-v0.1`) |
| `reinforce_assertion` | `{ subject, predicate, obj, speaker?, delta?, truth? }` same claim, another speaker |
| `contradict_assertion` | `{ subject, predicate, obj, speaker?, truth?, against_assertion_id? }` competing claim, prior kept |
| `retract_assertion` | `(assertionId, { speaker?, reason? })` soft delete |

```js
await client.create_assertion({ subject: 'Ada', predicate: 'is_a', obj: 'Mathematician', source: 'app' });
const snap = await client.get_snapshot('Ada');
const entity = await client.get_entity_snapshot('Ada');
entity.middleName;            // winner value
entity.claims.middleName;     // ranked claim stack
entity.prop('middle_name');   // full cell
entity.getType();             // [{ name: 'Person', score: 0.91 }, …]
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
| `search_concepts` | `(query, { top_k = 10, similarity_threshold = 0, prototype_filter? })` → results; no similarity floor by default |
| `search_property_definitions` | `(query, { top_k? })` → `[{ property, valueType, score, uuid }]` — which stored field a label names |
| `resolve_slots` | `{ labels, candidates?, floor?, top_k? }` → `{ slots: [{ label, property, score }], unresolved }`, one-to-one assignment |
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
| `list_memory_roles` | `()` → role catalog (`/api2.0/memory/roles`) |
| `instantiate_memory` | `{ role, title, … }` role-typed upsert + claims |
| `get_memory_object` | `(uuid)` object + claims + prototype lineage |
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

## Knowledge search (documents + graph)

Unified search for ingested **Document** / Idea objects plus semantic concepts
(including episodic document chunks). Canonical namespace `/api2.0` with `/api`
alias. Pass `owner_user_id` (or set `defaultOwnerUserId`) so private docs are
visible under read ACL.

| Method | Signature (JS) |
|---|---|
| `search_knowledge` | `{ query, top_k?, similarity_threshold?, categories?, include_concepts?, include_objects?, owner_user_id?, agent_session_id?, knowledgeApiPrefix? }` |

Returns `{ ok, query, count, results }` where each result has
`kind` (`concept` \| `object` \| `episode`), `score`, `uuid`, `title`,
`summary`, optional `category` / `topics` / `excerpt` / `sourceUrl`.

Python: `search_knowledge(query, top_k=10, …, knowledge_api_prefix=None)`.

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

## Revision-pinned matching and casting

Contract matching of one object **revision** against prototype **revisions**
that declare a match contract (hard constraints, soft constraints, `minScore`).
Distinct from centroid matching above. Not winner-take-all: the list returns
every decision and casting is an explicit act. Explained in
[Prototypes and casting](PROTOTYPES-AND-CASTING.md).

| Method | Signature (JS) |
|---|---|
| `evaluatePrototypeMatch` / `evaluate_prototype_match` | `{ objectRevisionUuid, prototypeRevisionUuid, contextRevisionUuid? }` → `{ decision: 'match'\|'no_match'\|'unresolved', score, hardPass, constraints[], bindings, explanation }` (cached) |
| `evaluatePrototypeMatchList` / `evaluate_prototype_match_list` | `{ objectRevisionUuid, prototypeRevisionUuids = [], limit? }` → `{ policy: 'list', wta: false, matches[] }`; empty uuid list → every prototype with a contract |
| `cast_object` / `castObject` | `{ objectRevisionUuid, prototypeRevisionUuid, requireMatch = true, title?, objectLineageKey? }` → a **new** object under that prototype with a `cast_from` edge; 409 when `requireMatch` and the decision is not `match` |
| `get_object(uuid, { match_prototypes: true, prototype_revision_uuids? })` | lazy list on read; never casts |
| `logic_ir_prototypes` / `logicIrPrototypes` | `()` → `{ Concept: uuid, Proposition: uuid, Claim: uuid, … }` for the seeded Logic IR categories, without seeding |
| `seed_logic_ir_primitives` | `()` seed them (a write; needed once on a fresh local server) |

---

## Logic IR

Shape vs truth. `infer` never reads the graph; `evaluate` reads stored claims
and answers three-valued. Explained in [Procedures and logic](PROCEDURES-AND-LOGIC.md).

| Method | Signature (JS) |
|---|---|
| `evaluateLogicInference` / `evaluate_logic_inference` | `{ premiseRevisionUuids, conclusionRevisionUuid, argumentRevisionUuid?, record? }` → `decision: 'valid'\|'invalid'\|'unresolved'`; with `record: true` also `derivation: { ok, created, derivationUuid, rule, conclusionHash }` |
| `evaluateLogicIr` / `evaluate_logic_ir` | `{ ir, bindings?, propositionRevisionUuid?, membershipPredicate?, record? }` → `{ decision, truth: 'true'\|'false'\|'unknown', atoms[], claimsConsulted[] }`; quantifiers and free variables are refused by name |
| `explainDerivation` / `explain_derivation` | `(derivationUuid)` → `{ derivation, rule: { name, engineRevision }, premises[], conclusion }` |
| `listDerivations` / `list_derivations` | `{ conclusionUuid }` → every derivation that derives that conclusion |
| `create_syllogism` / `get_syllogism` | `{ title, premises, conclusion }` simple predicate-logic DAG |

---

## Semantic memory

Natural language in, graph out: the sentence is kept as an immutable memory
event, extracted claims are linked back to it.

| Method | Signature (JS) |
|---|---|
| `semantic_remember` | `{ text, speaker = 'user', source?, session_id?, is_private = true, plan?, provenance? }` → `{ memoryId, createdEntities, resolvedEntities, ambiguousEntities, claims, changedBeliefs, warnings }`. Pass `plan` when the caller already extracted entities/claims |
| `semantic_correct` | same shape; supersedes earlier claims instead of adding beside them |
| `semantic_recall` | `{ query, top_k = 8, expand_depth = 1, similarity_threshold = 0.15 }` → `{ seeds[], hits[] }` |
| `semantic_ask` | `{ subject, predicate, object? }` or `{ pattern }` → belief state `supported \| refuted \| conflicted \| unknown` with evidence |
| `verify_answer({ claims, text?, argument?, record?, agent?, owner_user_id? })` / `verify_answer(claims, text=…, record=…)` | `POST /api2.0/verify/answer` (knowshowgo >= 0.2.23) | An answer decomposed into `{subject, predicate, object}` claims, each verdicted against stored claims: `supported`, `contradicted`, `disputed`, `competing` (stored values named), `unknown`, with evidence; a `verdict` for the answer; `record: true` keeps only what the graph did not speak against, at the `inferred` tier. Server docs: `knowshowgo/docs/TRUTH-EVAL.md`. |

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

## Market, channels, events, ratings (legacy scenario wrappers)

| Method | Purpose |
|---|---|
| `register_market_match` / `search_market_matches` | Barter/listing matches |
| `subscribe_channel` / `post_channel_message` / `get_channel_feed` | Concept-tag channels |
| `create_repeating_event` | Recurring calendar/event objects |
| `rate_entity` / `get_ratings` | Entity ratings |

---

## Private vault & payments (legacy)

Owner-scoped private storage, kept for compatibility. New private data goes
through `upsert_object` with `sensitivity` / `private` set; see
[Concepts](CONCEPTS.md). Requires an identity (`defaultOwnerUserId`).

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
| `seed_osl_agent` / `seed_openclaw_agent` / `seed_social_layer` / `seed_procedure_run_primitives` | Seed ontology prototypes on a fresh server |
| `query_graph` | `{ search: { text, topK }, traverse: { edgeTypes, depth }, match_prototypes? }` seed + traverse in one call |
| `create_api_token` / `list_api_tokens` / `revoke_api_token` | Mint (value returned once), list records, revoke by `jti` |
| `create_knode` | Legacy knode create (Python; deprecated) |

---

## Errors & identity notes

- A non-2xx response throws with the status and server error body.
- Setting `defaultOwnerUserId` scopes private reads; passing `owner_user_id` on a
  supported call overrides it for that call.
- Prefer `/api2.0` (the default). Only set `/api` prefixes to target the legacy
  alias, e.g. for regression tests.

## Using this SDK inside an agent

Give the agent one client per user (owner identity plus token), write what it
learns with `semantic_remember` / `upsert_object`, read with
`semantic_recall` / `search_knowledge` / `hydrate`, and answer direct questions
from `get_snapshot` / `semantic_ask` rather than from the model's context. Pass
the agent's name as `speaker` so every claim stays attributable. Patterns:
[Use cases](USE-CASES.md).
