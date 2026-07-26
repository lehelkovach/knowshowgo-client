# @lehelkovach/knowshowgo-client

JavaScript and Python SDKs for the [KnowShowGo](https://github.com/lehelkovach/knowshowgo)
(KSG) REST memory API. Used by [`osl-oc-agent`](https://github.com/lehelkovach/osl-oc-agent).

> **Not on npmjs.org** (E404). Install from GitHub or a sibling `file:` checkout.

## Install

```bash
# From a dependent with "file:../knowshowgo-client":
npm install --legacy-peer-deps

# Or pin a release tag:
npm i --legacy-peer-deps git+https://github.com/lehelkovach/knowshowgo-client.git#v0.2.4-client
```

| Branch | Version | Pairs with KSG |
|--------|---------|----------------|
| `main` | `0.2.4` (`v0.2.4-client`) | `v0.2.4` |
| `dev` | `0.2.5-dev` | `0.2.5-dev` |

## Quick start

```bash
# Terminal 1 — KSG service (sibling repo)
cd ../knowshowgo && npm ci && PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start

# Terminal 2 — this repo
npm install --legacy-peer-deps
node --test js/client.test.mjs
```

```js
import { KnowShowGoClient } from './js/client.js';

const client = new KnowShowGoClient({
  baseUrl: 'http://127.0.0.1:3000',
  defaultOwnerUserId: 'my-namespace', // soft read ACL
});

const concepts = await client.search_concepts({ query: 'Person', limit: 5 });
console.log(concepts);
```

New feature routes default to **`/api2.0`** (override with `prototypeApiPrefix`,
`topicApiPrefix`, `visualApiPrefix`, …). See [`AGENTS.md`](AGENTS.md).

## Docs

| Doc | |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Commands, versioning, ACL, Cloud notes |
| Server [QUICKSTART](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/QUICKSTART.md) | Run KSG |
| Server [CLIENT-SYNC](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/CLIENT-SYNC.md) | Pair PRs / versions |
