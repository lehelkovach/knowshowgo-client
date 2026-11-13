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

- [Construction & connection](#construction--connection) (and [tokens per owner](#tokens-per-owner-kt1))
- [Health & release](#health--release)
- [Assertions & entities](#assertions--entities)
- [Facts (verification helpers)](#facts-verification-helpers)
- [Concepts & associations](#concepts--associations)
- [Topics & tags](#topics--tags)
- [Objects & object categories](#objects--object-categories)
- [Concept objects](#concept-objects)
- [Composites](#composites)
- [Prototypes (centroid theory)](#prototypes-centroid-theory)
- [Propositions, typed values and articles](#propositions-typed-values-and-articles-kg-p1-ce3d-tb2)
- [Revision-pinned matching and casting](#revision-pinned-matching-and-casting)
- [Logic IR](#logic-ir)
- [Events & episodes](#events--episodes)
- [Semantic memory](#semantic-memory)
- [Procedures](#procedures)
- [Knowledge packs (PK1)](#knowledge-packs-pk1)
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

### Tokens per owner (KT1)

With the server's access gate enforcing, every `/api*` call except `/release`
and `/auth/tokens` needs a bearer token; an anonymous call gets **401**
(`err.status === 401`). Never retry anonymously: get or rotate a token.

| Method | Signature (JS) |
|---|---|
| `set_auth_token` | `(token)` swap the token on this client (after minting or rotating one) |
| `for_owner` | `({ auth_token?, owner_user_id?, agent_session_id? })` → a view of this client that sends that owner's token and id on **every** method; the parent client is unchanged. One process, many owners: `client.for_owner({ auth_token: tokenFor('avery') }).search_procedures('order lunch')`. Without `auth_token` the view keeps the parent's token |

---

## Health & release

| Method | Purpose |
|---|---|
| `health_check()` | Liveness + build metadata (`GET /health`) |
| `get_release_manifest()` | Full release manifest (`GET /api/release`) |

`manifest.capabilities` (server with CS1) lists the capability and feature ids
the server has; this client carries the same list with routes, methods and
when-to-use text in [`js/capabilities.json`](../js/capabilities.json). The
capability-by-capability guide is [What KnowShowGo can do](../README.md#what-knowshowgo-can-do).

---

## Assertions & entities

The append-only truth layer: subject-predicate-object claims with provenance,
resolved into current snapshots.

| Method | Signature (JS) |
|---|---|
| `create_assertion` | `{ subject, predicate, obj, source?, truth?, provenance?, security_class?, ... }`. `security_class: 'private'` (alias `scope`) stores the claim under the caller's owner identity so only that owner reads it back (server ≥ 0.2.35); sent only when given |
| `get_assertions` | `{ subject?, predicate?, obj?, uuid?, why? }`; `why: true` adds each claim's `why` block (WHY1) |
| `explain_claim` | `(claimUuid)` → the claim with `why`: `sources` (tier, speaker, document/model), `versions`, `contested`, `inference`, `status: { state, stored, reason }`; null when absent or another owner's private claim (WHY1 / KSG-1) |
| `list_contradictions` | `({ visibility?: 'private'\|'public', limit? })` → `{ contradictions: [{ id, subject, predicate, visibility, openedAt, sides[] }], total, truncated }`; resolve with `confirm_fact` / `correct_fact` on a side (WHY1 / KSG-2) |
| `vote_assertion` | `(assertionId, { delta = 1 })` |
| `get_snapshot` | `(entityId)` |
| `get_evidence` | `(entityId, { predicate? })` |
| `explain_entity` | `(entityId, { predicate? })` |
| `get_entity_properties` | `(entityId, { predicate?, entityApiPrefix? })` → ranked `{ value, confidence, contested, claims[] }` map (`/api2.0`) |
| `get_entity_types` | `(entityId, { top_k?, persist?, entityApiPrefix? })` → ranked prototype matches (fuzzy duck typing) |
| `get_entity_snapshot` / `entity` | `(entityId, …)` → `EntityProxy` (`.middleName` → winner; `.getType()` → prototypes) |
| `hydrate_entity` | `(entityId, { top_k?, threshold? })` the raw one-trip payload that `hydrate()` wraps |
| `hydrate` | `(entityId, { topK?, threshold? })` → `KSGObject` in **one** request: synchronous members, `type()`, `typesNow()`, `explain(name)`, `cell(name)`, `claims(name)`, `isContested(name)`, `as(prototype)`. See [The duck-typed ORM](DUCK-TYPED-ORM.md) |
| `get_beliefs` | `(entityId, { predicate? })` → winner + alternatives + speakers (`belief-v0.1`) |
| `reinforce_assertion` | `{ subject, predicate, obj, speaker?, delta?, truth?, security_class? }` same claim, another speaker; a private reinforce bumps the caller's own private claim, never another owner's |
| `contradict_assertion` | `{ subject, predicate, obj, speaker?, truth?, against_assertion_id?, security_class? }` competing claim, prior kept |
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

Verified facts (server: `src/verified_memory/service.js`): status `candidate | confirmed` with
provenance; reads return confirmed facts unless `include` asks for more; a
correction keeps the old fact as `corrected`. Python takes the same names as
keyword arguments (`add_fact(subject, predicate, obj, ...)`).

| Method | Signature (JS) |
|---|---|
| `add_fact` | `{ subject, predicate, obj, status = 'candidate', provenance?, visibility?, confidence? }` → `POST /api2.0/facts` → `{ ok, fact }` |
| `list_facts` | `{ subject?, predicate?, include?, limit? }` → `{ ok, facts, total, truncated, include }`; no subject lists the caller's own |
| `get_fact` | `(factId)` → `{ ok, fact }` with provenance and history |
| `confirm_fact` | `(factId, { by?, provenance? })` → `{ ok, fact }`; 409 when the fact was corrected, 403 when not the owner. On a contested claim (KSG-2): `{ ok, fact, resolution }`, a new version keeping this side supersedes every side |
| `correct_fact` | `(factId, { obj, provenance? })` → `{ ok, fact, corrected }`. On a contested claim (KSG-2) also `resolution`: the new value supersedes every side |

---

## Concepts & associations

Legacy semantic nodes and edges (prefer objects/topics for new work, but fully
supported).

| Method | Signature (JS) |
|---|---|
| `create_concept` | `{ name, ... }` |
| `get_concept` | `(uuid)` |
| `search_concepts` | `(query, { top_k = 10, similarity_threshold = 0, prototype_filter?, scope?, props?, kind? })` → results; no similarity floor by default. `scope: 'owner'` scans only the caller's own nodes (server ≥ 0.2.29); `props: { last4: '1005' }` is exact equality on named props |
| `search_property_definitions` | `(query, { top_k? })` → `[{ property, valueType, score, uuid }]` — which stored field a label names |
| `resolve_slots` | `{ labels, candidates?, floor?, top_k? }` → `{ slots: [{ label, property, score }], unresolved }`, one-to-one assignment |
| `add_association` | `{ from_concept_uuid, to_concept_uuid, relation_type, strength? }` |
| `get_associations` | `(uuid, { direction = 'both' })` |
| `create_node_with_document` | `{ ... }` |
| `update_node_embedding` | `(uuid)` |
| `resolve_concept` | `{ label, ...options }` → the preferred concept (and the caller's personal one) without creating anything. Options go to the server camelCased (`prototype_name` → `prototypeName`) |
| `find_or_create_concept` | `{ label, ...options }` the identity path: the existing concept for this label, or a new one |
| `merge_concepts` | `{ survivor, members, score?, reason? }` merge duplicates into a survivor; reversible |
| `unmerge_concept` | `(uuid, { reason? })` take one member back out of a merge |
| `get_concept_variants` | `(uuid)` → the concepts merged into this one |

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
| `resolve_object` | `{ object_lineage_key \| title, category_prototype_uuid, private, evidence }` head of a lineage; a title shared by several objects is `409 ambiguous` with candidates unless `evidence` (`{ property: value }`) picks one |
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
| `match_prototypes` | `{ text?, embedding?, object?, top_k?, threshold?, evidence? }`. With `object` (`{ label, properties }`) each match carries `typicality` (cosine to the centroid), `evidence` (`matched`, `extra`, `missing`, `overlap`, `isA` lineage from the taxonomy) and `rankScore` (score blended with property overlap, weight `PROPERTY_OVERLAP_WEIGHT` = 0.3), and the list is ordered by it |
| `get_taxonomy` | `{ root? }` TX1 prototype tree (default Thing) |
| `get_taxonomy_prototype` | `(uuid)` one prototype: centroid, own + inherited properties, exemplars, instances |
| `get_taxonomy_node` | `(uuid, { history? })` one node: prototypes with typicality, propositions with provenance |
| `lookup_concept` | `{ term, context?, entity_type?, force? }` CE3 public lookup (Wikidata, Wikipedia, Wiktionary) |
| `get_inferred_proposition_stats` | `()` CE3d counters: proposed, reused, refused, confirmed, contradicted |
| `check_membership` | `{ subject, category, candidate_threshold? }` yes/no category membership **with evidence** (the edge, chain or claim). Typicality is not membership: a penguin is a bird at low typicality |
| `assimilate_exemplar` | `{ subject, category }` add a confirmed member to a category's exemplars (moves the centroid, never the definition) |
| `get_taxonomy_duplicates` | `()` DH1: public prototype names with more than one active prototype. Duplicates are superseded (`replacedBy`), never deleted |

---

## Propositions, typed values and articles (KG-P1, CE3d, TB2)

A claim is a proposition over three concept uuids (subject, predicate, object or
a typed value), with a provenance tier. A model inference is a **proposal**
(`source: 'llm:…'`, tier `inferred`): it stays a candidate until a public source
confirms it. Values are typed from a closed list; a topic reads as an article
whose values are versioned, not overwritten.

| Method | Signature (JS) |
|---|---|
| `ensure_predicate` | `{ name, create? }` the predicate concept for a name (created unless `create: false`) |
| `assert_proposition` | `{ subject \| subject_uuid, subject_prototype?, predicate \| predicate_uuid, object \| object_uuid \| value, value_prototype?, truth?, source?, provenance?, replace?, security_class \| scope? }` → `{ claim }` |
| `reconcile_inferred_propositions` | `{ label }` CE3d: proposals about a public name compared with higher-tier claims; matches promoted, single-valued disagreements contradicted |
| `list_value_types` | `()` → `{ valueTypes, externalIdSchemes }`: url, uuid ref to another concept, number, date, time, … |
| `search_predicates` | `{ query?, limit? }` declared properties with value type, cardinality and range |
| `declare_predicate` | `{ name, value_type, cardinality?, range?, options?, description?, attach_to? }` an existing name is returned (200), a new one created (201); `attach_to` proposes it to a prototype as a candidate field |
| `get_prototype_fields` | `(uuid)` a prototype's own and inherited properties (the create form) |
| `search_articles` | `{ query?, range?, limit? }` topics by title, optionally within prototype names |
| `get_article` | `(uuid)` lead, fields from prototypes and claims, the current value and every other version with its provenance |
| `create_article` | `{ prototype_uuid, title, description?, fields?, private?, allow_duplicate?, source_url?, source_title?, note? }` needs a signed-in owner (401 otherwise) |
| `amend_article` | `(uuid, { predicate, value_type?, value \| object_uuid, unit?, lang?, precision?, scheme?, replaces_claim?, source_url?, source_title?, note? })` one typed claim; `replaces_claim` makes it the next version (the old one stays readable). A wrong type is refused with 422 |
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
| `bind_pattern` | `{ pattern, limit?, describe? }` a conjunction of `{ subject, predicate, object }` triples with `?variables` over stored claims → bindings. **Prefer this over free-text search for relational questions** ("who works at Contoso") |
| `close_relation` | `{ predicate, as?, include_alleged?, max_facts?, max_rounds?, edge_limit? }` transitive closure (part_of, subclass_of, located_in) with a derivation per inferred edge |
| `evaluate_joins` | `{ rules, include_alleged?, max_facts?, max_rounds?, edge_limit? }` join rules across two relations, to a fixpoint |
| `get_derivation` | `(uuid)` one recorded derivation, explained |
| `get_derivation_tree` | `(uuid, { max_depth? })` the proof tree under a derivation, premise by premise |

Rules (KG3 / KG5 / KG21) are graph objects; every change is a new version and
every derivation names the rule version it used. Refusals carry `err.body.code`
(`R001` bad input, `R002` disabled → 409, `R003` not found → 404).

| Method | Signature (JS) |
|---|---|
| `create_rule` | `{ name, ir, description?, enabled?, provenance? }` → `{ ok, ruleUuid, version, reused, revision, enabled, name, domain, variable }` |
| `list_rules` | `()` → `{ ok, rulesRevision, rules }` (current version of each) |
| `get_rule` | `(ruleUuid)` → `{ ok, rule, versions }` |
| `set_rule_enabled` | `(ruleUuid, enabled: boolean)` → new version, or `unchanged: true` |
| `check_rules` | `{ rule_uuids, members, record?, provenance? }`; a member is a subject or `{ subject, facts }` → `{ ok, rules, disabled, members: [{ member, truth, clauses, failing, missing, derivationUuid }], factsWritten }` |
| `apply_rule` | `(ruleUuid, { domain_limit? })` → `{ ok, rule, domain, fired, skipped, conflicts, complete }` |
| `saturate_rules` | `{ rule_uuids?, max_rounds?, max_facts?, domain_limit? }` → fixpoint over the enabled (or named) rules |

---

## Events & episodes

Events are an action concept plus typed roles (`agent`, `patient`,
`beneficiary`, `instrument`, `location`, `threat`), each a concept uuid the
graph already has (KG10). Episodes group events; recall walks a structural
pattern to the episodes and says why (KG13).

| Method | Signature (JS) |
|---|---|
| `record_event` | `{ action, roles, title?, observed_at?, episode?, provenance?, private? }` → `{ ok, event, created, reused, lineageKey, episode? }`; an unresolved role is a 422 with `err.body.unresolved` |
| `find_events` | `{ action?, agent?, patient?, beneficiary?, instrument?, location?, threat?, limit? }` (at least one role) → `{ ok, events, count, complete, walked }` |
| `get_event` / `get_episode` | `(uuid)` → `{ ok, event }` / `{ ok, episode }` |
| `recall_episodes` | `{ pattern, event_variable?, limit? }` → `{ ok, episodes: [{ episode, matches, ranking }], events, count, complete }` |

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
| `verify_answer` | `{ claims:[{subject, predicate, object}], text?, argument?, record?, agent? }` (Python: `verify_answer(claims, text=…, record=…)`) → `POST /api2.0/verify/answer` (knowshowgo >= 0.2.23): a status per claim, `supported \| contradicted \| disputed \| competing` (stored values named) `\| unknown`, with evidence, plus a `verdict` for the answer; `record: true` keeps only what the graph did not speak against, at the `inferred` tier. Server docs: `knowshowgo/docs/TRUTH-EVAL.md` |
| `ground` | `{ claim:{subject, predicate, object} }` or `{ term, role? }`, `mentions?` (Python: `ground(claim=…)` / `ground(term=…, role=…)`) → `POST /api2.0/ground` (knowshowgo >= 0.2.24): per term `resolved` (uuid, `definedness`) `\| ambiguous` (`candidates[]`, ask which) `\| undefined` (nothing created) `\| literal`; the predicate in canonical form. Server docs: `knowshowgo/docs/CLAIM-GROUNDING.md` |

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
| `put_procedure_dag` | `(uuid, { dag_json, rematerialize = true, provenance? })` replace a procedure's step graph |
| `list_procedures` | `({ limit = 100 })` every procedure the caller may read, newest first: `{ procedures, total, truncated }`. A complete listing, unlike `search_procedures` |
| `search_procedures` | `(query, { top_k = 5, include = 'verified' })` by meaning. Only verified (replayable) procedures unless `include` is `'drafts'`, `'retired'`, `'all'` or a list; each hit carries `status` (KSG-L1, server ≥ the release that ships it) |
| `import_procedure_json` | `{ procedure, form_element_category_prototype_uuid?, provenance? }` |
| `record_procedure_run` | `(procedureUuid, { ok, verified_by?: 'page'\|'person'\|'tool'\|'oracle'\|'email'\|'api', failure?, site?, evidence?, version_uuid?, version?, held_out? })` → `{ ok, run, status, state, previousStatus, retired, revived, procedure }`. `state` is the IR-S1 state (`candidate \| validated \| promoted \| retired`). `version_uuid` / `version` name the version that ran (default: the current one; another procedure's version is a 400); `held_out: true` marks a held-out validation case. Owner only |
| `list_procedure_runs` | `(procedureUuid)` → `{ procedureId, status, state, currentVersion: { uuid, version, state, stateBasis } \| null, lifecycle, runs }`, read from `GET /procedures/:uuid` (the server has no separate runs route) |
| `get_procedure_evaluation` | `(procedureUuid)` → `GET /procedures/:uuid/evaluation`: per version (newest first) `stats` (runs, verifiedSuccesses from oracle/email/api/person only, failures, successRate, Wilson 95% `interval`), `regression` against the previous version (one-sided Fisher exact, flagged at p < 0.05; `tested: false` when either side has no runs), `state`, `stateBasis`; plus `procedure`, `unattributed`, `method` |
| `search_verified_procedures` | `({ goal?, site?, include?, limit? })` → `GET /procedures/search`: semantic on goal, exact on site, verified only unless `include`; each result carries `status`, `state` and `currentVersion` |
| `create_procedure_version` | `(procedureUuid, { status?, implementation?, requires?, provides?, provenance? })` → `{ ok, procedureVersion, capabilityResolution }` |
| `list_procedure_versions` | `(procedureUuid)` → `{ ok, procedureId, count, latest, versions }` |
| `get_procedure_version_by_number` | `(procedureUuid, version)` → `{ ok, procedureVersion }` |
| `get_procedure_version` | `(versionUuid)` → `{ ok, procedureVersion }` with `statusHistory` |
| `transition_procedure_version` | `(versionUuid, { status, reason?, provenance? })` → `{ ok, procedureVersion, transition }`; 409 out of `deprecated` or to the same status |

Every version read carries `state` (`candidate \| validated \| promoted \|
retired`), computed from the runs of that version, with `stateBasis`
(`runs \| superseded \| status`), `statusAsState`, `lifecycle` and
`statusDeprecated: true`; `list_procedure_versions` adds `unattributedRuns`.
The hand-set `status` (`draft`, `dogfood`, `tested`, `validated`, `stable`,
`degraded`, `deprecated`) is still returned and writable; it now decides only a
retirement by hand. `search_procedures` hits also carry `currentVersion`.

---

## Knowledge packs (PK1)

A pack is one `ksg-pack/1` file: a versioned bundle of prototypes, procedures
and facts with a name, a license, a source and provenance on every item.
Format and rules: knowshowgo `docs/KNOWLEDGE-PACKS.md`. **Needs a KnowShowGo
server newer than 0.2.59** (the routes are on server `dev`, not in a release
yet); an older server answers 404.

| Method | Signature (JS) |
|---|---|
| `export_pack` | `{ name, version, license, prototypes?: [uuid \| name], procedures?: [id], facts?: [id], description?, source?: { publisher?, url?, attribution? }, include_private = false }` (Python: `export_pack(name, version, license, prototypes=…, procedures=…, facts=…, include_private=False)`) → `POST /api2.0/packs/export` → `{ ok, pack, summary: { counts, private, redactions, digest } }`. Read-only. `name`, semver `version` and `license` are required; there is no default license |
| `install_pack` | `(pack, { dry_run = false })` (Python: `install_pack(pack, dry_run=False)`); `pack` is the object or its JSON text → `POST /api2.0/packs/install` → `{ ok, dryRun, pack, previous, counts, prototypes, procedures, facts, superseded, kept, warnings, redactions }`. Needs an owner token (401 without) |

**Private items are an explicit opt-in.** `include_private` is off by default.
With it off, an export that names one of your own private items is refused
(400, the items listed under `private`). Only the literal `true` / `True`
sends the opt-in; pass it only when the owner has said those items may leave
their scope. Another owner's private item is never exportable: it answers the
same 404 as a missing id, and one such item fails the whole export.

**A pack grants no trust.** After `install_pack`:

- procedures are the caller's private candidates with no runs (`status: draft`,
  `state: candidate`); `search_verified_procedures` does not return them until
  a verified run is recorded here with `record_procedure_run`;
- facts are third-party candidates; what the pack stated is kept under
  `provenance.statedStatus`, `statedTier` and `stated`; only `confirm_fact`
  makes one confirmed;
- missing prototypes are created and existing ones reused unchanged;
- the same pack again changes nothing; a newer version supersedes what it
  replaces and deletes nothing, and keeps what the owner has run or confirmed;
  the same version with other contents, or an older version, is 409.

Run `install_pack(pack, { dry_run: true })` first: it returns the same plan and
writes nothing. Secret-shaped values are redacted on export and again on
install; that is a net, not a proof, so read a pack before publishing it.

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
