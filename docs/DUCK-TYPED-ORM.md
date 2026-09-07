# The duck-typed ORM (`client.hydrate` → `KSGObject`)

> Server side: [`docs/ONTOLOGY-PROTOTYPE-MODEL.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/ONTOLOGY-PROTOTYPE-MODEL.md)
> Layer 5. Endpoint: `GET /api2.0/entities/:id/hydrate` (`/api` alias).

## What you get

```js
const person = await client.hydrate(uuid);

person.middleName            // 'Byron' — synchronous, no await
person.middle_name           // same member, either spelling
'city' in person             // true
Object.keys(person)          // every member name
const { city, role } = person;

person.type()                // { uuid, name: 'Person', score: 0.91 }
person.typesNow()            // all ranked matches, strongest first
person.explain('city')       // who supplied the member, and who else could have
person.as('Employee').role   // read through a weaker match
person.cell('city')          // { value, confidence, contested, claims, definedBy, … }
person.hydratedAt            // when this snapshot was taken
```

Python is the same surface, with `as_` because `as` is a keyword:

```python
person = client.hydrate(uuid)
person.middle_name
person.middleName
"city" in person
person.as_("Employee").role
person.explain("city")
```

## Why hydration is one request

A prototype match is `{ uuid, name, score }`. It says nothing about what members
that prototype declares, so learning them used to mean one request per matched
prototype on top of `…/properties` and `…/types`.

Batching those away is the smaller half. The reason it has to be **one** response
is that a JavaScript `Proxy` get handler cannot await. If the member map arrives
separately from the values, `person.middleName` cannot be a value — it has to be
a promise — and `in`, `Object.keys`, spread and destructuring stop working
entirely. Lazy member access and duck typing are mutually exclusive in JS.

Measured on loopback against an in-memory backend:

| Path | Requests | Time |
|---|---|---|
| `get_entity_properties` + `get_entity_types` + one `get_object_category` per match | 7 | 5.9 ms |
| `hydrate` | 1 | 1.0 ms |

6.1x. Loopback understates it — the request count is what matters over a network,
and every subsequent member read, `explain`, `cell` and `as()` is local, which a
test asserts by counting requests after hydration.

## The strongest match owns a name, but does not get to decide

Members merge strongest-match-first. When two matched prototypes declare the same
name, the higher-scoring one owns it and the other is recorded:

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

Keeping the losers is the point. Prototype centroids drift toward the shape of
the data they have seen, which is why the cue "Card number" can rank `cvv` above
`number` — a documented failure, not a hypothetical. A projection that silently
picked a member's meaning from that ranking would be untrustworthy in exactly the
cases you need it. `as()` re-projects through any match the server reported,
using data you already have:

```js
const employee = person.as('Employee');
employee.role          // 'engineer'
employee.city          // 'Denver', now attributed to Employee
employee.middleName    // undefined — Employee does not declare it
'middleName' in employee  // false
```

`as()` returns `null` for a prototype that did not match, rather than inventing a
view.

## Four ways to be absent, and telling them apart

Plain access returns `undefined` for a typo, for a member declared but unset, and
for a member no prototype declares. That ambiguity is most of the pain of
debugging a fuzzy projection, so it is queryable:

| Question | Call |
|---|---|
| Is this a member at all? | `person.hasMember('nickname')` |
| Does it carry a value? | `person.hasValue('nickname')` |
| Where did the member come from? | `person.explain('nickname')` |
| Everything about the cell | `person.cell('nickname')` |

A value the entity holds is always a member, even when no matched prototype
declares it — `explain()` reports `definedBy: null`. Hiding data the object
demonstrably has would be worse than not projecting at all.

## Contested values

The winner is the plain value; the disagreement stays reachable.

```js
person.city                  // 'Denver' — resolver's winner
person.isContested('city')   // true
person.claims('city')        // [{ value: 'Denver' }, { value: 'Boulder' }]
```

## It is a snapshot, and it never writes

`hydratedAt` is on the object because prototype centroids move as exemplars
accumulate: a projection is true relative to the corpus at that instant. Re-call
`hydrate` rather than holding one for a long-lived process.

Hydration is read-only by construction. `…/types?persist=true` can stamp
`instanceOf` edges, so `persist` is pinned false server-side and is not a
parameter of `/hydrate` — a server test asserts that passing it changes nothing.
When you actually mean to record membership, call
`get_entity_types(id, { persist: true })` deliberately.

## Name collisions

Real fields and methods win over members, so a member called `uuid`, `types` or
`explain` does not shadow the API. It stays reachable:

```js
person.uuid           // the entity uuid
person.value('uuid')  // a member that happens to be named 'uuid'
person.cell('uuid')   // …with its provenance
```

## What this does not do

- **No type ∩ value in one call.** `prototype_filter` on `search_concepts` is
  accepted by the server and not enforced. Constrain the field with
  `match_prototypes` and rank the value with `search_concepts`; hydration
  projects one known entity and is not a search.
- **No writes.** Set values with `upsert_object`. There is no `person.city = …`,
  because a write is a new claim with provenance, not an assignment.
- **No lazy members.** Deliberate: see above.

## Related

- `get_entity_snapshot` — the older two-call `EntityProxy`. Still supported;
  `hydrate` supersedes it for anything that wants member metadata.
- `EntityProxy.getType({ refresh })` returns an array without the flag and a
  Promise with it. Prefer `typesNow()` (always an array) or `resolveTypes()`
  (always a Promise).
- Tests: `js/ksg_object.test.mjs` (offline), `js/ksg_object_live.test.mjs`
  (against a real service, skips when none is reachable),
  `python/test_ksg_object.py` (same fixture, so the clients cannot drift).
