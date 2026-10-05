# Using the API: one guide

*Everything in one place, in the order a developer or an AI agent needs it:
what KnowShowGo is, how the pieces fit, how to create, read, update and
delete each kind of thing, and how to use it for each job people use it for.
Written against the API as it works today; what is designed but not yet
there is listed at the end, not mixed in.*

---

## 1. What it is, from the bottom

KnowShowGo is a **knowledge graph service**. Every piece of information in it,
whether a word, a category, a person, a phone number, a sentence someone said,
a step in a procedure, or a logical conclusion, is stored as the same kind of
thing: a **node with a permanent UUID**, a version history that is never
overwritten, a record of who wrote it, an optional embedding so it can be
found by meaning, and typed edges to other nodes. Nothing is a row, a column,
or a blob inside something else. Everything is a first-class citizen of the
graph.

On top of that one kind of node, the service recognizes roles, in layers:

```text
DERIVED    claims → beliefs · propositions → derivations · procedures · episodes
INSTANCES  objects: individuals typed by a category, each property value its own node, versioned
TYPING     categories (prototypes): fuzzy, scored membership; an is_a tree rooted at Concept
CONCEPTS   named ideas and the relations between them
LEXICAL    tokens, tags, topics, aliases: every label and phrase, canonical per language
ATOM       uuid · versions · provenance · embedding · edges
```

This is why it is called neurosymbolic: the **neural** part is embeddings
and prototype matching, which find and rank things by resemblance; the
**symbolic** part is the graph of identities, claims and logic, which decides.
Resemblance proposes, structure decides, and no single number ever stands in
for both.

You talk to it over HTTPS. This package is the JavaScript and Python client.
The hosted service is `https://api.knowshowgo.com`; you can also run one
locally ([Installation](INSTALL.md)).

## 2. Identity, in two lines

