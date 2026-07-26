# @lehelkovach/knowshowgo-client · `main` (`v0.2.4-client`)

JS + Python SDK for the [KnowShowGo](https://github.com/lehelkovach/knowshowgo)
**`v0.2.4`** memory API. Used by
[`osl-oc-agent` `v0.2.0`](https://github.com/lehelkovach/osl-oc-agent/tree/main).

> **Not on npmjs.org** (E404). Install from GitHub tag or sibling `file:`.

## Documentation

| Doc | |
|---|---|
| This README | Install + try it |
| [`AGENTS.md`](AGENTS.md) | Commands, API prefixes, soft ACL |
| Server [QUICKSTART (`main`)](https://github.com/lehelkovach/knowshowgo/blob/main/docs/QUICKSTART.md) | Run KSG release |
| Server [CLIENT-SYNC (`main`)](https://github.com/lehelkovach/knowshowgo/blob/main/docs/CLIENT-SYNC.md) | Pairing rules |

## Latest version

| | |
|---|---|
| **This tip** | **`main` / `v0.2.4-client`** (`0.2.4`) |
| **Pairs with KSG** | **`main` / `v0.2.4`** |
| **Pairs with agent** | osl-oc-agent **`v0.2.0`** |
| **Integration tip** | client **`dev` / `0.2.5-dev`** |

## What’s new in `v0.2.4-client`

- Soft owner identity: `defaultOwnerUserId` / `X-KSG-Owner` (matches server ACL)
- Prototype helpers defaulting to **`/api2.0`**
- Release handshake against `surfaces.mvp`

## Bugs / caveats

- Need `--legacy-peer-deps` (peer package unpublished)
- Soft identity only

## In development

On **`dev`**: `topicApiPrefix`, tracking server `0.2.5-dev`. See the **`dev`** README.

## Live servers (this tip)

| Prefer | |
|---|---|
| **Prod** | https://ksg.129.153.118.145.sslip.io/ (KSG **`v0.2.4`**) |
| **Local KSG `main`** | `http://127.0.0.1:3000` |

| Integration | use client **`dev`** |
|---|---|
| Dev/demo `144.24.32.97` | firewalled |

## Try it

```bash
# Terminal 1
cd ../knowshowgo && git checkout main && npm ci
PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start

# Terminal 2
git checkout main
npm install --legacy-peer-deps
node --test js/client.test.mjs
```

```js
import { KnowShowGoClient } from './js/client.js';

const client = new KnowShowGoClient({
  baseUrl: 'http://127.0.0.1:3000',
  defaultOwnerUserId: 'my-namespace',
});

const hits = await client.search_concepts('Person', { top_k: 5 });
console.log(hits);
```

Git install:  
`npm i --legacy-peer-deps git+https://github.com/lehelkovach/knowshowgo-client.git#v0.2.4-client`
