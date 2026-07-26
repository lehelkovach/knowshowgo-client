# @lehelkovach/knowshowgo-client · `dev` (`0.2.7-dev`)

> **Cold start:** This is the **SDK** for the KnowShowGo memory API. Product MVP lives in
> [`osl-oc-agent` `dev`](https://github.com/lehelkovach/osl-oc-agent/tree/dev). Server:
> [`knowshowgo` `dev`](https://github.com/lehelkovach/knowshowgo/tree/dev).

JS + Python SDK for the KnowShowGo memory API. Used by
[`osl-oc-agent` `dev`](https://github.com/lehelkovach/osl-oc-agent/tree/dev).

> **Not on npmjs.org** (E404). Install from GitHub or sibling `file:`.

## MVP at a glance (for reviewers)

| | |
|---|---|
| **This repo’s job** | Typed HTTP wrappers (JS + Python) over KSG REST — ACL headers, `/api2.0` prefixes |
| **This tip** | **`dev` / `0.2.7-dev`** |
| **Pairs with** | knowshowgo **`dev` / `0.2.7-dev`** · agent **`dev` / `0.2.2-dev`** |
| **Last release** | **`v0.2.6-client`** on `main` |
| **Live prod** | https://ksg.129.153.118.145.sslip.io/ — use client **`main` / `v0.2.6-client`**, not this tip |

### Coverage (high level)

Same surface as `v0.2.6-client`, plus whatever lands with server `0.2.7-dev`
(`topicApiPrefix`, prototype prefixes, soft owner identity, `connect()` defaults for
channel **`dev`** / release **`v0.2.7-dev`**).

### Not this package

- No chat UI / browser / DNS tools — see **osl-oc-agent**
- Stay version-paired with knowshowgo **`dev`**

## Documentation

| Doc | |
|---|---|
| This README | Install + try it |
| [`AGENTS.md`](AGENTS.md) | Commands, API prefixes, soft ACL |
| Server [QUICKSTART (`dev`)](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/QUICKSTART.md) | Run KSG |
| Server [CLIENT-SYNC (`dev`)](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/CLIENT-SYNC.md) | Pairing rules |
| Agent [README (`dev`)](https://github.com/lehelkovach/osl-oc-agent/blob/dev/README.md) | Product MVP |

## What’s new on `dev` (since `v0.2.6-client`)

Post-release integration tip. Stay paired with knowshowgo **`0.2.7-dev`**.

Shipped in **`v0.2.6-client`**: `topicApiPrefix`; pairs with server `v0.2.6`.

## Website & demos

https://ksg.129.153.118.145.sslip.io/demo/


## Public API base URL

Explicit `baseUrl` → `KSG_API_URL` → `KSG_PUBLIC_API_URL` → `http://localhost:3000`.
Hosted: `KnowShowGoClient.publicApi()` / `PUBLIC_API_BASE_URL` (`https://api.knowshowgo.com`).
Server runbook: [PUBLIC-API.md](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/PUBLIC-API.md).

## Bugs / caveats

- Plain `npm install` fails without `--legacy-peer-deps` (peer `knowshowgo` unpublished)
- Soft owner identity only — not token auth

## Live servers (this tip)

| Prefer | |
|---|---|
| **Local KSG `dev`** | `http://127.0.0.1:3000` |
| **Dev/demo VM** | `144.24.32.97` (often firewalled) |

| Released prod | Use client tip |
|---|---|
| https://ksg.129.153.118.145.sslip.io/ | **`main` / `v0.2.6-client`** (KSG **`v0.2.6`**) |

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
