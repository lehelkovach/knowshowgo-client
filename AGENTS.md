# AGENTS.md

> Product / MVP cold-start: [`README.md`](README.md) (**MVP at a glance**) · agent repo for product judgment.

**Version truth:** this repo's `package.json`, plus
[VERSION-MATRIX](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/VERSION-MATRIX.md)
for cross-repo pairing. Do not restate version numbers in docs or pin them as code
defaults — that is what made a bare `connect()` throw against the public release API.

**Start:** [`README.md`](README.md). Pair with knowshowgo **`dev`**:
[CLIENT-SYNC](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/CLIENT-SYNC.md).
KSG roadmap: [DEVELOPMENT-PLAN v6.4+](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/DEVELOPMENT-PLAN.md).

## Engage now (client)

1. **Bearer API token support** — constructor `apiToken` / env; send
   `Authorization: Bearer ksg_…` (and keep soft `X-KSG-Owner` as fallback).
   Server already verifies tokens for private reads; agent + Chrome need this.
   Consumed by agent **QA-Auth** fleet vector (`qa:api-token`).
2. **Entity object model** — `get_entity_properties` / `get_entity_types` /
   `EntityProxy` (`.middleName`, `.getType()`); then `load(name)` → KSGObject.
3. Parity tests JS + Python for every new `/api2.0` surface; dual-prefix where required.
   New methods must be fleet-testable (unit + offline mock).

QA matrix (client surfaces of): sibling `osl-oc-agent/docs/QA-FLEET.md`.

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
| Client / server versions | see [VERSION-MATRIX](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/VERSION-MATRIX.md) |
| Contract on `dev` | `GET /api/release` → **`surfaces.clientContract`** |
| Contract on `main` | `GET /api/release` → **`surfaces.mvp`** |
| `connect()` default | **no channel/release assertion** — opt in per call |

## API prefixes

Default `/api2.0`; pass `/api` for regression tests.

| Family | JS | Python | Status |
|---|---|---|---|
| Prototypes | `prototypeApiPrefix` | `prototype_api_prefix` | implemented |
| Topics | `topicApiPrefix` | `topic_api_prefix` | implemented |
| Visual | `visualApiPrefix` | `visual_api_prefix` | **planned — not implemented** |


## Public API base URL

Explicit `baseUrl` → `KSG_API_URL` → `KSG_PUBLIC_API_URL` → `http://localhost:3000`.
Hosted: `KnowShowGoClient.publicApi()` / `PUBLIC_API_BASE_URL` (`https://api.knowshowgo.com`).
Server runbook: [PUBLIC-API.md](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/PUBLIC-API.md).

## Soft owner identity + tokens

`defaultOwnerUserId` / `defaultAgentSessionId` → `X-KSG-Owner` / `X-KSG-Session`.
**Gap (P0):** no Bearer sender yet — add `apiToken` so portal-issued `ksg_…` tokens
work from SDK/agent/Chrome. Soft headers remain for legacy/local.

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
