# Getting started

This guide takes you from install to your first stored-and-recalled memory
against the KnowShowGo (KSG) API, in either JavaScript or Python.

## 1. Prerequisites

- **JavaScript:** Node.js >= 18 (uses the built-in `fetch`).
- **Python:** Python 3.8+ and the `requests` package.
- A reachable KSG service. Use the hosted API at `https://api.knowshowgo.com`,
  or run one locally (see [Run a local server](#5-run-a-local-server)).

## 2. Install

```bash
# JavaScript, from the registry
npm install @lehelkovach/knowshowgo-client --legacy-peer-deps

# or pin a release tag
npm install --legacy-peer-deps \
  git+https://github.com/lehelkovach/knowshowgo-client.git#v0.2.8-client
```

The `--legacy-peer-deps` flag is required because the peer package `knowshowgo`
(the server) is not published to npm. The SDK's only runtime dependency is
`node-fetch` (a fallback for older runtimes).

```bash
# Python
pip install requests
# then vendor python/client.py, or add this repo as a git submodule
```

## 3. Create a client

```js
import { KnowShowGoClient } from '@lehelkovach/knowshowgo-client';

const client = KnowShowGoClient.publicApi({
  defaultOwnerUserId: 'my-app', // scopes private reads/writes to this namespace
});
```

```python
from client import KnowShowGoClient

client = KnowShowGoClient.public_api(default_owner_user_id="my-app")
```

If you prefer environment configuration, set `KSG_API_URL` and construct with no
base URL:

```bash
export KSG_API_URL=https://api.knowshowgo.com
```

```js
const client = new KnowShowGoClient({ defaultOwnerUserId: 'my-app' });
```

## 4. Verify the server (optional but recommended)

`connect()` reads `GET /api/release` and checks the channel/release match, so you
fail fast against an unexpected server:

```js
const manifest = await client.connect({
  expected_channel: 'release',
  expected_release: 'v0.2.8',
});
console.log(manifest.version, manifest.api.publicBaseUrl);
```

```python
manifest = client.connect(expected_channel="release", expected_release="v0.2.8")
print(manifest["version"], manifest["api"]["publicBaseUrl"])
```

Pass `adopt_advertised_base_url: true` to re-point the client at the host the
manifest advertises.

## 5. Store and recall

The simplest durable memory is an **assertion** (subject-predicate-object):

```js
await client.create_assertion({
  subject: 'Ada Lovelace',
  predicate: 'is_a',
  obj: 'Mathematician',
  source: 'my-app',
});

const hits = await client.search_concepts('mathematician', { top_k: 5 });
console.log(hits);
```

```python
client.create_assertion(
    subject="Ada Lovelace", predicate="is_a", obj="Mathematician", source="my-app"
)
print(client.search_concepts("mathematician", top_k=5))
```

For richer, schema-typed data use **objects** and **object categories**; see the
[API reference](API.md).

## 6. Run a local server

No Docker needed for the in-memory backend:

```bash
git clone https://github.com/lehelkovach/knowshowgo && cd knowshowgo
git checkout v0.2.8 && npm ci
PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start
# -> http://127.0.0.1:3000/health
```

Then point the client at it:

```js
const client = new KnowShowGoClient({ baseUrl: 'http://127.0.0.1:3000' });
```

## 7. Private vs public data

KSG separates a public commons from private owner data. When you set
`defaultOwnerUserId`, private nodes you write are only readable by that identity,
and list/search/get calls are scoped to it. This is **soft** identity today
(`X-KSG-Owner` header); signed bearer tokens are the hard-identity follow-up. See
the server [`PUBLIC-API.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/PUBLIC-API.md).

## Next steps

- [API reference](API.md) — every method, grouped by domain, JS + Python.
- Server [runbook](https://github.com/lehelkovach/knowshowgo/blob/main/docs/PUBLIC-API.md).
- [Pairing rules](https://github.com/lehelkovach/knowshowgo/blob/main/docs/CLIENT-SYNC.md).
