# @lehelkovach/knowshowgo-client · `main` (`v0.2.7-client`)

> **Cold start:** This is the **SDK** for the KnowShowGo memory API. Product MVP lives in
> [`osl-oc-agent`](https://github.com/lehelkovach/osl-oc-agent). Server:
> [`knowshowgo` `v0.2.5`](https://github.com/lehelkovach/knowshowgo).

JS + Python client for KnowShowGo **`v0.2.7`** — including the hosted public API.

> **Not on npmjs.org** (E404). Install from GitHub tag or sibling `file:`.

## MVP at a glance (for reviewers)

| | |
|---|---|
| **This repo’s job** | Typed HTTP wrappers (JS + Python) over KSG REST — ACL headers, `/api2.0` prefixes |
| **Pairs with** | knowshowgo **`v0.2.5`** · agent **`v0.2.1`** |
| **This tip** | **`main` / `v0.2.5-client`** (`package.json` `0.2.5`) |
| **Live dogfood** | https://knowshowgo.com/ |
| **Next tip** | **`dev` / `0.2.8-dev`** |

### Coverage (high level)

Topics/tags, object categories, objects, concepts, assertions, procedures, prototypes
(generalize/match/search/exemplars), release `connect()`, soft owner identity
(`X-KSG-Owner` / `X-KSG-Session`).

### Not this package

- No chat UI, no browser automation, no DNS/domain tools — those are **osl-oc-agent**
- Not a public npm publish (peer `knowshowgo` is private/unpublished)

## Documentation

| Doc | |
|---|---|
| This README | Install + try it |
| [`AGENTS.md`](AGENTS.md) | Commands, `connect()`, envs |
| Server [QUICKSTART](https://github.com/lehelkovach/knowshowgo/blob/main/docs/QUICKSTART.md) | Run KSG |
| Server [CLIENT-SYNC](https://github.com/lehelkovach/knowshowgo/blob/main/docs/CLIENT-SYNC.md) | Pairing rules |
| Agent [README](https://github.com/lehelkovach/osl-oc-agent/blob/main/README.md) | Product MVP |

## Website & demos

https://knowshowgo.com/demo/


## Public hosted API

```js
import { KnowShowGoClient, PUBLIC_API_BASE_URL } from '@lehelkovach/knowshowgo-client';

// Explicit host…
const a = new KnowShowGoClient({ baseUrl: PUBLIC_API_BASE_URL, defaultOwnerUserId: 'my-ns' });
// …or the helper…
const b = KnowShowGoClient.publicApi({ defaultOwnerUserId: 'my-ns' });
// …or just set KSG_API_URL and construct with no baseUrl.
const c = new KnowShowGoClient({ defaultOwnerUserId: 'my-ns' });
```

Base URL resolution: explicit `baseUrl` → `KSG_API_URL` → `KSG_PUBLIC_API_URL` → `http://localhost:3000`.

To follow whatever host the service advertises:

```js
await client.connect({ adopt_advertised_base_url: true });
// client.baseUrl is now manifest.api.publicBaseUrl
```

Python:

```python
from client import KnowShowGoClient
client = KnowShowGoClient.public_api(default_owner_user_id="my-ns")
client.connect(expected_channel="release", expected_release="v0.2.7")
```

Server runbook: [knowshowgo PUBLIC-API.md](https://github.com/lehelkovach/knowshowgo/blob/main/docs/PUBLIC-API.md).


## Try it

```bash
cd ../knowshowgo && git checkout v0.2.7 && npm ci
PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start
# other terminal:
npm i --legacy-peer-deps git+https://github.com/lehelkovach/knowshowgo-client.git#v0.2.7-client
node --test js/client.test.mjs
python3 -m unittest discover -s python -p 'test_*.py'
```

For live services, call `connect({ expected_channel: 'release', expected_release: 'v0.2.7' })`.
