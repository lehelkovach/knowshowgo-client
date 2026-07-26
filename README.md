# @lehelkovach/knowshowgo-client · `main` (`v0.2.5-client`)

> **Cold start:** This is the **SDK** for the KnowShowGo memory API. Product MVP lives in
> [`osl-oc-agent`](https://github.com/lehelkovach/osl-oc-agent). Server:
> [`knowshowgo` `v0.2.5`](https://github.com/lehelkovach/knowshowgo).

JS + Python client for KnowShowGo **`v0.2.5`**.

> **Not on npmjs.org** (E404). Install from GitHub tag or sibling `file:`.

## MVP at a glance (for reviewers)

| | |
|---|---|
| **This repo’s job** | Typed HTTP wrappers (JS + Python) over KSG REST — ACL headers, `/api2.0` prefixes |
| **Pairs with** | knowshowgo **`v0.2.5`** · agent **`v0.2.1`** |
| **This tip** | **`main` / `v0.2.5-client`** (`package.json` `0.2.5`) |
| **Live dogfood** | https://ksg.129.153.118.145.sslip.io/ |
| **Next tip** | **`dev` / `0.2.6-dev`** |

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

https://ksg.129.153.118.145.sslip.io/demo/


## Public hosted API

```js
const client = new KnowShowGoClient({
  baseUrl: 'https://api.knowshowgo.com',
  defaultOwnerUserId: 'my-namespace',
});
```

Server runbook: [knowshowgo PUBLIC-API.md](https://github.com/lehelkovach/knowshowgo/blob/main/docs/PUBLIC-API.md).  
Local default remains `http://localhost:3000`.

## Try it

```bash
cd ../knowshowgo && git checkout v0.2.5 && npm ci
PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start
# other terminal:
npm i --legacy-peer-deps git+https://github.com/lehelkovach/knowshowgo-client.git#v0.2.5-client
node --test js/client.test.mjs
python3 -m unittest discover -s python -p 'test_*.py'
```

For live services, call `connect({ expected_channel: 'release', expected_release: 'v0.2.5' })`.
