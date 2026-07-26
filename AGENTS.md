# AGENTS.md · knowshowgo-client `main` (`v0.2.5-client`)

**Start:** [`README.md`](README.md). Pair with knowshowgo **`main` / `v0.2.5`**:
[CLIENT-SYNC](https://github.com/lehelkovach/knowshowgo/blob/main/docs/CLIENT-SYNC.md).

## Commands

```bash
npm install --legacy-peer-deps
node --test js/client.test.mjs
python3 -m unittest discover -s python -p 'test_*.py'
npm run build
```

## Versions (this tip)

| | |
|---|---|
| Client | **`v0.2.5-client`** (`0.2.5`) / branch **`main`** |
| Server | knowshowgo **`v0.2.5`** / **`main`** |
| Agent | osl-oc-agent **`v0.2.1`** |
| Contract | `GET /api/release` → **`surfaces.mvp`** |
| `connect()` | use `expected_channel: 'release'`, `expected_release: 'v0.2.5'` |

Next integration tip: **`dev` / `0.2.6-dev`** ↔ KSG **`0.2.6-dev`**.

## Soft ACL

`defaultOwnerUserId` / `defaultAgentSessionId` → `X-KSG-Owner` / `X-KSG-Session`.

## Environments

| Prefer | |
|---|---|
| **Prod** | https://ksg.129.153.118.145.sslip.io/ |
| **Local** | KSG `v0.2.5` on `http://127.0.0.1:3000` |

## Cloud

- Need `--legacy-peer-deps` (peer `knowshowgo` unpublished).
- JS tests: `node --test …` (not jest).
