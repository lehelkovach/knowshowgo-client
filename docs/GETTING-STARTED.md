# Getting started

A hands-on tour, from install to a memory that remembers, disagrees, explains
itself, and can be searched by meaning. JavaScript and Python side by side.
Allow about fifteen minutes.

New to KnowShowGo? Read [What is KnowShowGo?](WHAT-IS-KNOWSHOWGO.md) first. It
is short, has no code, and explains the words used below.

---

## 1. What you need

- **JavaScript:** Node.js 18 or newer. Nothing else; the SDK uses the built-in
  `fetch`.
- **Python:** Python 3.8 or newer and the `requests` package, which the
  package installs for you.
- **A KnowShowGo service to talk to.** Two options:
  - the **hosted API** at `https://api.knowshowgo.com`, with an API token from
    the developer portal at <https://knowshowgo.com/developers>, or
  - a **local server** on your machine, no token needed. See
    [section 11](#11-run-your-own-server).

The examples below assume the hosted API with a token in the environment
variable `KSG_API_TOKEN`. For a local server, drop the token and point the
client at `http://127.0.0.1:3000`.

## 2. Install

```bash
# JavaScript
npm install @lehelkovach/knowshowgo-client

# Python
pip install knowshowgo-client
```

To pin a specific release instead, install from a tag on the
[releases page](https://github.com/lehelkovach/knowshowgo-client/tags). Client
and server releases pair by version; the pairing rule is the server's
[`VERSION-MATRIX.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/VERSION-MATRIX.md).

## 3. Connect

Create a client, give it your identity, and check that the server is the one
you expect.

```js
import { KnowShowGoClient } from '@lehelkovach/knowshowgo-client';

const client = KnowShowGoClient.publicApi({
  defaultOwnerUserId: 'my-app',          // whose private data this is
  authToken: process.env.KSG_API_TOKEN,  // proves it
});

const manifest = await client.connect();
console.log(manifest.version, manifest.channel);
```

```python
import os
from knowshowgo_client import KnowShowGoClient

client = KnowShowGoClient.public_api(
    default_owner_user_id="my-app",
    auth_token=os.environ["KSG_API_TOKEN"],
)

manifest = client.connect()
print(manifest["version"], manifest["channel"])
```

What the two settings mean:

- `defaultOwnerUserId` is your **namespace**. Private things you write belong
  to it, and reads are scoped to it. Pick a stable string per user or per app.
- `authToken` is a server-issued token that proves you hold that namespace.
  The hosted API requires one for writes. Reads without a token see only the
  public commons.

`connect()` fetches the server's release manifest. Pass
`expected_release: 'vX.Y.Z'` to fail fast if the server is not the version you
tested against. In JavaScript every request has a 30 second timeout by
default; change it with `timeoutMs` in the constructor or the `KSG_TIMEOUT_MS`
environment variable. The Python client uses the `requests` library's default
behaviour.

## 4. Remember a fact, then read it back

The simplest durable memory is an **assertion**: subject, predicate, object,
plus who said so.

```js
await client.create_assertion({
  subject: 'Ada Lovelace',
  predicate: 'is_a',
  obj: 'Mathematician',
  source: 'my-app',
});

// Everything stored about Ada, resolved to the current best value per predicate.
const snapshot = await client.get_snapshot('Ada Lovelace');
console.log(snapshot); // { is_a: 'Mathematician' }

// Or the raw claims, with source and timestamp, filtered however you like.
const claims = await client.get_assertions({ subject: 'Ada Lovelace', predicate: 'is_a' });
console.log(claims);
```

```python
client.create_assertion(
    subject="Ada Lovelace", predicate="is_a", obj="Mathematician", source="my-app"
)

print(client.get_snapshot("Ada Lovelace"))                        # {'is_a': 'Mathematician'}
print(client.get_assertions(subject="Ada Lovelace", predicate="is_a"))
```

An assertion is a **claim about a subject**, not a searchable concept of its
own. Searching by meaning comes in [section 8](#8-search-everything-by-meaning),
once there are objects to find.

## 5. Let two sources disagree, then ask what is believed

This is where KnowShowGo stops looking like a database. Store a fact, then
store a competing claim about the same thing from a different source. Nothing
is overwritten.

```js
const first = await client.create_assertion({
  subject: 'Ada Lovelace', predicate: 'born_in', obj: '1815', source: 'encyclopedia',
});

await client.contradict_assertion({
  subject: 'Ada Lovelace', predicate: 'born_in', obj: '1816',
  speaker: 'a forum post',
  against_assertion_id: first.id ?? first.uuid ?? null, // optional: name the claim you dispute
});

const beliefs = await client.get_beliefs('Ada Lovelace', { predicate: 'born_in' });
console.log(JSON.stringify(beliefs, null, 2));

const why = await client.explain_entity('Ada Lovelace', { predicate: 'born_in' });
console.log(JSON.stringify(why, null, 2));
```

```python
first = client.create_assertion(
    subject="Ada Lovelace", predicate="born_in", obj="1815", source="encyclopedia"
)
client.contradict_assertion(
    subject="Ada Lovelace", predicate="born_in", obj="1816",
    speaker="a forum post",
    against_assertion_id=first.get("id") or first.get("uuid"),  # optional
)

print(client.get_beliefs("Ada Lovelace", predicate="born_in"))
print(client.explain_entity("Ada Lovelace", predicate="born_in"))
```

`get_beliefs` returns the current best reading **and** the alternatives with
their speakers, so your code can decide whether a contested value is good
enough to act on. `explain_entity` returns the evidence trail: which claims,
from whom, and how they were weighed. If a second source agrees with the first
instead, use `reinforce_assertion`; if a source withdraws a claim, use
`retract_assertion`. The record keeps all of it.

## 6. Check a claim before you trust it

If an AI model in your app produces a sentence, you can ask KnowShowGo whether
the stored facts support it. Two tools, with different strengths.

**`verify` is a fuzzy match against facts you marked verified.** It compares
the claim to stored facts by meaning and returns the closest one with a
confidence, so you can see *what* it matched, not just a yes or no.

```js
await client.store_fact({
  subject: 'Ada Lovelace', predicate: 'wrote', obj: 'the first published algorithm',
  source: 'my-app',
});

const result = await client.verify('Ada Lovelace wrote the first published algorithm');
console.log(result.status, result.confidence); // 'verified' 1.0
console.log(result.matchingFact.rawText);      // the fact it matched
```

```python
client.store_fact(
    subject="Ada Lovelace", predicate="wrote", obj="the first published algorithm",
    source="my-app",
)
result = client.verify("Ada Lovelace wrote the first published algorithm")
print(result["status"], result["confidence"], result["matchingFact"]["rawText"])
```

Always read `matchingFact` as well as `status`. The match is by embedding
similarity with a threshold (default 0.7), so it is only as sharp as the
embedding model behind the server. **On a local server with no embedding
model, the similarity fallback is not meaningful and `verify` will match
unrelated claims**; use it against a server with real embeddings.

**`get_snapshot` and `semantic_ask` are exact.** They answer from the stored
claims about a subject, and when nothing is stored the answer is unknown, not
a guess. For a yes-or-no question about a specific subject and predicate,
prefer them:

```js
const snap = await client.get_snapshot('Ada Lovelace');
console.log(snap.wrote);      // 'the first published algorithm'
console.log(snap.invented);   // undefined — nothing stored, nothing invented
```

```python
snap = client.get_snapshot("Ada Lovelace")
print(snap.get("wrote"))      # 'the first published algorithm'
print(snap.get("invented"))   # None
```

For formal checks, `evaluate_logic_ir` evaluates a proposition against stored
claims and answers `true`, `false` or `unknown`, naming the claims it
consulted. That is the auditable route and the one the server's reasoning
features build on; see [Where next](#where-next).

## 7. Store a real thing with properties, and read it back like an object

Facts are one triple at a time. For a contact, an event, a product, a form,
you want an **object**: a titled thing in a **category**, with named, typed
properties. You do not have to design the category first; naming it creates
it.

```js
const saved = await client.upsert_object({
  title: 'Dr. Lee',
  category_name: 'Dentist',
  parent_category_name: 'Person',
  properties: [
    { name: 'phone', type: 'string', value: '+1 555 0100' },
    { name: 'next_visit', type: 'date', value: '2026-11-04' },
    { name: 'website', type: 'url', value: 'https://example-dental.test' },
  ],
  tags: ['health', 'provider'],
});

const uuid = saved.objectUuid ?? saved.object?.uuid ?? saved.uuid;

// Read it back as a plain object. Property access is synchronous after hydrate.
const dentist = await client.hydrate(uuid);
console.log(dentist.phone);          // '+1 555 0100'
console.log(dentist.nextVisit);      // same member as next_visit
console.log(dentist.type());         // strongest category match, with a score
console.log(dentist.explain('phone')); // which category defined it, and rivals
```

```python
saved = client.upsert_object(
    title="Dr. Lee",
    category_name="Dentist",
    parent_category_name="Person",
    properties=[
        {"name": "phone", "type": "string", "value": "+1 555 0100"},
        {"name": "next_visit", "type": "date", "value": "2026-11-04"},
        {"name": "website", "type": "url", "value": "https://example-dental.test"},
    ],
    tags=["health", "provider"],
)
uuid = saved.get("objectUuid") or (saved.get("object") or {}).get("uuid") or saved.get("uuid")

dentist = client.hydrate(uuid)
print(dentist.phone)
print(dentist.next_visit)
print(dentist.type())
print(dentist.explain("phone"))
```

Property types the server accepts: `string`, `number`, `number-span`, `date`,
`timespan`, `url`, and `concept_ref` (a reference to another concept by its
UUID, which is how objects link to each other).

Behind the scenes each property value became its own concept with a history, so
later you can ask who set the phone number and what it was before. The guide
to reading objects this way, including contested values and "which category
supplied this member", is [The duck-typed ORM](DUCK-TYPED-ORM.md).

To update, call `upsert_object` again with the same title and category. It
writes a new version; the old one stays in the lineage. To read the raw record
instead of the duck-typed view, use `get_object(uuid)`.

## 8. Search everything by meaning

`search_knowledge` searches objects, concepts and stored documents together
and tells you what kind of thing each hit is.

```js
const found = await client.search_knowledge({ query: 'who looks after my teeth', top_k: 5 });
for (const r of found.results) console.log(r.kind, r.score.toFixed(2), r.title);
```

```python
found = client.search_knowledge("who looks after my teeth", top_k=5)
for r in found["results"]:
    print(r["kind"], round(r["score"], 2), r["title"])
```

Each result carries `kind` (`concept`, `object` or `episode`), a `score`, the
`uuid`, a `title` and `summary`, and where relevant the `category` and an
`excerpt`. With a real embedding model on the server this finds "Dr. Lee" from
"who looks after my teeth"; with the text fallback it needs a shared word.

## 9. Feed it a sentence instead of a triple

The **semantic memory** door takes natural language. The server keeps the
exact sentence as an immutable memory event, extracts the entities and claims
it can, links them back to the sentence as their source, and lets you recall
or ask later.

```js
await client.semantic_remember({
  text: 'My dentist is Dr. Lee and my next appointment is on the 4th of November.',
  speaker: 'user',
});

const recalled = await client.semantic_recall({ query: 'dentist appointment', top_k: 5 });
console.log(JSON.stringify(recalled, null, 2));
```

```python
client.semantic_remember(
    text="My dentist is Dr. Lee and my next appointment is on the 4th of November.",
    speaker="user",
)
print(client.semantic_recall("dentist appointment", top_k=5))
```

How much structure is extracted depends on the extractor configured on the
server. The hosted service uses a language model for extraction; a bare local
server uses a heuristic. Either way the original sentence is kept, so nothing
is lost even when extraction is shallow. If a later sentence corrects an
earlier one, send it through `semantic_correct` and the old claim is
superseded, not erased.

## 10. Keep private things private

Everything you wrote above belongs to the namespace `my-app` because of
`defaultOwnerUserId`. Another caller with a different identity cannot read it.
Public concepts such as "Mathematician" are shared by everyone.

Two rules to remember:

- A verified token **overrides** any owner header. A token for `bob` cannot
  read `alice`'s private objects by claiming to be `alice`.
- Without a token the identity is a soft header. Fine for a local server you
  control; on the hosted API, writes require a token.

You can mint, list and revoke tokens from the SDK too: `create_api_token`,
`list_api_tokens`, `revoke_api_token`. Token values are shown once at issue
and never stored by the server. The portal at
<https://knowshowgo.com/developers> does the same thing in a browser.

## 11. Run your own server

No database required for a first run; the in-memory backend is enough.

```bash
git clone https://github.com/lehelkovach/knowshowgo && cd knowshowgo
npm ci
PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start
# http://127.0.0.1:3000/health
```

Then point the client at it. No token is needed locally.

```js
const client = new KnowShowGoClient({
  baseUrl: 'http://127.0.0.1:3000',
  defaultOwnerUserId: 'me',
});
```

```python
client = KnowShowGoClient(base_url="http://127.0.0.1:3000", default_owner_user_id="me")
```

Or set `KSG_API_URL` in the environment and construct the client with no
`baseUrl`; the SDK resolves explicit argument, then `KSG_API_URL`, then
`KSG_PUBLIC_API_URL`, then `http://localhost:3000`.

An in-memory server forgets everything on restart and uses a text fallback
instead of embeddings. For a persistent local setup with ArangoDB and a real
embedding model, follow the server's
[`QUICKSTART.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/QUICKSTART.md).

## 12. Common mistakes

- **Nothing comes back from search.** On a server without an embedding model,
  search is a text match; use a word that appears in what you stored. Also
  check that you are reading under the same `defaultOwnerUserId` you wrote with.
- **401 on write.** The hosted API requires a bearer token for writes. Get one
  from the developer portal and pass it as `authToken`.
- **Two objects where you expected one.** `upsert_object` identifies an object
  by title within a category. Different title, different object. Same title,
  same category: a new version of the same object.
- **"Is this true?" returns unknown.** That is the correct answer when nothing
  relevant is stored. Store the fact, then ask again.
- **The duck-typed object has no such member.** `hydrate` exposes members the
  matched categories declare plus the values the object holds. Use `'name' in
  obj` to test, and `obj.explain('name')` to see who could have supplied it.

## Where next

- [API reference](API.md): every method, grouped by domain, JS and Python.
- [The duck-typed ORM](DUCK-TYPED-ORM.md): contested values, `as()`, `explain()`.
- Logic: `evaluate_logic_ir` checks a formal proposition against stored claims
  and answers true, false or unknown with the claims it consulted. The server's
  [`KNOWLEDGE-GRAPH-BUILD.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/KNOWLEDGE-GRAPH-BUILD.md)
  explains the semantics.
- Procedures: `create_procedure`, `get_procedure`, `search_procedures` store
  and find step graphs an agent can run. See the API reference.
- The server's [`ARCHITECTURE.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/ARCHITECTURE.md)
  for the whole design.
