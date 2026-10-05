# Concepts: the primitives

*What KnowShowGo stores, what each thing is for, and which client calls touch
it. Service-level: this describes the model the API exposes, not how the
server implements it.*

If you have not read [What is KnowShowGo?](WHAT-IS-KNOWSHOWGO.md), start
there. This page assumes you know why the model is built the way it is and
wants to know what the pieces are.

---

## The one rule, and the strata it produces

**Everything is a ConceptObject.** A person, a category, a property value, a
claim, a procedure step, a conversation turn, a logical derivation: all of them
are nodes of the same kind, each with

- a permanent **UUID**,
- a **version history** (new versions supersede old ones; nothing is overwritten),
- **provenance** (who wrote it, when, from what),
- optionally an **embedding** (a vector that lets it be found by meaning),
- **edges** to other nodes, each edge typed by a relation.

The primitives below are not different storage types. They are *roles* the
same node can play, and the roles stack. Facts and logic are near the top of
the stack, not the bottom; they are patterns over concepts, which is why they
inherit identity, history and provenance without any machinery of their own.

```text
 DERIVED     logic: propositions, derivations        procedures: steps + next edges
             claims  ──►  beliefs (a view)           episodes, memory events, composites
             ─────────────────────────────────────────────────────────────────────────
 INSTANCES   objects  (instance_of a category; every value its own concept; versioned by lineage)
 TYPING      prototypes / categories  (is_a tree rooted at Concept; property definitions)
 CONCEPTS    concepts and associations  (the vocabulary; the graph)
 LEXICAL     tokens, tags, topics, aliases  (every label and phrase, canonical per language)
 ATOM        node + uuid + versions + provenance + embedding + typed edges
```

Read bottom up for how the system is built; read top down for how an
application uses it. The shortest code path through all of it is
[The bare bones](BASICS.md).

---

## Stratum 0: the lexical layer — tokens, tags, topics

Any text that enters is **tokenized**: a title, a tag, a phrase, an alias
becomes word and phrase **tag concepts**, canonical per language (one node for
`phrase:und:dental care`, however it was spelled), linked to whatever carried
the text. This is the layer the Token Viewer is named for, and it is what
search by meaning and topic resolution stand on. A **topic** is a tag concept
used to label other things. An **alias** is another surface form of the same
node, which is how "dental care" resolves to the topic "dentistry".

| Do | Client |
|---|---|
| Create a topic with aliases | `create_topic({ label, aliases, summary })` |
| Resolve a surface form to its topic | `resolve_topic_tag({ tag })` |
| Read one | `get_topic(uuid)` |

Tokens are created for you on every object write; you rarely make one by hand.

---

## Stratum 1: Concept

The most general thing: a named idea with an identity. "Mathematician",
"protect", "billing city". Concepts are the vocabulary everything else is
expressed in. Two spellings or synonyms of one idea resolve to one concept;
a concept can carry aliases.

| Do | Client |
|---|---|
| Find concepts by meaning | `search_concepts(query, { top_k })` |
| Read one | `get_concept(uuid)` |
| Link two concepts | `add_association({ from_concept_uuid, to_concept_uuid, relation_type })` |
| Walk links | `get_associations(uuid, { direction })` |
| Suggest concepts for a text | `suggest_concept_objects({ text })` |

A topic (stratum 0) is a concept too; the same identity rule applies, so "ML"
and "machine learning" can be one topic.

## Stratum 2: Category (prototype)

A **kind of thing**: Person, Dentist, Invoice, Proposition. In most systems a
type is a rigid definition. In KnowShowGo a category is a **prototype**: a
center of gravity in meaning-space plus the examples that formed it. Things
*match* a prototype with a score; a thing can match several; typical and
atypical members are both members.

Categories form an **`is_a` tree** rooted at `Concept`. Naming a parent when
you create a category makes it a subtype: `Dentist is_a Person`. Subtypes
inherit their parent's property definitions.

A category can declare **property definitions** (its fields) and, for the
revision-pinned matcher, a **match contract**: hard constraints that must hold,
soft constraints that are scored, and a minimum score.

