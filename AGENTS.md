# AGENTS.md

> Product / MVP cold-start: [`README.md`](README.md) (**MVP at a glance**) · agent repo for product judgment.
 · knowshowgo-client `dev` (`0.2.9-dev`)

**Start:** [`README.md`](README.md). Pair with knowshowgo **`dev`**:
[CLIENT-SYNC](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/CLIENT-SYNC.md).
KSG roadmap: [DEVELOPMENT-PLAN v6.4+](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/DEVELOPMENT-PLAN.md).

## Engage now (client)

1. **Bearer API token support** — ✅ constructor `authToken` / `accessToken` /
   `apiToken` / `tokenProvider`; sends `Authorization: Bearer …` (soft
   `X-KSG-Owner` remains as fallback). Agent + Chrome should pass tokens.
2. **Entity object model** — `get_entity_properties` / `get_entity_types` /
   `EntityProxy` (`.middleName`, `.getType()`); then `load(name)` → KSGObject.
3. Parity tests JS + Python for every new `/api2.0` surface; dual-prefix where required.
   New methods must be fleet-testable (unit + offline mock).

QA matrix (client surfaces of): sibling `osl-oc-agent/docs/QA-FLEET.md`.

## Commands

```bash
npm install
node --test js/client.test.mjs
python3 -m unittest discover -s python -p 'test_*.py'
npm run build
```

## Versions (this tip)

| | |
|---|---|
| Client | **`0.2.9-dev`** / branch **`dev`** |
| Server | knowshowgo **`0.2.9-dev`** / **`dev`** |
| Contract | `GET /api/release` → **`surfaces.clientContract`** |
| `connect()` default | **no pin** — discovers server; pass `expected_*` to assert |

Release tip: **`main` / `v0.2.7-client`** ↔ KSG **`v0.2.7`**.

The package version and the advertised release are **not** the same number and
drift apart on purpose: `package.json` is `0.2.9-dev` on both repos while
`GET /api/release` on server tip advertises `v0.2.9-dev`; client `connect()` is unpinned
tracks the manifest rather than the package. Check both before assuming a
mismatch is a bug.

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

## Soft owner identity + tokens

`defaultOwnerUserId` / `defaultAgentSessionId` → `X-KSG-Owner` / `X-KSG-Session`.
Soft headers remain for legacy/local, and are spoofable by definition — they are
whatever the caller typed.

Hard identity is wired: `authToken` (JS) / `auth_token` (Python) sends
`Authorization: Bearer ksg_…`, and the server prefers a verified token over the
soft headers, so a token cannot be overridden by a spoofed `X-KSG-Owner`.

| Need | JS | Python |
|---|---|---|
| Send a token | `authToken`, `set_auth_token()` | `auth_token`, `set_auth_token()` |
| Mint / list / revoke | `create_api_token` · `list_api_tokens` · `revoke_api_token` | same names |
| Mint for **another** owner | `adminSecret` → `X-KSG-Admin` | `admin_secret` |
| Usage counters | `get_admin_usage()` | `get_admin_usage()` |

Two different admin mechanisms, which is easy to get wrong: the token endpoints
authenticate the admin via the **`X-KSG-Admin` header**, while `/api/admin/usage`
expects the admin secret as the **bearer**. `adminSecret` covers both.

Minting needs `KSG_API_TOKEN_SECRET` set on the server; without it the endpoint
returns 503 rather than issuing an unverifiable token.

## Environments

| Prefer | |
|---|---|
| Local KSG `dev` | `http://127.0.0.1:3000` |
| Dev/demo VM | `144.24.32.97` (often firewalled) |
| Prod | use client **`main`**, not this tip |

## Cloud

- Plain `npm install` (no server peerDependency).
- JS tests: `node --test …` (not jest).
- Access check: `./scripts/agent-access-check.sh`.

## Prompting

No separate prompt/handoff docs. Rules here or server CLIENT-SYNC.

## Considerations (filed)

- Client SDK health / fuzzy-ORM gap analysis: [`docs/SDK-ASSESSMENT-2026-08.md`](docs/SDK-ASSESSMENT-2026-08.md)
