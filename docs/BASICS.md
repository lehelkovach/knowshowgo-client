# The bare bones

*From the atom up, in code: a concept, a prototype, an ontology, an object
made from the prototype, a new version of it, claims about it, the belief
those claims resolve to, and a logical check over them. JavaScript and Python
side by side. Every output shown was produced by running this against a
local server.*

If you want the words before the code, read [Concepts](CONCEPTS.md). If you
want a broader tour, read [Getting started](GETTING-STARTED.md). This page is
the shortest path through the whole stack.

```js
import { KnowShowGoClient } from '@lehelkovach/knowshowgo-client';
const client = new KnowShowGoClient({ baseUrl: 'http://127.0.0.1:3000', defaultOwnerUserId: 'me' });
await client.connect();
```

```python
from knowshowgo_client import KnowShowGoClient
client = KnowShowGoClient(base_url="http://127.0.0.1:3000", default_owner_user_id="me")
client.connect()
```

---

## 1. A concept

The atom. A named idea with a permanent UUID, optional aliases, and an
embedding. Everything else is built from these.

```js
const dentistry = await client.create_topic({
  label: 'dentistry',
  aliases: ['dental care'],
  summary: 'Care of teeth and gums',
});
dentistry.uuid;   // 'fe1e78d7-…'
```

```python
dentistry = client.create_topic(label="dentistry", aliases=["dental care"], summary="Care of teeth and gums")
dentistry["uuid"]
```

What happened underneath: the label and each alias were **tokenized** into
tag concepts (`phrase:und:dental care` is the canonical key of one of them),
and the topic was linked to them. That is why an alias resolves back to the
same concept:

```js
const r = await client.resolve_topic_tag({ tag: 'dental care' });
r.topics[0].uuid === dentistry.uuid;   // true
```

```python
client.resolve_topic_tag(tag="dental care")["topics"][0]["uuid"] == dentistry["uuid"]
```

Concepts are found by meaning with `search_concepts(query)` and linked to each
other with `add_association({ from_concept_uuid, to_concept_uuid, relation_type })`.

## 2. A prototype

A **category** is a concept that other things are measured against. It can
declare the fields its members carry. Create one explicitly:

```js
const person = await client.upsert_object_category({
  name: 'Person',
  description: 'A human being',
  properties: [{ name: 'name', type: 'string' }],
});
person.categoryPrototypeUuid;   // 'da3e0750-…'
```

```python
person = client.upsert_object_category(name="Person", description="A human being",
                                       properties=[{"name": "name", "type": "string"}])
person["categoryPrototypeUuid"]
```

Each declared property became its own **property-definition concept** with a
UUID of its own. A category is itself versioned: calling this again with the
same name and a changed description or property list writes version 2; an
identical call changes nothing.

## 3. An ontology

Name a parent and you have a subtype. The child inherits the parent's
property definitions.

```js
const dentist = await client.upsert_object_category({
  name: 'Dentist',
  description: 'A person who practises dentistry',
  parent_category_name: 'Person',
  properties: [
    { name: 'practice',  type: 'string' },
    { name: 'phone',     type: 'string' },
    { name: 'specialty', type: 'concept_ref' },   // will point at a concept
  ],
});
const dentistUuid = dentist.categoryPrototypeUuid;

const cat = await client.get_object_category(dentistUuid);
cat.properties.map((p) => p.propertyName);        // ['phone', 'practice', 'specialty']
cat.properties[0].propertyConceptUuid;            // the field is a concept
```

```python
dentist = client.upsert_object_category(
    name="Dentist", description="A person who practises dentistry", parent_category_name="Person",
    properties=[{"name": "practice", "type": "string"}, {"name": "phone", "type": "string"},
                {"name": "specialty", "type": "concept_ref"}],
)
dentist_uuid = dentist["categoryPrototypeUuid"]
cat = client.get_object_category(dentist_uuid)
[p["propertyName"] for p in cat["properties"]]
```

`Dentist is_a Person is_a Concept`. The tree always ends at `Concept`, the
one root. `list_object_categories()` lists every category with its version
count and how many objects it holds.

