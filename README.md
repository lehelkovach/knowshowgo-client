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
await client.create_assertion({ subject: 'me', predicate: 'allergy', obj: 'peanuts', source: 'my-app', security_class: 'private' }); // read back only by this owner
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
| [**Using the API: one guide**](docs/USING-THE-API.md) | Everything in one page: what it is from the bottom, identity, create/read/update/delete for every primitive, recipes for agent memory, app records, topic registries, ontologies, logic and procedures, a section for AI agents, and what is designed vs how it works today. |
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
| [**What KnowShowGo can do**](#what-knowshowgo-can-do) | Every server capability, when an agent should use it, one example each. |
| [**API reference**](docs/API.md) | Every method, grouped by domain, JS and Python. |
| Live API | `https://api.knowshowgo.com` · manifest at `GET /api/release` · tokens at <https://knowshowgo.com/developers> |
| MCP | `POST https://api.knowshowgo.com/mcp` serves the memory tools (`remember`, `ask`, `recall`, …) to Claude Code, Cursor and any MCP client with the same token. Setup and tool list: [`docs/MCP.md`](docs/MCP.md). |
| Demos | <https://knowshowgo.com/demo/> · taxonomy of prototypes at <https://knowshowgo.com/taxonomy/> |
| Tour | [`examples/tour.mjs`](examples/tour.mjs): the SDK end to end with fake data, against any running server ([how to run it](examples/README.md)) |
| Plans | Rung status: [`docs/DEV-LADDER.md`](docs/DEV-LADDER.md). What runs next: the Sprint queue in osl-oc-agent [`docs/IDEAS-BACKLOG.md`](https://github.com/lehelkovach/osl-oc-agent/blob/dev/docs/IDEAS-BACKLOG.md) |

---

## What KnowShowGo can do

One row per server capability, generated from the same manifest the server
checks itself against ([`js/capabilities.json`](js/capabilities.json), a copy of
knowshowgo `src/capabilities.json`; every route, its token rule and client
method is in the server's `docs/API-ROUTES.md`). `js/capabilities_contract.test.mjs`
fails when a capability here has no method, no doc line or no row. Examples use
fake data. `c` is a client; `avery` is `c.for_owner({ auth_token: averyToken })`.

| Capability | When to use it | Example |
|---|---|---|
| Release (`release`) | Once at start: version and the server's capability ids | `(await c.get_release_manifest()).capabilities.ids` |
| Owner tokens (`auth-tokens`, `kt1-tokens`) | One token per owner on every call; a 401 means a missing or revoked token, never retry anonymously | `const avery = c.for_owner({ auth_token: averyToken, owner_user_id: 'avery' })` |
| Semantic memory (`semantic-memory`) | Remember what the user said; recall or ask before answering | `await avery.semantic_remember({ text: 'I moved to Contoso in March.' })` |
| Episodes and events (`episodes-events`) | Record what happened as typed roles; recall similar situations before planning | `await avery.recall_episodes({ pattern: [{ subject: '?e', predicate: 'action', object: 'onboard' }] })` |
| Facts (`facts`) | A user statement as a fact; a model guess stays a candidate until confirmed | `await avery.add_fact({ subject: 'Avery Example', predicate: 'employer', obj: 'Contoso' })` |
| Assertions (`assertions`) | Reinforce, contradict or retract an existing claim with a reason | `await avery.reinforce_assertion({ subject: 'Contoso', predicate: 'hq', obj: 'Example City' })` |
| Why and contradictions (`why1-derivation`, `ksg2-contradictions`) | Before relying on a value, ask why it is believed (sources, tiers, versions, status); review disagreements as a queue and resolve by a new version | `(await avery.explain_claim(claimUuid)).why.status` · `await avery.list_contradictions()` |
| Propositions and proposals (`propositions`, `kg-p1`, `ce3d-proposals`) | Every relational claim, over concept uuids; a model inference is a proposal (`source: 'llm:…'`), never a fact | `await avery.assert_proposition({ subject: 'Contoso', subject_prototype: 'Organization', predicate: 'website', value: 'https://contoso.example.test', source: 'llm:planner' })` |
| Typed values (`typed-properties`, `kv1-value-types`) | Read a property's type before writing; declare a missing one | `await c.declare_predicate({ name: 'founded', value_type: 'date' })` |
| Articles and versions (`articles`, `tb2-versions`) | Read a topic with every version of every value; amend, never overwrite | `await avery.amend_article(contosoUuid, { predicate: 'founded', value_type: 'date', value: '2001-04-01', replaces_claim: oldClaimUuid })` |
| Concepts and lookup (`concepts`, `ce3a-wikidata`, `ce3c-conceptnet`) | Resolve a name before creating; look a public term up (Wikidata links and ConceptNet `commonly_a`, both attributed) | `await c.resolve_concept({ label: 'Contoso' }); await c.lookup_concept({ term: 'supplier portal' })` |
| Topics and tags (`topics-tags`) | Resolve a free-text tag to a topic before making a new one | `await c.resolve_topic_tag({ tag: 'vendor onboarding' })` |
| Knowledge search (`knowledge-search`, `kl2-vector-search`) | A fuzzy question across concepts and objects (vector rows) | `await avery.search_knowledge({ query: 'Contoso tax form' })` |
| Verification (`verification`) | Check an answer against stored evidence before stating it; "unknown" means say so | `await avery.verify_answer({ claims: [{ subject: 'Contoso', predicate: 'hq', object: 'Example City' }] })` |
| Entities (`entities`) | "Why do you think that?": evidence and explanation for one thing | `await avery.explain_entity(contosoUuid, { predicate: 'hq' })` |
| Logic (`logic`, `bind-pattern`, `close-relation`, `evaluate-joins`) | Prefer `bind_pattern` over free text for relational questions; closure for chains; joins across relations | `await avery.bind_pattern({ pattern: [{ subject: '?p', predicate: 'employer', object: 'Contoso' }] })` |
| Prototypes (`prototypes`, `match-prototypes`, `check-membership`, `sx1-exemplars`) | Type an unknown thing (ranked, with typicality); membership needs evidence | `await c.match_prototypes({ object: { label: 'Contoso', properties: { website: 'https://contoso.example.test' } } })` |
| Taxonomy (`taxonomy`, `taxonomy-reader`, `dh1-supersede`) | Browse categories and what one means; check duplicates before seeding (duplicates are superseded, never deleted) | `await c.get_taxonomy_prototype(organizationUuid)` |
| Objects (`objects`) | A record with a stable identity (a company, a portal) | `await avery.upsert_object({ title: 'Contoso supplier portal', category_name: 'WebSite' })` |
| Procedures (`procedures`, `kl1-procedure-search`, `rp1-retired-opt-in`) | Recall verified procedures (retired only to audit; follow `replacedBy`); record every run with an independent signal | `await avery.search_verified_procedures({ goal: 'register as a supplier', site: 'portal.example.test' })` |
| Social (`social`) | Multi-agent or marketplace flows only | `await c.post_channel_message({ channel_tag: 'suppliers', actor_id: 'agent-1', message: 'Contoso registered' })` |
| Private vault (`private-vaults`) | Owner-only payment records, through an approval gate | `await avery.lookup_private_payment()` |
| Feedback (`feedback`) | File a ticket when KSG answers wrongly (MCP `feedback` tool) | — |

Operator-only capabilities (seeds including `schemaorg-seed`, admin and ops)
have no client methods; the server's `docs/CAPABILITIES.md` lists them.

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
- **Procedures as graphs**, searchable, versioned, repairable, with recorded
  runs and a lifecycle state earned from verified outcomes.
- **Events and episodes** with typed roles, recalled by structure.
- **Rules** as versioned graph objects, checked against members with recorded
  derivations.
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
[`AGENTS.md`](AGENTS.md). An AI agent reading this repository should start at
[`llms.txt`](llms.txt).

## License

[MIT](LICENSE) © Lehel Kovach
