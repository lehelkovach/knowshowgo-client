# @lehelkovach/knowshowgo-client

Official **JavaScript** and **Python** client SDKs for the
[KnowShowGo](https://github.com/lehelkovach/knowshowgo) semantic-memory API.

KnowShowGo (KSG) is a durable memory service: typed objects, assertions,
embeddings, topics/tags, prototypes, and procedure graphs behind a REST API.
This package gives you typed wrappers over that API so you never hand-roll HTTP,
prefixes, or identity headers.

- **Hosted API:** `https://api.knowshowgo.com`
- **Docs:** [Getting started](docs/GETTING-STARTED.md) · [API reference](docs/API.md)
- **Server:** [`knowshowgo`](https://github.com/lehelkovach/knowshowgo) · runbook [`PUBLIC-API.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/PUBLIC-API.md)

---

## Install

The peer package `knowshowgo` (the server) is not published to npm, so install
with `--legacy-peer-deps` (or from a tag):

```bash
# from the published registry
npm install @lehelkovach/knowshowgo-client --legacy-peer-deps

# or pin to a release tag from GitHub (current tag: see VERSION-MATRIX)
npm install --legacy-peer-deps \
  git+https://github.com/lehelkovach/knowshowgo-client.git#v0.2.8-client
```

Python (single-file client, needs `requests`):

```bash
pip install requests
# then copy python/client.py into your project, or add this repo as a submodule
```

Requirements: **Node >= 18** (built-in `fetch`) or Python 3.8+ with `requests`.

---

## Quick start (JavaScript)

```js
import { KnowShowGoClient } from '@lehelkovach/knowshowgo-client';

// Talk to the hosted API; scope reads/writes to your namespace.
const client = KnowShowGoClient.publicApi({ defaultOwnerUserId: 'my-app' });

// Optional: verify you match the server you expect.
// Omit expected_release to accept whatever the service advertises.
await client.connect({ expected_channel: 'release' });

// Store a fact, then search it back.
await client.create_assertion({
  subject: 'Ada Lovelace',
  predicate: 'is_a',
  obj: 'Mathematician',
  source: 'my-app',
});

const hits = await client.search_concepts('mathematician', { top_k: 5 });
console.log(hits);
```

## Quick start (Python)

```python
from client import KnowShowGoClient

client = KnowShowGoClient.public_api(default_owner_user_id="my-app")
client.connect(expected_channel="release")

client.create_assertion(
    subject="Ada Lovelace", predicate="is_a", obj="Mathematician", source="my-app"
)
print(client.search_concepts("mathematician", top_k=5))
```

---

## Choosing an endpoint

Base URL resolution order (both languages):

1. explicit `baseUrl` / `base_url` argument
2. `KSG_API_URL` environment variable
3. `KSG_PUBLIC_API_URL` environment variable
4. `http://localhost:3000` (local default)

```js
import { KnowShowGoClient, PUBLIC_API_BASE_URL } from '@lehelkovach/knowshowgo-client';

new KnowShowGoClient({ baseUrl: PUBLIC_API_BASE_URL });   // explicit hosted
KnowShowGoClient.publicApi();                              // same, via helper
new KnowShowGoClient();                                    // env or localhost
```

To follow whatever host the service advertises in its release manifest:

```js
await client.connect({ adopt_advertised_base_url: true });
// client.baseUrl is now manifest.api.publicBaseUrl
```

---

## Identity (soft owner ACL)

KSG separates a **public commons** from **private owner data**. Private nodes are
only readable by a caller whose identity matches the owner. Set an identity once
and every list/search/get is scoped to it:

```js
const client = KnowShowGoClient.publicApi({
  defaultOwnerUserId: 'user-123',
  defaultAgentSessionId: 'session-abc', // optional
});
```

This sends `X-KSG-Owner` / `X-KSG-Session` and fills `ownerUserId` on query/body.

It is **soft** identity: the caller supplies its own id, so it keeps honest callers in
their own namespace but is **not** a multi-tenant security boundary.

> **Known gap (P0).** The KSG service ships signed bearer tokens
> (`Authorization: Bearer ksg_…`, issued from the developer portal), but **this SDK
> cannot send them yet** — there is no `apiToken` option. Until that lands, SDK, agent,
> and Chrome callers are limited to soft identity even against a token-enabled server.
> Server side: [`PUBLIC-API.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/PUBLIC-API.md).

---

## API versioning

New feature endpoints live under the canonical `/api2.0` namespace; `/api`
stays as a backward-compatible alias. The client defaults to `/api2.0` and lets
you override per instance:

```js
new KnowShowGoClient({ prototypeApiPrefix: '/api', topicApiPrefix: '/api' });
```

Python: `prototype_api_prefix` / `topic_api_prefix`.

---

## What this package is (and isn't)

- **Is:** typed REST wrappers, base-URL resolution, soft-identity headers,
  release-contract `connect()`, JS + Python parity.
- **Isn't:** the chat agent, browser automation, or any UI — those live in
  [`osl-oc-agent`](https://github.com/lehelkovach/osl-oc-agent). Not an embedded
  database; it always talks to a KSG service.

---

## Development

```bash
npm install --legacy-peer-deps
node --test js/client.test.mjs                       # JS unit tests (Node runner)
python3 -m unittest discover -s python -p 'test_*.py' # Python unit tests
npm run build                                         # esbuild bundle -> dist/
```

Note: `npm test` maps to the Node built-in test runner, not jest.

---

## Versions

This repo's version is `package.json`; the cross-repo pairing table lives in one place:
[`VERSION-MATRIX.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/VERSION-MATRIX.md).
Pairing rules: [`CLIENT-SYNC.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/CLIENT-SYNC.md).

A running service reports its own contract at `GET /api/release` — trust that over any
number written in a README.

## License

[MIT](LICENSE) © Lehel Kovach
