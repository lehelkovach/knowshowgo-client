# @lehelkovach/knowshowgo-client

Official **JavaScript** and **Python** client SDKs for the
[KnowShowGo](https://github.com/lehelkovach/knowshowgo) semantic-memory API.

KnowShowGo (KSG) is a durable memory service: typed objects, assertions,
embeddings, topics/tags, prototypes, and procedure graphs behind a REST API.
This package gives you typed wrappers over that API so you never hand-roll HTTP,
prefixes, or identity headers.

- **New here?** Start with [What is KnowShowGo?](docs/WHAT-IS-KNOWSHOWGO.md) —
  what it is for, how it differs from a database or a vector store, and what
  people build with it. No code.
- **Hosted API:** `https://api.knowshowgo.com` · tokens from <https://knowshowgo.com/developers>
- **Docs:** [Getting started](docs/GETTING-STARTED.md) (hands-on, JS + Python) · [API reference](docs/API.md) · [The duck-typed ORM](docs/DUCK-TYPED-ORM.md)
- **Server:** [`knowshowgo`](https://github.com/lehelkovach/knowshowgo) · runbook [`PUBLIC-API.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/PUBLIC-API.md)

---

## Install

This package is a remote REST client — it does **not** depend on the
`knowshowgo` server package.

```bash
npm install @lehelkovach/knowshowgo-client

# or pin a release tag from https://github.com/lehelkovach/knowshowgo-client/tags
npm install git+https://github.com/lehelkovach/knowshowgo-client.git#<tag>
```

Python (package `knowshowgo_client`, depends on `requests`):

```bash
pip install knowshowgo-client
# or from a release tag:
# pip install "git+https://github.com/lehelkovach/knowshowgo-client.git@<tag>#subdirectory=python"
```

Requirements: **Node >= 18** (built-in `fetch`) or Python 3.8+ with `requests`.

---

## Quick start (JavaScript)

```js
import { KnowShowGoClient } from '@lehelkovach/knowshowgo-client';

// Talk to the hosted API; scope reads/writes to your namespace.
const client = KnowShowGoClient.publicApi({
  defaultOwnerUserId: 'my-app',
  authToken: process.env.KSG_API_TOKEN, // or accessToken / tokenProvider
});

// Optional: verify you match the server you expect.
// Optional pin — bare connect() accepts whatever the server advertises:
await client.connect();
// await client.connect({ expected_channel: 'release', expected_release: 'v0.2.8' });

// Store a fact, then read back what is currently believed about its subject.
await client.create_assertion({
  subject: 'Ada Lovelace',
  predicate: 'is_a',
  obj: 'Mathematician',
  source: 'my-app',
});

console.log(await client.get_snapshot('Ada Lovelace')); // { is_a: 'Mathematician' }
```

## Quick start (Python)

```python
from knowshowgo_client import KnowShowGoClient

client = KnowShowGoClient.public_api(default_owner_user_id="my-app")
client.connect()  # pin with expected_release="vX.Y.Z" if you want to assert the server

client.create_assertion(
    subject="Ada Lovelace", predicate="is_a", obj="Mathematician", source="my-app"
)
print(client.get_snapshot("Ada Lovelace"))  # {'is_a': 'Mathematician'}
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
It is **soft** identity (a follow-up adds signed bearer tokens); see the server
[`PUBLIC-API.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/PUBLIC-API.md)
for the token story.

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
npm install
node --test js/client.test.mjs                       # JS unit tests (Node runner)
python3 -m unittest discover -s python -p 'test_*.py' # Python unit tests
npm run build                                         # esbuild bundle -> dist/
```

Note: `npm test` maps to the Node built-in test runner, not jest.

---

## Versions

The client version is `package.json` on this branch (`python/pyproject.toml`
carries the same number). Client and server pair by version: `main` ↔ server
`main`, `dev` ↔ server `dev`, and a release tag `vX.Y.Z-client` pairs with
server `vX.Y.Z`. The live server reports what it runs at `GET /api/release`.
The pairing law is the server's
[`VERSION-MATRIX.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/VERSION-MATRIX.md);
numbers are deliberately not restated here, because a table like that went
nine releases stale.

## License

[MIT](LICENSE) © Lehel Kovach
