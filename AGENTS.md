# AGENTS.md

> Product / MVP cold-start: [`README.md`](README.md) (**MVP at a glance**) · agent repo for product judgment.
 · knowshowgo-client `main` (`v0.2.6-client`)

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
| Client | **`v0.2.6-client`** (`0.2.6`) / branch **`main`** |
| Server | knowshowgo **`v0.2.6`** / **`main`** |
| Agent | osl-oc-agent **`v0.2.1`** |
| Contract | `GET /api/release` → **`surfaces.mvp`** |
| `connect()` | defaults to `expected_channel: 'release'`, `expected_release: 'v0.2.6'` |

Next integration tip: **`dev` / `0.2.7-dev`** ↔ KSG **`0.2.7-dev`**.

## Base URL

Explicit `baseUrl` → `KSG_API_URL` → `KSG_PUBLIC_API_URL` → `http://localhost:3000`.
Hosted: `KnowShowGoClient.publicApi()` / `PUBLIC_API_BASE_URL` (`https://api.knowshowgo.com`).

## Soft ACL

`defaultOwnerUserId` / `defaultAgentSessionId` → `X-KSG-Owner` / `X-KSG-Session`.

## Environments

| Public API | `https://api.knowshowgo.com` (override `baseUrl`) |
|---|---|


| Prefer | |
|---|---|
| **Prod** | https://knowshowgo.com/ |
| **Local** | KSG `v0.2.6` on `http://127.0.0.1:3000` |

## Cloud

- Need `--legacy-peer-deps` (peer `knowshowgo` unpublished).
- JS tests: `node --test …` (not jest).
