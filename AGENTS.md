# AGENTS.md

> Product / MVP cold-start: [`README.md`](README.md) (**MVP at a glance**) · agent repo for product judgment.
 · knowshowgo-client `dev` (`0.2.7-dev`)

**Start:** [`README.md`](README.md). Pair with knowshowgo **`dev`**:
[CLIENT-SYNC](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/CLIENT-SYNC.md).

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
| Client | **`0.2.7-dev`** / branch **`dev`** |
| Server | knowshowgo **`0.2.7-dev`** / **`dev`** |
| Contract | `GET /api/release` → **`surfaces.clientContract`** |
| `connect()` default | channel **`dev`**, release **`v0.2.7-dev`** |

Release tip: **`main` / `v0.2.6-client`** ↔ KSG **`v0.2.6`**.

## API prefixes

Default `/api2.0`; pass `/api` for regression tests.

| Family | JS | Python |
|---|---|---|
| Prototypes | `prototypeApiPrefix` | `prototype_api_prefix` |
| Topics | `topicApiPrefix` | `topic_api_prefix` |
| Visual | `visualApiPrefix` | `visual_api_prefix` |


## Public API base URL

Explicit `baseUrl` → `KSG_API_URL` → `KSG_PUBLIC_API_URL` → `http://localhost:3000`.
Hosted: `KnowShowGoClient.publicApi()` / `PUBLIC_API_BASE_URL` (`https://api.knowshowgo.com`).
Server runbook: [PUBLIC-API.md](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/PUBLIC-API.md).

## Soft owner identity

`defaultOwnerUserId` / `defaultAgentSessionId` → `X-KSG-Owner` / `X-KSG-Session`.

## Environments

| Prefer | |
|---|---|
| Local KSG `dev` | `http://127.0.0.1:3000` |
| Dev/demo VM | `144.24.32.97` (often firewalled) |
| Prod | use client **`main`**, not this tip |

## Cloud

- Need `--legacy-peer-deps` (peer `knowshowgo` unpublished).
- JS tests: `node --test …` (not jest).
- Access check: `./scripts/agent-access-check.sh`.

## Prompting

No separate prompt/handoff docs. Rules here or server CLIENT-SYNC.