Every call runs as an **owner** (`defaultOwnerUserId`), which is the
namespace private data belongs to, and on the hosted service writes need a
**bearer token** for that owner (`authToken`, from
<https://knowshowgo.com/developers>). Public concepts are shared by everyone;
private things are readable only by their owner. If you are an agent acting
for several people, use one client per person. If several agents share one
owner, pass your agent's name as `speaker` on writes so claims stay
attributable.

```js
const client = KnowShowGoClient.publicApi({ defaultOwnerUserId: 'alice', authToken: process.env.KSG_API_TOKEN });
```

```python
client = KnowShowGoClient.public_api(default_owner_user_id="alice", auth_token=os.environ["KSG_API_TOKEN"])
```

## 3. CRUD, as it works today

The rules that hold for every row of the table:

- **Create** mints a node with a UUID. Creating something that already exists
  by identity (a topic with the same label, an object with the same title and
  category, a category with the same name) returns the existing one or writes
  a new version of it; it does not duplicate.
- **Read** returns the current version by default. History is an explicit
  walk.
- **Update** never edits in place. It writes a **new version** chained to the
  previous one on the same lineage, and the old version stays readable. A
  version is a **snapshot, not a patch**: send the whole thing each time.
  An identical update is a no-op that returns the current head.
- **Delete does not exist.** There is no endpoint that removes a node. The
  nearest things are **retract** (marks a claim as withdrawn; it stops
  counting toward belief but stays in the record), **supersede** (a new
  version that no longer carries a value), and **revoke** for tokens. This is
  deliberate: provenance and audit depend on nothing disappearing.
- **Search** finds by meaning (embeddings) where the server has an embedding
  model, and by text match where it does not.

| Thing | Create | Read | Update | Delete | Search |
|---|---|---|---|---|---|
| **Concept / topic** | `create_topic({ label, aliases, summary })` | `get_topic(uuid)`, `get_concept(uuid)`, `resolve_topic_tag({ tag })` | `create_topic` again with the same label returns the same topic (`created: false`); aliases passed on that repeat are **not** added, so give a topic its aliases when you create it | none | `search_concepts(query)`, `suggest_concept_objects({ text })` |
| **Relation between concepts** | `add_association({ from_concept_uuid, to_concept_uuid, relation_type, strength })` | `get_associations(uuid, { direction })`, `query_graph({ search, traverse })` | add another | none | via `query_graph` traversal |
| **Category (prototype)** | `upsert_object_category({ name, parent_category_name, properties })`; or implicitly by naming it in `upsert_object` | `get_object_category(uuid)`, `list_object_categories()`, `search_prototypes({ query })` | `upsert_object_category` with the same name and a changed description, parent or property list → new version | none | `match_prototypes({ text })`, `get_entity_types(uuid)` |
| **Object (instance)** | `upsert_object({ title, category_name \| category_prototype_uuid, properties, tags })` | `get_object(uuid)` (deterministic envelope), `hydrate(uuid)` (duck-typed), `resolve_object({ title, category_prototype_uuid, private })` (head of a lineage), `list_objects({ category })` | `upsert_object` with the same title and category → new version; `previousObjectUuid` chains it | none; write a version without the value | `search_knowledge({ query })`, `search_concepts` (hits value concepts, walk back to the owner) |
| **Property value** | part of `upsert_object` (`properties: [{ name, type, value }]`) | `get_object(uuid).propertiesByName`, `get_entity_properties(uuid)`, `hydrate(uuid).cell(name)` | a new object version with the new value; the old value stays on the `next_value` chain | omit it from the next version | `search_concepts(value)`, `search_property_definitions(label)`, `resolve_slots({ labels, candidates })` |
| **Claim (assertion)** | `create_assertion({ subject, predicate, obj, source, truth })`; `store_fact` for verified facts | `get_assertions({ subject, predicate })`, `get_snapshot(subject)` | `reinforce_assertion` (same claim, another speaker), `contradict_assertion` (competing value; both kept) | `retract_assertion(id, { speaker, reason })`, soft | `verify(claim)` (fuzzy match against verified facts) |
| **Belief** | not created; computed | `get_beliefs(subject, { predicate })`, `explain_entity(subject)`, `get_evidence(subject)` | moves when claims are reinforced, contradicted or retracted | n/a | n/a |
| **Memory event (sentence)** | `semantic_remember({ text, speaker })` | `semantic_recall({ query })`, `semantic_ask({ subject, predicate })` | `semantic_correct({ text })` supersedes the earlier claims | none | `semantic_recall`, `search_knowledge` |
| **Procedure (DAG)** | `create_procedure({ title, steps, dependencies })`, `import_procedure_json` | `get_procedure(uuid)` | `add_procedure_step`, `put_procedure_dag(uuid, { dag_json })`, `repair_procedure_selector`, `generalize_procedure` | none | `search_procedures(query)` |
| **Proposition / logic** | a Logic IR formula passed inline, or stored as an object in the `Proposition` category | `evaluate_logic_ir({ ir })` (truth), `evaluate_logic_inference({ premiseRevisionUuids, conclusionRevisionUuid })` (shape) | a new proposition revision | none | n/a |
| **Derivation** | `record: true` on either evaluate call | `explain_derivation(uuid)`, `list_derivations({ conclusionUuid })` | never; derivations are immutable findings | none | n/a |
| **Composite** | `create_composite({ category_prototype_uuid, title, components })` | `get_composite(uuid)` | `update_composite_component(compositeUuid, componentUuid, …)` | none | n/a |
| **API token** | `create_api_token({ owner_user_id, label, ttl_days })` (value shown once) | `list_api_tokens()` (records only) | n/a | `revoke_api_token(jti)` | n/a |

Everything in the table exists in both SDKs with the same names (Python uses
`snake_case` keyword arguments). Signatures: [API reference](API.md).

## 4. The one shape to learn: an object with properties

Most work is this, so learn it once.

```js
const saved = await client.upsert_object({
  title: 'Dr. Lee',
  category_name: 'Dentist',               // created if new
  parent_category_name: 'Person',         // Dentist is_a Person
  tags: ['health'],
  properties: [
    { name: 'phone',     type: 'string',      value: '+1 555 0100' },
    { name: 'next_visit', type: 'date',       value: '2026-11-04' },
    { name: 'clinic',    type: 'concept_ref', value: clinicObjectUuid },   // points at another object
  ],
});
saved.objectUuid; saved.previousObjectUuid; saved.objectLineageKey;

const obj = await client.get_object(saved.objectUuid);   // obj.propertiesByName.phone.value
const o   = await client.hydrate(saved.objectUuid);      // o.phone, o.nextVisit, o.type(), o.explain('phone')
```

Types: `string`, `number`, `number-span`, `date`, `timespan`, `url`,
`concept_ref`. `concept_ref` is how objects nest; never put JSON inside a
value.

## 5. Recipes by job

### 5a. Memory for an assistant or agent

Write what you learn, read it back by meaning, answer direct questions from
the graph rather than from the model, and keep every claim attributable.

```text
heard a sentence        → semantic_remember({ text, speaker: 'user' })
learned a structured fact → create_assertion({ subject, predicate, obj, source })
learned about a thing   → upsert_object({ title, category_name, properties })
user corrected you      → semantic_correct({ text })  or  contradict_assertion({...})
recall by meaning       → semantic_recall({ query }) / search_knowledge({ query })
direct question         → get_snapshot(subject) / semantic_ask({ subject, predicate })
"what do we believe?"   → get_beliefs(subject, { predicate })  (winner + alternatives + speakers)
"why?"                  → explain_entity(subject, { predicate })
```

Rules an agent should follow, because the service does:

- If nothing is stored, the answer is `unknown`. Say so. Never fill the gap
  from the model.
- Pass `speaker` (your agent name) on every write when several agents share
  an owner.
- Write under the person's owner identity, not your own, so the memory is
  theirs.
- Do not store secrets as plain property values; mark `sensitivity` on the
  object and let the server redact before embedding.

Multi-agent: agents A and B with no shared context both talk to the same
owner's graph. A remembers; B asks and gets the claim with A's name on it.
Disagreement comes back as `conflicted` with both sides, not as a silent
merge.

### 5b. Application development: typed records without a schema migration

Treat a category as a lightweight schema that grows with use, and an object
as a versioned record.

```text
define a type        → upsert_object_category({ name, parent_category_name, properties })
write a record       → upsert_object({ title, category_name, properties })   (full set each time)
read for code        → hydrate(uuid)        → obj.field, obj.type(), obj.as('OtherType')
read for display     → get_object(uuid)     → propertiesByName, lineage, category
find the head        → resolve_object({ title, category_prototype_uuid, private: true })
list a type          → list_objects({ category })
link records         → a property of type concept_ref
change a type        → upsert_object_category again → new version; old objects keep working
```

What you give up compared with a relational table: in-place update, hard
delete, and range queries by SQL. Range, count and comparison are a
**structural pass** in your code over `list_objects` plus `propertiesByName`;
search by meaning and structural filtering compose in either order.

### 5c. A topic registry

Topics are concepts used to label things. Aliases make several spellings one
topic; tokens make them findable.

```text
register a topic           → create_topic({ label, aliases, summary })
resolve any spelling       → resolve_topic_tag({ tag })   → the topic, or candidates
tag an object              → tags: ['…'] on upsert_object (each tag becomes a topic concept)
find topics by meaning     → search_concepts(query)
suggest topics for a text  → suggest_concept_objects({ text })
```

A topic is never created silently by resolution; `resolve_topic_tag` only
creates when you pass `create_if_missing: true`.

### 5d. An ontology

Categories with parents, property definitions, and examples that shape them.

```text
subtype               → upsert_object_category({ name: 'Dentist', parent_category_name: 'Person' })
fields                → properties: [{ name, type, required? }] on the category
read the tree         → list_object_categories(), get_object_category(uuid)
learn from examples   → generalize_from_exemplar({ text | json_obj, threshold })
promote an instance   → generalize_object({ source_object_uuid, target_category_name })
what is this thing?   → get_entity_types(uuid) (ranked, read-only); persist: true to record it
contract membership   → evaluatePrototypeMatchList(...) then cast_object(...) (explicit, new lineage)
```

The tree always ends at `Concept`. Membership is a score, several at once;
typicality and membership are separate facts. Detail:
[Prototypes and casting](PROTOTYPES-AND-CASTING.md).

### 5e. Logic and reasoning

Claims are the data; propositions are formulas over them; derivations are the
audit trail.

```text
state facts            → create_assertion / store_fact
is this formula true?  → evaluate_logic_ir({ ir: { logicIrVersion: '0.0.1', kind: 'Predicate', predicate: { kind: 'ConceptRef', uuid }, args: [...] } })
                         → truth: 'true' | 'false' | 'unknown', with the claims consulted per atom
does this follow?      → evaluate_logic_inference({ premiseRevisionUuids, conclusionRevisionUuid })
                         → 'valid' | 'invalid' | 'unresolved'; never reads the graph
keep the proof         → add record: true; then explain_derivation(uuid), list_derivations({ conclusionUuid })
```

The predicate in a formula must be a concept the graph holds (make one with
`create_topic`); claims are joined to it by label today (see section 7).
Quantifiers are refused rather than guessed. Detail:
[Procedures and logic](PROCEDURES-AND-LOGIC.md).

### 5f. Procedures an agent can run

```text
teach           → create_procedure({ title, steps: [{ title, tool, payload, guard_text }], dependencies: [[0,1],[1,2]] })
find            → search_procedures('file my expenses')
read the DAG    → get_procedure(uuid)
repair one step → add_procedure_step / repair_procedure_selector
templatize      → generalize_procedure(uuid, { mode: 'schema_only' })
```

The service stores and finds procedures; your runner executes them, and
should record the run as an episode.

### 5g. Verification of model output

```text
cheap, fuzzy  → verify(claim) → status, confidence, matchingFact   (read matchingFact, not just status)
exact         → get_snapshot(subject)[predicate]
formal        → evaluate_logic_ir({ ir })
```

## 6. For an AI agent reading this repository

If you are an agent deciding how to use this client, the short version:

1. Construct one client per human owner with their token. Pass your own name
   as `speaker` on writes.
2. Prefer `upsert_object` for anything with fields, `create_assertion` for a
   bare fact, `semantic_remember` for a sentence you did not structure yourself.
3. Read with `hydrate` for code, `get_object` for display, `get_snapshot` or
   `semantic_ask` for a direct question, `search_knowledge` for "anything
   about X".
4. Never delete. Retract a claim, or write a new version.
5. `unknown` is an answer. Return it.
6. Everything you write is versioned and attributed; assume a human will read
   the trail.

Cheat sheet of intents to calls:

| Intent | Call |
|---|---|
| remember this sentence | `semantic_remember` |
| remember this fact | `create_assertion` |
| remember this thing with fields | `upsert_object` |
| what do we know about X | `search_knowledge`, then `get_object` / `hydrate` |
| is X true | `get_snapshot`, `semantic_ask`, `evaluate_logic_ir` |
| who said that, and who disagrees | `get_beliefs`, `explain_entity` |
| what kind of thing is this | `hydrate(uuid).type()`, `get_entity_types` |
| which field is this label | `search_property_definitions`, `resolve_slots` |
| how do I do X | `search_procedures`, `get_procedure` |
| I was wrong | `semantic_correct`, `contradict_assertion`, `retract_assertion` |

## 7. As designed versus as it works today

The docs above describe the service as it behaves on the current `dev`
branch of the server. These are the places where the design is ahead of the
implementation, so you are not surprised.

| Designed | Today | What to do |
|---|---|---|
| A claim's subject, predicate and object point at concept UUIDs | Stored as **label strings**; the concept is resolved from the label when read (`resolvedVia: 'label'` in the evaluator) | Use consistent labels; make the predicate a concept with `create_topic` before evaluating logic |
| Quantified formulas (`ForAll`, `Exists`) are evaluated over exhaustively enumerated domains | **Refused** with a diagnostic (`G001`); only ground formulas evaluate | Expand the quantifier yourself over `list_objects` and evaluate the ground cases |
| Rules as graph objects with an enabled flag; recursive evaluation to a fixpoint | Derivations are recorded one step deep; the four inference rules are fixed | Chain evaluations in your code |
| A hard delete for mistakes | None; retract, supersede, revoke | Prefer correction; it is the audit trail working |
| Search by meaning everywhere | Only where the server has an embedding model; the in-memory local server falls back to text match, and `verify` is unreliable there | Develop against the hosted API or a persistent local server for anything search-related |
| Private data invisible to other owners on every route | The entity property, belief, explain and hydrate routes do not yet apply the read ACL by owner (a UUID is enough to read) | Treat UUIDs of private objects as sensitive until that lands |
| MCP endpoint for AI hosts on the hosted API | Built and on `dev`; not yet advertised by the hosted release | Use the SDK; MCP docs follow when it ships |
| Belief has one policy | Three read-side policies exist (`snapshot`, weighted beliefs, authority-weighted explain) and can disagree by design | Use `get_beliefs` for "what is believed", `explain_entity` for "why", `get_snapshot` for "current value" |
| One upsert patches a record | A version is a **full snapshot**; a version written with only `phone` carries only `phone` | Always send the whole property set |

## 8. Where each thing is explained in depth

| Question | Page |
|---|---|
| What is it, for a stranger | [What is KnowShowGo?](WHAT-IS-KNOWSHOWGO.md) |
| Install and configure | [Installation](INSTALL.md) |
| First fifteen minutes | [Getting started](GETTING-STARTED.md) |
| The stack in code, atom to logic | [The bare bones](BASICS.md) |
| Each primitive, defined | [Concepts](CONCEPTS.md) |
| Fuzzy categories, hydrate, cast | [Prototypes and casting](PROTOTYPES-AND-CASTING.md) |
| DAGs and Logic IR | [Procedures and logic](PROCEDURES-AND-LOGIC.md) |
| Eleven use cases | [Use cases](USE-CASES.md) |
| Every method and signature | [API reference](API.md) |
