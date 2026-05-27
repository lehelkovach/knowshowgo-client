# KSG JS Semantic Object API Plan

## MVP implemented on `ksg-dev-api-client-methods`

The JavaScript client now exposes snapshot-backed semantic objects with:

- `client.object(ref)` / `client.$object(ref)` / `new KSGObject(client, ref)` for proxy objects.
- `await object.propertyName` and `await object.$get('propertyName')` for snapshot-derived property reads.
- `await object.$resolve()` for resolving `{ title, objectLineageKey, categoryPrototypeUuid, private, ownerUserId, agentSessionId }` through `POST /api/objects/resolve`.
- `await object.$assert(predicate, value, options)` for append-only assertion writes through `POST /api/assertions`.
- `await object.$associate(target, relationType, options)` for append-only association writes through `POST /api/associations`.
- `await object.$query(filters)` for scoped assertion reads through `GET /api/assertions?subject=<id>`.
- `await object.$match(text, options)` for smart semantic matching through `POST /api/concept-objects/suggest`.
- `await object.$similar(text, options)` for semantic search through `POST /api/concept-objects/search`.
- `await object.$explain(predicate)` for server-side resolution explanation through `GET /api/entities/:id/explain`.

The proxy rejects assignment, deletion, and `Object.defineProperty` so client code cannot imply destructive mutation. Property changes must be represented as appended assertions, and relationship changes must be represented as appended associations.

## Endpoint mapping

| Client API | KSG dev endpoint |
| --- | --- |
| `object.$resolve()` | `POST /api/objects/resolve` |
| `object.foo` / `object.$snapshot()` | `GET /api/entities/:id/snapshot` |
| `object.$assert()` | `POST /api/assertions` |
| `object.$associate()` | `POST /api/associations` |
| `object.$query()` | `GET /api/assertions` |
| `object.$match()` / `client.$match()` | `POST /api/concept-objects/suggest` |
| `object.$similar()` / `client.$query()` / `client.$similar()` | `POST /api/concept-objects/search` |
| `object.$explain()` | `GET /api/entities/:id/explain` |

## Intentional non-goals

- No advanced theorem proving, logic planning, or local inference.
- No client-side conflict resolution beyond reading server snapshots.
- No destructive update/delete API.
- No local cache persistence; snapshot cache is per object and invalidated after `$assert()`.

## KSG server API gaps for a cleaner client

- Add `POST /api/entities/:id/assertions` so object-scoped assertions do not repeat `subject`.
- Add `POST /api/entities/:id/associations` so object-scoped associations do not repeat `fromConceptUuid`.
- Stabilize `GET /api/entities/:id/explain` response shape for SDK typings and docs.
- Return a consistent top-level `uuid` field from `POST /api/objects/resolve`; the client currently accepts `selectedObjectUuid`, `objectUuid`, `id`, or `object.uuid`.
- Add batch snapshot reads, for example `POST /api/entities/snapshots`, to avoid one request per object in list views.
- Consider a dedicated `POST /api/concept-objects/match` alias if `$match()` should differ semantically from `suggest`.
