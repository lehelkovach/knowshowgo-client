# Prototypes and casting

*How KnowShowGo decides what kind of thing something is, how the client turns
that into a plain object you can read, and how a thing gets a new category
without losing its old self.*

This is the part of the model that looks least like a database, so it gets
its own page. Everything here is reachable from the SDK in both languages.

---

## Categories are prototypes

A category in KnowShowGo is not a rigid type with a fixed schema that a thing
either satisfies or fails. It is a **prototype**: a center in meaning-space
formed from examples, with the examples attached and weighted by how typical
they are. "Bird" is a prototype. A robin sits near its center; a penguin is
further out; both are birds.

Three consequences for you as a programmer:

1. **Membership is a score, not a boolean.** A thing matches a prototype
   with a number, and can match several prototypes at once.
2. **Nothing has one "type" field.** An object records which category it was
   created in, and separately can be *ranked* against every prototype in the
   graph. The ranking is a read; it changes nothing unless you ask it to.
3. **Categories learn.** Fold an example into a prototype and its center moves
   a little. Typical examples move it more than atypical ones.

There are two distinct matching mechanisms. They answer different questions
and you will use both.

| Mechanism | Question | How it decides | Client |
|---|---|---|---|
| **Centroid matching** | "What does this resemble?" | cosine similarity between embeddings | `match_prototypes`, `get_entity_types`, `hydrate` |
| **Contract matching** | "Does this object revision satisfy this prototype's declared constraints?" | hard constraints must pass, soft constraints are scored, pinned to a matcher revision | `evaluatePrototypeMatch`, `evaluatePrototypeMatchList`, `cast_object` |

---

## Part 1: resemblance

### Which categories does this thing resemble?

```js
const ranked = await client.get_entity_types(uuid, { top_k: 5 });
// ranked.types → [{ uuid, name: 'Person', score: 0.91 }, { name: 'Employee', score: 0.62 }, …]
```

```python
ranked = client.get_entity_types(uuid, top_k=5)
```

This is read-only. If you actually want to *record* that the entity is a
member of its top match, say so explicitly:

```js
await client.get_entity_types(uuid, { persist: true, persist_top_k: 1 });
```

That writes an `instanceOf` edge marked as dynamically assigned, with the
score as its strength. Nothing in the system does this on your behalf during
a search or a read.

### What does this text resemble?

```js
const matches = await client.match_prototypes({ text: 'billing city', top_k: 5 });
// → prototypes ranked by similarity to the text
```

Use this for "which field is this label about" style questions after you have
read the caveat below about centroids and labels.

### Teach a category by example

```js
await client.generalize_from_exemplar({
  text: 'Dr. Lee, dentist, Tuesdays at 3',
  threshold: 0.85,          // how close an existing prototype must be to absorb this
  create_if_no_match: true, // otherwise start a new prototype from it
});
```

The service embeds the example, finds the nearest prototype center, and either
folds the example in (moving the center) or creates a new prototype with this
as its first exemplar. `attach_exemplar(prototype_uuid, concept_uuid)` does
the folding step for an existing node.

### A caveat that matters: centroids drift toward their data

A prototype's center is the average of the values it has absorbed. For a
category like `cvv`, that center ends up shaped like "a short string of
digits", and so does `card_number`'s. Ask a *label* question against value
centroids ("which field is 'Card number'?") and the system has been measured
to rank `cvv` above `number`.

So KnowShowGo keeps **one embedding per node and answers different questions
with different nodes**:

| Question | Ask |
|---|---|
| Which field does this *label* name? | `search_property_definitions('card number')` (ranks field-definition concepts) |
| Which field does this *value* belong to? | `search_concepts('Westerville')` (ranks value concepts), then walk to the field |
| What kind of thing is this *object*? | `get_entity_types(uuid)` / `hydrate(uuid)` (ranks category prototypes) |

And for a whole set of labels at once (a form, a CSV header), let the server
assign them **one-to-one** so a strong match consumes its field and the weaker
one falls through to its own best option:

```js
const { slots, unresolved } = await client.resolve_slots({
  labels: ['Cardholder name', 'Card number', 'CVC', 'Email address'],
  candidates: ['name_on_card', 'number', 'cvv', 'expiry', 'zip'],
  floor: 0.5,
});
// slots: [{ label: 'Card number', property: 'number', score: 0.61 }, …]
// unresolved: ['Email address']   ← nothing in the candidate set, so nothing, not the nearest
```

---

## Part 2: reading an object as an object

This is the piece JavaScript and Python programmers tend to want first.

```js
const person = await client.hydrate(uuid);

person.middleName            // 'Byron'  — a plain value, no await
person.middle_name           // same member, either spelling
'city' in person             // true
const { city, role } = person;

person.type()                // { uuid, name: 'Person', score: 0.91 } — strongest match
person.typesNow()            // every match, ranked
```

```python
person = client.hydrate(uuid)
person.middle_name
person.type()
```

One request does all of it. The server returns the ranked matches, the merged
member map those matches declare, and the resolved values together, because a
JavaScript property getter cannot wait for a network call: if the member names
and the values arrived separately, `person.city` would have to be a promise and
`in`, `Object.keys` and destructuring would stop working.

### The strongest match owns a name, and it does not get to decide

When two matched prototypes both declare a member called `city`, the
higher-scoring one owns it. But the loser is **kept**, not dropped:

```js
person.explain('city');
// {
//   name: 'city',
//   definedBy:     { prototypeName: 'Person',   score: 0.91 },
//   alsoDefinedBy: [{ prototypeName: 'Employee', score: 0.62 }],
//   contested: true,
//   confidence: 0.6
// }
```