Two things a category is **not**: it is not a rigid schema (an object may
carry values the category never declared), and it is not the only way to type
a thing (an object can also be *matched* against any prototype by resemblance;
see [Prototypes and casting](PROTOTYPES-AND-CASTING.md)).

## 4. An object from the prototype

An **individual**, typed by the category, with values for its fields. A
`concept_ref` value points at the concept from step 1.

```js
const v1 = await client.upsert_object({
  title: 'Dr. Lee',
  category_prototype_uuid: dentistUuid,            // or category_name: 'Dentist'
  properties: [
    { name: 'practice',  type: 'string',      value: 'Example Dental' },
    { name: 'phone',     type: 'string',      value: '+1 555 0100' },
    { name: 'specialty', type: 'concept_ref', value: dentistry.uuid },
  ],
});
v1.objectUuid;            // 'be501d57-…'
v1.previousObjectUuid;    // null — first version
v1.objectLineageKey;      // 'private:me:user:<dentistUuid>:dr-lee'
```

```python
v1 = client.upsert_object(
    title="Dr. Lee", category_prototype_uuid=dentist_uuid,
    properties=[{"name": "practice", "type": "string", "value": "Example Dental"},
                {"name": "phone", "type": "string", "value": "+1 555 0100"},
                {"name": "specialty", "type": "concept_ref", "value": dentistry["uuid"]}],
)
```

Underneath: the object is a node whose `prototypeIds` names the category;
each value became its own **value concept** linked to the object and to its
property-definition concept; the title was tokenized into tag concepts; and
the **lineage key** (owner, category, title) is the object's identity across
versions.

## 5. A new version

Call `upsert_object` again with the same title and category. You get a new
immutable version; the old one stays.

```js
const v2 = await client.upsert_object({
  title: 'Dr. Lee',
  category_prototype_uuid: dentistUuid,
  properties: [
    { name: 'practice',  type: 'string',      value: 'Example Dental' },
    { name: 'phone',     type: 'string',      value: '+1 555 0199' },   // changed
    { name: 'specialty', type: 'concept_ref', value: dentistry.uuid },
  ],
});
v2.objectUuid !== v1.objectUuid;       // true — a new node
v2.previousObjectUuid === v1.objectUuid; // true — chained to the old one
v2.objectLineageKey === v1.objectLineageKey; // true — same identity

(await client.get_object(v1.objectUuid)).propertiesByName.phone.value;  // '+1 555 0100' — history intact
```

```python
v2 = client.upsert_object(title="Dr. Lee", category_prototype_uuid=dentist_uuid, properties=[...])
v2["previousObjectUuid"] == v1["objectUuid"]
client.get_object(v1["objectUuid"])["propertiesByName"]["phone"]["value"]   # '+1 555 0100'
```

Three rules, all verified:

- **A version is a snapshot, not a patch.** Pass the full property set each
  time. A version written with only `phone` carries only `phone`.
- **A no-op is not a version.** An identical upsert returns the current head
  (`reused: true`) and writes nothing.
- **Reads default to the head.** `resolve_object({ title, category_prototype_uuid, private: true })`
  returns the newest version of a private object and lists its `versions`;
  history is an explicit walk back through `previousObjectUuid`.

## 6. Claims

A **claim** is a triple about a subject, with a source and a `truth` in
`[0, 1]`. The object's property values are already claims underneath, which
is why the snapshot call works on an object UUID:

```js
await client.get_snapshot(v2.objectUuid);   // { phone: '+1 555 0199', … }
```

Add claims of your own. Two sources disagree; nothing is overwritten:

```js
await client.create_assertion({ subject: v2.objectUuid, predicate: 'accepts_new_patients', obj: 'yes', source: 'front-desk' });
await client.contradict_assertion({ subject: v2.objectUuid, predicate: 'accepts_new_patients', obj: 'no', speaker: 'website' });

await client.get_assertions({ subject: v2.objectUuid, predicate: 'accepts_new_patients' });
// [ { object: 'yes', truth: 1,   source: 'front-desk' },
//   { object: 'no',  truth: 0.7, source: 'user', … speakers: ['website'] } ]
```

