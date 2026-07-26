# @lehelkovach/knowshowgo-client · `dev` (`0.2.6-dev`)

JS + Python SDK for the [KnowShowGo](https://github.com/lehelkovach/knowshowgo)
memory API. Used by [`osl-oc-agent` `dev`](https://github.com/lehelkovach/osl-oc-agent/tree/dev).

> **Not on npmjs.org** (E404). Install from GitHub or sibling `file:`.

## Documentation

| Doc | |
|---|---|
| This README | Install + try it |
| [`AGENTS.md`](AGENTS.md) | Commands, API prefixes, soft ACL |
| Server [QUICKSTART (`dev`)](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/QUICKSTART.md) | Run KSG |
| Server [CLIENT-SYNC (`dev`)](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/CLIENT-SYNC.md) | Pairing rules |

## Latest version

| | |
|---|---|
| **This tip** | **`dev` / `0.2.6-dev`** |
| **Pairs with KSG** | **`dev` / `0.2.6-dev`** |
| **Pairs with agent** | osl-oc-agent **`dev`** (`0.2.2-dev`) |
| **Last release** | **`v0.2.5-client`** on `main` |

## What’s new on `dev` (since `v0.2.5-client`)

Post-release integration tip. Stay version-paired with knowshowgo **`0.2.6-dev`**.

Shipped in **`v0.2.5-client`**: `topicApiPrefix` for topic/tag methods; pairs with server `v0.2.5`.

## Bugs / caveats

- Plain `npm install` fails without `--legacy-peer-deps` (peer `knowshowgo` unpublished)
- Soft owner identity only — not token auth

## In development

Whatever lands with knowshowgo **`dev`**. Stay version-paired.

## Live servers (this tip)

| Prefer | |
|---|---|
| **Local KSG `dev`** | `http://127.0.0.1:3000` |
| **Dev/demo VM** | `144.24.32.97` (often firewalled) |

| Released prod | use client **`main` / `v0.2.5-client`** |
|---|---|
| https://ksg.129.153.118.145.sslip.io/ | KSG **`v0.2.5`** on the VM |

## Try it

```bash
# Terminal 1
cd ../knowshowgo && git checkout dev && npm ci
PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start

# Terminal 2
git checkout dev
npm install --legacy-peer-deps
node --test js/client.test.mjs
```

```js
import { KnowShowGoClient } from './js/client.js';

const client = new KnowShowGoClient({
  baseUrl: 'http://127.0.0.1:3000',
  defaultOwnerUserId: 'my-namespace',
  prototypeApiPrefix: '/api2.0',
  topicApiPrefix: '/api2.0',
});

const hits = await client.search_concepts('Person', { top_k: 5 });
console.log(hits);
```

Git install:  
`npm i --legacy-peer-deps git+https://github.com/lehelkovach/knowshowgo-client.git#dev`
