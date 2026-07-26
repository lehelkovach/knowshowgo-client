# AGENTS.md · knowshowgo-client `main` (`v0.2.4-client`)

**Start:** [`README.md`](README.md). Pair with knowshowgo **`main`**:
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
| Client | **`0.2.4`** / tag **`v0.2.4-client`** / branch **`main`** |
| Server | knowshowgo **`v0.2.4`** / **`main`** |
| Contract | `GET /api/release` → **`surfaces.mvp`** |

Integration tip: **`dev` / `0.2.5-dev`**.

## API prefixes

Default `/api2.0` where the release exposes it; `/api` for stable/regression.

## Soft owner identity

`defaultOwnerUserId` / `defaultAgentSessionId` → `X-KSG-Owner` / `X-KSG-Session`.

## Environments

| Prefer | |
|---|---|
| Local KSG `main` | `http://127.0.0.1:3000` |
| **Prod** | https://ksg.129.153.118.145.sslip.io/ (KSG `v0.2.4` on VM) |
| Dev/demo VM | use client **`dev`**, not this tip |

## Cloud

- `--legacy-peer-deps` required (peer unpublished).
- JS tests: `node --test …`.
- Access check: `./scripts/agent-access-check.sh`.

## Prompting

No separate prompt/handoff docs.