| Do | Client |
|---|---|
| Create or version a category | `upsert_object_category({ name, parent_category_name, properties, ... })` |
| Create implicitly | name it in `upsert_object({ category_name, parent_category_name })` |
| List / read | `list_object_categories()`, `get_object_category(uuid)` |
| Learn a category from an example | `generalize_from_exemplar({ text | json_obj, threshold })` |
| Promote a concrete object to a category | `generalize_object({ source_object_uuid, target_category_name })` |
| Pick a category by name, for a UI | `search_prototypes({ query })` |

How matching, scoring and casting work: [Prototypes and casting](PROTOTYPES-AND-CASTING.md).

## Stratum 3: Object (entity, instance)

An **individual thing** in a category: this contact, this invoice, this
event. An object has a title, tags, and **properties**. It is identified by a
**lineage key** so that updates create new versions of the same object rather
than new objects; the newest version is the head.

| Do | Client |
|---|---|
| Create or update | `upsert_object({ title, category_name, properties, tags })` |
| Read, deterministic envelope | `get_object(uuid)` → `propertiesByName`, lineage, category |
| Read as a duck-typed object | `hydrate(uuid)` → `KSGObject` |
| Find an existing one | `resolve_object({ title, category_prototype_uuid })` |
| Inventory | `list_objects({ category, limit })` |
| Typed roles (task, schedule, rule, …) | `instantiate_memory({ role, title, properties })`, `list_memory_roles()` |

## Stratum 3, continued: Property and value

A property is **not a column**. Each field a category declares is its own
**property-definition concept** (so "billing city" can be found when someone
types "city of billing"), and each value an object holds is its own **value
concept**, embedded, versioned by a `next_value` chain, and linked back to the
field and the object. That is what lets a search for "Westerville" land on a
value and walk back to the card it belongs to.

Value types: `string`, `number`, `number-span`, `date`, `timespan`, `url`,
`concept_ref`.

**`concept_ref`** is how objects nest. A `billing_address` property of type
`concept_ref` points at another object, which has its own properties. Nothing
is ever an inline JSON blob.

| Do | Client |
|---|---|
| Set values | `properties: [{ name, type, value }]` on `upsert_object` |
| Which field does a label name? | `search_property_definitions('card number')` |
| Map a form's labels onto fields, one-to-one | `resolve_slots({ labels, candidates, floor })` |
| Current values with confidence and rivals | `get_entity_properties(uuid)` |

## Derived: Assertion (claim) and belief

Everything from here down is a *pattern* over the strata above. No new storage.


An assertion is a **triple with a source**: `subject`, `predicate`, `object`,
plus who said it, how true it asserts the triple to be (`truth` in `[0, 1]`),
and when. Assertions are append-only. A competing claim about the same
subject and predicate is stored *beside* the first; a retraction marks, never
deletes.

By design each part of the triple names a concept. In the implementation today
a claim stores them as **label strings** and the concept is resolved from the
label at read time; the logic evaluator reports this as `resolvedVia: 'label'`.
Binding claims to concept UUIDs directly is on the server's roadmap.

**Belief** is not stored. It is a *view* computed over the competing claims:
the current winner, the alternatives, who said each, and whether they
disagree. Three resolution policies exist (snapshot, weighted belief,
authority-weighted explain); you read them, you do not configure them.

| Do | Client |
|---|---|
| State a claim | `create_assertion({ subject, predicate, obj, source, truth })` |
| Same claim, another speaker | `reinforce_assertion({ subject, predicate, obj, speaker })` |
| Competing claim | `contradict_assertion({ subject, predicate, obj, speaker })` |
| Withdraw | `retract_assertion(assertion_id, { speaker, reason })` |
| Current best value per predicate | `get_snapshot(subject)` |
| Winner + alternatives + speakers | `get_beliefs(subject, { predicate })` |
| Why this winner | `explain_entity(subject, { predicate })`, `get_evidence(subject)` |
| Raw claims | `get_assertions({ subject, predicate })` |

Object property values are assertions underneath, which is why `get_snapshot`
works on an object UUID too.

## Derived: Fact and verification

`store_fact` and `verify` are a convenience layer over assertions for the
hallucination-check use case: store facts you have verified, then ask whether
a free-text claim matches one. The match is by meaning with a threshold, and
the result names the matched fact so you can judge it. For exact questions
about a specific subject, prefer the belief calls above or Logic IR evaluation.

## Derived: Episode and memory event

