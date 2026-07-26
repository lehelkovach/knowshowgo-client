# @lehelkovach/knowshowgo-client · `main` (`v0.2.4-client`)

JS + Python SDKs for [KnowShowGo](https://github.com/lehelkovach/knowshowgo)
**`v0.2.4`**. Used by [`osl-oc-agent` `main`](https://github.com/lehelkovach/osl-oc-agent/tree/main).

> **Not on npmjs.org** (E404). Install from GitHub tag or sibling `file:`.

## Install

```bash
npm i --legacy-peer-deps git+https://github.com/lehelkovach/knowshowgo-client.git#v0.2.4-client
# sibling:
npm install --legacy-peer-deps
```

| This tip | Pairs with KSG |
|--------|----------------|
| **`main` / `v0.2.4-client`** | knowshowgo **`main` / `v0.2.4`** |

Integration SDK: branch **`dev`** / `0.2.5-dev`.

## Quick start

```bash
# Terminal 1 — KSG service on its `main` / v0.2.4 tip
cd ../knowshowgo && git checkout main && npm ci
PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start

# Terminal 2 — this repo (`main`)
npm install --legacy-peer-deps
node --test js/client.test.mjs
```

```js
import { KnowShowGoClient } from './js/client.js';

const client = new KnowShowGoClient({
  baseUrl: 'http://127.0.0.1:3000',
  defaultOwnerUserId: 'my-namespace',
});
console.log(await client.search_concepts({ query: 'Person', limit: 5 }));
```

**Environments for this tip:** local `:3000` (this release) or **prod**
https://ksg.129.153.118.145.sslip.io/ (KSG on VM `127.0.0.1:8080` = **`v0.2.4`**).
Dev/demo VM `144.24.32.97` tracks **`dev`** — use client `dev` there.

## Docs

| Doc | |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Commands, prefixes, ACL |
| Server [QUICKSTART (`main`)](https://github.com/lehelkovach/knowshowgo/blob/main/docs/QUICKSTART.md) | Run KSG release |
| Server [CLIENT-SYNC (`main`)](https://github.com/lehelkovach/knowshowgo/blob/main/docs/CLIENT-SYNC.md) | Pairing |
