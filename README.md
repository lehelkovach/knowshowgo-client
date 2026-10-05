# KnowShowGo client

**JavaScript and Python SDKs for [KnowShowGo](https://knowshowgo.com): a
semantic knowledge graph where concepts have stable identities, categories
are fuzzy prototypes, every fact carries its source and history, procedures
are data, and claims can be checked as logic.**

Store what you know, who said it, and how to do things. Read it back by
meaning, as typed objects, or as evidence. Let an AI model write to it and
read from it without letting the model *be* the memory.

```js
import { KnowShowGoClient } from '@lehelkovach/knowshowgo-client';

const client = KnowShowGoClient.publicApi({
  defaultOwnerUserId: 'my-app',
  authToken: process.env.KSG_API_TOKEN,   // https://knowshowgo.com/developers
});
await client.connect();

await client.create_assertion({ subject: 'Ada Lovelace', predicate: 'is_a', obj: 'Mathematician', source: 'my-app' });
await client.get_snapshot('Ada Lovelace');            // { is_a: 'Mathematician' }

const saved = await client.upsert_object({
  title: 'Dr. Lee', category_name: 'Dentist', parent_category_name: 'Person',
  properties: [{ name: 'phone', type: 'string', value: '+1 555 0100' }],
});
const dentist = await client.hydrate(saved.objectUuid);
dentist.phone;                                        // '+1 555 0100' — a plain object, no await
dentist.type();                                       // strongest category match, with a score
dentist.explain('phone');                             // which category defined it, and who else could have
```

```python
from knowshowgo_client import KnowShowGoClient
client = KnowShowGoClient.public_api(default_owner_user_id="my-app", auth_token=os.environ["KSG_API_TOKEN"])
client.connect()
```

---

## Documentation

| Start here | |
|---|---|
| [**What is KnowShowGo?**](docs/WHAT-IS-KNOWSHOWGO.md) | The problem, the idea, the use cases. Plain language, no code. |
| [**Installation**](docs/INSTALL.md) | npm, pip, choosing a server, configuration, troubleshooting. |
| [**Getting started**](docs/GETTING-STARTED.md) | A fifteen-minute hands-on tour, JavaScript and Python side by side. |
| [**The bare bones**](docs/BASICS.md) | Concept → prototype → ontology → object → version → claim → belief → logic, in code, from the atom up. |

| Understand the model | |
|---|---|
| [**Concepts**](docs/CONCEPTS.md) | The primitives: concepts, categories, objects, properties, assertions and beliefs, episodes, procedures, Logic IR. Which calls touch each. |
| [**Use cases**](docs/USE-CASES.md) | Eleven things people build, each mapped to the calls it uses. |
| [**Prototypes and casting**](docs/PROTOTYPES-AND-CASTING.md) | Fuzzy categories, resemblance vs contract matching, duck-typed objects, `as()`, explicit cast. |
| [**Procedures and logic**](docs/PROCEDURES-AND-LOGIC.md) | Step graphs (DAGs), Logic IR, truth vs shape, recorded derivations. |
| [**The duck-typed ORM**](docs/DUCK-TYPED-ORM.md) | The full `KSGObject` surface and why hydration is one request. |

| Reference | |
|---|---|
| [**API reference**](docs/API.md) | Every method, grouped by domain, JS and Python. |
| Live API | `https://api.knowshowgo.com` · manifest at `GET /api/release` · tokens at <https://knowshowgo.com/developers> |
| Demos | <https://knowshowgo.com/demo/> |

---

## Install

```bash
npm install @lehelkovach/knowshowgo-client      # Node 18+
pip install knowshowgo-client                   # Python 3.8+, depends on requests
```

Registry publication is in progress; until the first version appears, install
from GitHub (`git+https://github.com/lehelkovach/knowshowgo-client.git#dev`, or
a tag from the [tags page](https://github.com/lehelkovach/knowshowgo-client/tags)).
Details and a local-server option: [Installation](docs/INSTALL.md).

## What you get

- **Concepts all the way down.** Any text is tokenized into concepts;
  categories, objects, property values, claims and even logical derivations
  are the same kind of node, with a permanent UUID, versions and provenance.
- **One identity per concept.** Spellings and synonyms resolve to one node.
- **Fuzzy categories.** Things match prototypes with a score, several at once;
  typicality and membership are kept apart.
- **Facts with sources, beliefs as views.** Competing claims live side by side;
  the current best value comes back with its alternatives and speakers.
- **Objects you can read like objects.** `hydrate()` returns a duck-typed
  object with synchronous members, `type()`, `explain()`, and `as()`.
- **Search by meaning** across concepts, objects and episodes.
- **Procedures as graphs**, searchable, versioned, repairable.
- **Logic you can audit.** Propositions bound to concept UUIDs, three-valued
  evaluation over stored claims, recorded derivations.
- **Private and public.** Owner-scoped data behind bearer tokens; a shared
  public commons of concepts.

## What this package is, and is not

- **Is:** typed REST wrappers for both languages, base-URL and identity
  handling, a release-manifest handshake, and the duck-typed object layer.
- **Is not:** a database you embed, an LLM, or a chat agent. It always talks
  to a KnowShowGo service, hosted or your own.

## Versions

The client version is `package.json` on this branch (`python/pyproject.toml`
carries the same number). Clients pair with servers by version: `main` with
`main`, `dev` with `dev`, and a tag `vX.Y.Z-client` with server `vX.Y.Z`. The
live server reports what it runs at `GET /api/release`. New methods land under
`/api2.0`; `/api` stays as a compatible alias.

## Development

```bash
npm install
node --test js/client.test.mjs js/ksg_object.test.mjs js/client.timeout.test.mjs
python3 -m unittest discover -s python/tests -p 'test_*.py'
npm run build                                   # esbuild bundle -> dist/
KSG_LIVE_URL=http://127.0.0.1:3000 node --test js/ksg_object_live.test.mjs   # against a real server
```

Branch from `dev`, open pull requests into `dev`. Contributor notes are in
[`AGENTS.md`](AGENTS.md).

## License

[MIT](LICENSE) © Lehel Kovach
