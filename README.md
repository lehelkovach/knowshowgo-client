# @lehelkovach/knowshowgo-client · `dev` (`0.2.5-dev`)

JS + Python SDKs for [KnowShowGo](https://github.com/lehelkovach/knowshowgo)
**`dev`**. Used by [`osl-oc-agent` `dev`](https://github.com/lehelkovach/osl-oc-agent/tree/dev).

> **Not on npmjs.org** (E404). Install from GitHub `dev` / tag or sibling `file:`.

## Install

```bash
npm install --legacy-peer-deps   # when depended on via file:../knowshowgo-client
# or track integration tip:
npm i --legacy-peer-deps git+https://github.com/lehelkovach/knowshowgo-client.git#dev
```

| This tip | Pairs with KSG |
|--------|----------------|
| **`dev` / `0.2.5-dev`** | knowshowgo **`dev` / `0.2.5-dev`** |

Release SDK: branch **`main`** / tag **`v0.2.4-client`**.

## Quick start

```bash
# Terminal 1 — KSG service on its `dev` tip
cd ../knowshowgo && git checkout dev && npm ci
PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start

# Terminal 2 — this repo (`dev`)
npm install --legacy-peer-deps
node --test js/client.test.mjs
```

```js
import { KnowShowGoClient } from './js/client.js';

const client = new KnowShowGoClient({
  baseUrl: 'http://127.0.0.1:3000',          // local; or firewalled dev VM
  defaultOwnerUserId: 'my-namespace',
});
console.log(await client.search_concepts({ query: 'Person', limit: 5 }));
```

**Environments for this tip:** local `:3000` (preferred) or KSG on dev/demo VM
`144.24.32.97`. Prod https://ksg.129.153.118.145.sslip.io/ is **`v0.2.4`** —
use client **`main`** against that.

Defaults: **`/api2.0`** (see [`AGENTS.md`](AGENTS.md)).

## Docs

| Doc | |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Commands, prefixes, ACL |
| Server [QUICKSTART (`dev`)](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/QUICKSTART.md) | Run KSG `dev` |
| Server [CLIENT-SYNC (`dev`)](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/CLIENT-SYNC.md) | Pairing |