This is the deliberate alternative to winner-take-all. A ranking that silently
committed to its top row would be untrustworthy in exactly the cases where the
centroid caveat above bites. Instead the ranking stays inspectable, and you can
**re-project the same entity through any other matched prototype** without a
second request:

```js
const employee = person.as('Employee');
employee.role            // 'engineer'
employee.city            // 'Denver', now attributed to Employee
employee.middleName      // undefined — Employee does not declare it
'middleName' in employee // false
person.as('Spaceship')   // null — it did not match, so no view is invented
```

```python
person.as_("Employee").role      # `as_` because `as` is a Python keyword
```

### Values the object holds but no prototype declares

Are still exposed, with `definedBy: null`. Hiding data the object demonstrably
has would be worse than a messy projection.

### Four kinds of absence, told apart

| Question | Call |
|---|---|
| Is this a member at all? | `person.hasMember('nickname')` |
| Does it carry a value? | `person.hasValue('nickname')` |
| Where did the member come from? | `person.explain('nickname')` |
| Everything about the cell | `person.cell('nickname')` → `{ value, confidence, contested, claims, definedBy, … }` |

### Contested values

The plain read is the resolver's winner; the disagreement stays reachable.

```js
person.city                  // 'Denver'
person.isContested('city')   // true
person.claims('city')        // [{ value: 'Denver', … }, { value: 'Boulder', … }]
```

### It is a snapshot, and it never writes

Prototype centers move as examples accumulate, so a hydration is true of the
graph at `person.hydratedAt`. Re-hydrate rather than holding one for a long
time. Hydration cannot stamp membership even if asked; use
`get_entity_types(uuid, { persist: true })` when you mean to. There is no
`person.city = …` because a write is a new claim with provenance, not an
assignment: use `upsert_object`.

Full detail: [The duck-typed ORM](DUCK-TYPED-ORM.md).

---

## Part 3: contracts and casting

Resemblance is a hint. Some decisions need a **contract**: "this object
revision counts as a `Claim` because it satisfies what `Claim` requires", with
the decision pinned to a matcher revision so it means the same thing next
month.

A prototype can carry a match contract: a list of **hard constraints** (every
one must pass), a list of **soft constraints** (each scored 0 to 1 and
averaged), a **minimum score**, and the decision policy. Constraints are named
checks the server knows how to evaluate. The Logic IR primitives the server
can seed (`Concept`, `Proposition`, `Claim`, `Argument`, and friends) carry
such contracts; your own categories can declare them through
`upsert_object_category` (`hard_constraints`, `soft_constraints`, `min_score`,
`decision_policy`).

### Evaluate one pair

```js
const r = await client.evaluatePrototypeMatch({
  objectRevisionUuid: utteranceUuid,
  prototypeRevisionUuid: claimPrototypeUuid,
});
// r.decision   → 'match' | 'no_match' | 'unresolved'
// r.score      → soft-constraint average
// r.hardPass   → every hard constraint passed
// r.constraints → each constraint with passed / score and a diagnostic
// r.explanation → a sentence
```

The result is cached per (object revision, prototype revision, matcher
revision), so asking again is free and answers the same.

### List every decision

```js
const list = await client.evaluatePrototypeMatchList({
  objectRevisionUuid: utteranceUuid,
  prototypeRevisionUuids: [],   // empty → every prototype that carries a contract
});
// list.policy → 'list', list.wta → false
// list.matches → one row per prototype, each with decision, score, constraints
```

`wta: false` is in the response on purpose. The list does **not** pick a
winner for you. Several prototypes can be `match` at once (a sentence can be
both a `Proposition` and a `Claim`), and which one you act on is your decision.

### Cast

Casting is how an object **gets a category it did not have**, without
rewriting history:

```js
const cast = await client.cast_object({
  objectRevisionUuid: utteranceUuid,
  prototypeRevisionUuid: claimPrototypeUuid,
  requireMatch: true,            // default: refuse (409) unless the decision is 'match'
  title: 'Claim: Maya lives in Austin',
});
// → a NEW object under the Claim prototype, linked to the source by a `cast_from` edge.
//   The source revision is unchanged.
```

Rules worth knowing:

- Cast creates a **new lineage**. The original object keeps its category and
  its versions; the cast object has its own.
- `requireMatch: false` lets you cast on a `no_match` or `unresolved`
  decision. The decision and its constraints are still recorded, so a forced
  cast is visible as one.
- `get_object(uuid, { match_prototypes: true })` runs the list lazily on a
  read and returns it alongside the object. It never casts.
- A plain `upsert_object` refuses to change an existing object's category.
  Cast is the one path that does, and it does it by making a new thing.

### Why not winner-take-all?

Because the two places a winner is tempting are the two places it fails
quietly. In resemblance, centroids drift and the top row can be wrong, so the
projection keeps the runners-up and lets you re-project. In contracts, several
prototypes can legitimately match the same revision, so the list says so and
the cast is an explicit act with a record. The one place KnowShowGo does
resolve to a winner is **belief**: competing claims about the same subject and
predicate resolve to a current best value. Even there the alternatives and
their speakers come back with it.

---

## Reading list

- [Concepts](CONCEPTS.md) for how categories, objects, properties and claims fit together.
- [The duck-typed ORM](DUCK-TYPED-ORM.md) for the full `KSGObject` surface, including measured request counts.
- [Procedures and logic](PROCEDURES-AND-LOGIC.md) for what the seeded Logic IR prototypes are for.
- [API reference](API.md) for every method.