```python
client.create_assertion(subject=v2["objectUuid"], predicate="accepts_new_patients", obj="yes", source="front-desk")
client.contradict_assertion(subject=v2["objectUuid"], predicate="accepts_new_patients", obj="no", speaker="website")
client.get_assertions(subject=v2["objectUuid"], predicate="accepts_new_patients")
```

**How the triple relates to concepts.** By design a subject, predicate and
object each name a concept. In the implementation today a claim stores them
as **label strings**, and the concept is resolved from the label when
something reads the claim. The evaluator in step 8 reports this as
`resolvedVia: 'label'` so the soft join is visible. Binding claims to concept
UUIDs directly is on the server's roadmap, and nothing in this page changes
when it lands.

## 7. Belief

Belief is **not stored**. It is computed over the competing claims when you
ask, and it comes back with the alternatives and their speakers:

```js
const b = await client.get_beliefs(v2.objectUuid, { predicate: 'accepts_new_patients' });
b.beliefs.accepts_new_patients;
// { value: 'no', score: 0.73, speakers: ['website'], disagreeing: true,
//   alternatives: [ { value: 'yes', score: 0.57, truth: 1, … } ] }
```

```python
client.get_beliefs(v2["objectUuid"], predicate="accepts_new_patients")["beliefs"]["accepts_new_patients"]
```

`disagreeing: true` is the useful bit. A second source agreeing is
`reinforce_assertion`; a withdrawal is `retract_assertion`; the record keeps
all of it.

## 8. Logic over the claims

A formula whose predicate is bound to a concept, evaluated against the stored
claims. Three-valued, with the claims it consulted. The predicate must exist
as a concept, so make one:

```js
const pred = await client.create_topic({ label: 'accepts_new_patients' });

const yes = await client.evaluate_logic_ir({
  ir: {
    logicIrVersion: '0.0.1',
    kind: 'Predicate',
    predicate: { kind: 'ConceptRef', uuid: pred.uuid },
    args: [{ kind: 'EntityRef', uuid: v2.objectUuid }, { kind: 'EntityRef', uuid: 'yes' }],
  },
});
yes.truth;                                   // 'true'
yes.atoms[0].predicate.resolvedVia;          // 'label'
yes.atoms[0].claims;                         // { supporting: [1 claim], opposing: [], competing: [1 claim] }

const maybe = await client.evaluate_logic_ir({ ir: { /* same, object 'maybe' */ } });
maybe.truth;                                 // 'unknown' — nothing stored, nothing invented
```

```python
pred = client.create_topic(label="accepts_new_patients")
yes = client.evaluate_logic_ir(ir={"logicIrVersion": "0.0.1", "kind": "Predicate",
                                   "predicate": {"kind": "ConceptRef", "uuid": pred["uuid"]},
                                   "args": [{"kind": "EntityRef", "uuid": v2["objectUuid"]},
                                            {"kind": "EntityRef", "uuid": "yes"}]})
yes["truth"], yes["atoms"][0]["claims"]
```

Note what the evaluator did and did not do: it found a claim supporting
`accepts_new_patients(Dr. Lee, yes)` and reported the competing `no` beside
it. It did not pick the belief winner for you; that is the belief view's job,
and the two are kept apart on purpose. Add `record: true` and a `true` or
`false` result is stored as a derivation you can walk back later with
`explain_derivation`.

---

## The whole stack in one picture

```text
8  Derivation          ── derived_from / used_rule / derives ──►  claims, rule, conclusion
7  Belief              ── a view computed over ──────────────►  claims
6  Claim               ── subject · predicate · object (labels → concepts) + source + truth
5  Version             ── previousObjectUuid chain, one lineage key per identity
4  Object              ── instance_of category; each value its own concept; concept_ref nests
3  Ontology            ── is_a tree of categories rooted at Concept; property definitions
2  Prototype           ── a category: centroid + exemplars + declared fields
1  Concept             ── a node with a UUID, aliases, an embedding, and edges
0  Tokens / tags       ── every label and phrase, canonical per language, linked upward
```

Procedures, episodes and composites are further patterns over layers 1 to 5,
not new kinds of storage. [Concepts](CONCEPTS.md) describes each; the
[API reference](API.md) lists every call.