An **episode** is a record of something that happened: a conversation turn,
an action an agent took, an observation. It carries when, who, and the
original text or payload, and it is private to its owner. The **semantic
memory** door turns a sentence into an immutable memory event plus the claims
extracted from it, each claim linked back to the sentence it came from.

| Do | Client |
|---|---|
| Remember a sentence | `semantic_remember({ text, speaker })` |
| Correct an earlier one | `semantic_correct({ text })` |
| Recall by meaning | `semantic_recall({ query, top_k })` |
| Ask a structured question | `semantic_ask({ subject, predicate })` → supported / refuted / conflicted / unknown |
| Search everything | `search_knowledge({ query })` → concepts, objects and episodes together |

## Derived: Procedure (DAG) and run

A procedure is **how to do something**, stored as a graph: steps, the order
and dependencies between them, guards, and the tool each step calls. Because
it is a graph of concepts, it can be searched, versioned, generalized from a
concrete recording into a template, and repaired step by step.

A **run** of a procedure is a separate record, an episode: which steps ran,
with what parameters, where it blocked and why. Runs are never confused with
the skill itself.

| Do | Client |
|---|---|
| Create | `create_procedure({ title, steps, dependencies })` |
| Read the compiled DAG | `get_procedure(uuid)` |
| Replace the canonical DAG | `put_procedure_dag(uuid, { dag_json })` |
| Insert a step | `add_procedure_step(uuid, { title, tool, payload, after_step_uuid })` |
| Template from a recording | `generalize_procedure(uuid, { title, mode })` |
| Find by meaning | `search_procedures(query)` |
| Import a simple JSON definition | `import_procedure_json({ procedure })` |

Detail: [Procedures and logic](PROCEDURES-AND-LOGIC.md).

## Derived: Logic IR, proposition, derivation

**Logic IR** is a small formal language (predicates, variables, and, or, not,
implies, quantifiers) whose symbols are bound to exact concept UUIDs. A
**proposition** is an object in the `Proposition` category carrying its IR, so
it has lineage and ownership like anything else.

Two different questions:

- **Shape.** Does this conclusion follow from these premises under the
  inference rules? Never reads the graph. `evaluate_logic_inference`.
- **Truth.** Is this formula true of the stored claims? Three-valued: true,
  false, unknown. Names the claims consulted. `evaluate_logic_ir`.

A **derivation** is the stored record of a valid inference or a true/false
evaluation: edges to its premises, to the rule that fired, and to the
conclusion. It can be walked back later, which is what makes a conclusion
auditable. `record: true`, `explain_derivation`, `list_derivations`.

Detail: [Procedures and logic](PROCEDURES-AND-LOGIC.md).

## Derived: Composite

An object made of component objects, where the composition itself is
versioned: a form and its fields, a résumé and its sections.
`create_composite`, `get_composite`, `update_composite_component`.

## Across every stratum: owner, namespace, and token

Private data belongs to an **owner**, identified by a string you choose per
user or app. A **token** proves you hold that owner identity and is required
for writes on the hosted API. Public concepts belong to everyone; private ones
are readable only by their owner.

| Do | Client |
|---|---|
| Set identity | `defaultOwnerUserId`, `authToken` in the constructor |
| Manage tokens | `create_api_token`, `list_api_tokens`, `revoke_api_token` |

---

## Relations you will see

| Edge | Means |
|---|---|
| `is_a` | category is a subtype of category (stored as `prototypeIds` on the child) |
| `instance_of` | object is a member of a category |
| `has_property` / `has_property_value` | object carries a field / holds a value |
| `current_value` / `next_value` | the live value, and the chain behind it |
| `references` / `referenced_by` | a `concept_ref` property points at another object, and back |
| `has_component` | composite contains component |
| `exemplar_of` / `has_exemplar` | an example helped form a prototype, weighted by typicality |
| `derived_from` / `used_rule` / `derives` | a derivation's premises, rule, and conclusion |
| `supersedes` | this version replaces that one |

---

## Where next

- The whole stack in code, from concept to logic: [The bare bones](BASICS.md)
- Hands-on tour: [Getting started](GETTING-STARTED.md)
- Matching and casting: [Prototypes and casting](PROTOTYPES-AND-CASTING.md)
- DAGs and formal logic: [Procedures and logic](PROCEDURES-AND-LOGIC.md)
- Every method: [API reference](API.md)
