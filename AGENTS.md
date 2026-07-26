# AGENTS.md · knowshowgo-client `dev` (`0.2.5-dev`)

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
| Client | **`0.2.5-dev`** / branch **`dev`** |
| Server | knowshowgo **`0.2.5-dev`** / **`dev`** |
| Contract | `GET /api/release` → **`surfaces.clientContract`** |

Release tip: **`main` / `v0.2.4-client`** ↔ KSG **`v0.2.4`**.

## API prefixes

Default `/api2.0`; pass `/api` for regression tests.

| Family | JS | Python |
|---|---|---|
| Prototypes | `prototypeApiPrefix` | `prototype_api_prefix` |
| Topics | `topicApiPrefix` | `topic_api_prefix` |
| Visual | `visualApiPrefix` | `visual_api_prefix` |

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
