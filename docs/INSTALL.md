# Installation

Two SDKs, one API. Install whichever language you work in, point it at a
KnowShowGo service, and you are done. No build step, no native dependencies.

---

## 1. JavaScript / TypeScript (Node.js)

Requires **Node.js 18 or newer**. The SDK is ESM and uses the runtime's
built-in `fetch`.

```bash
npm install @lehelkovach/knowshowgo-client
```

> The package is being published to the npm registry. Until the first
> published version appears there, install straight from GitHub:
>
> ```bash
> # latest integration tip
> npm install git+https://github.com/lehelkovach/knowshowgo-client.git#dev
> # or a release tag, from https://github.com/lehelkovach/knowshowgo-client/tags
> npm install git+https://github.com/lehelkovach/knowshowgo-client.git#<tag>
> ```

```js
import { KnowShowGoClient } from '@lehelkovach/knowshowgo-client';
```

Exports: `KnowShowGoClient`, `KSGObject`, `PUBLIC_API_BASE_URL`,
`LOCAL_API_BASE_URL`, `resolveBaseUrl`, `matchesRoute`.

Works in Node. In a browser it works wherever `fetch` and CORS allow; the
hosted API's CORS policy is advertised at `GET /api/release` under `api.cors`.

## 2. Python

Requires **Python 3.8 or newer**. The only dependency is `requests`.

```bash
pip install knowshowgo-client
```

> Until the first version is on PyPI, install from GitHub:
>
> ```bash
> pip install "git+https://github.com/lehelkovach/knowshowgo-client.git@dev#subdirectory=python"
> # or pin a tag: ...@<tag>#subdirectory=python
> ```

```python
from knowshowgo_client import KnowShowGoClient
```

## 3. Choose a server

| Option | Base URL | Needs a token? | Good for |
|---|---|---|---|
| **Hosted API** | `https://api.knowshowgo.com` | Yes, for writes | Real use, shared memory across machines |
| **Local, in-memory** | `http://127.0.0.1:3000` | No | Trying things, tests. Forgets on restart; text-match search instead of embeddings |
| **Local, persistent** | `http://127.0.0.1:3000` | No | Development with real embeddings and a database |

### Hosted

Get a token at <https://knowshowgo.com/developers>. Put it in the environment
and never in code:

```bash
export KSG_API_TOKEN=ksg_...
```

```js
const client = KnowShowGoClient.publicApi({
  defaultOwnerUserId: 'my-app',
  authToken: process.env.KSG_API_TOKEN,
});
```

```python
client = KnowShowGoClient.public_api(
    default_owner_user_id="my-app", auth_token=os.environ["KSG_API_TOKEN"]
)
```

Reads of public concepts work without a token. Writes, and reads of your own
private data, need one.

The same token also opens the server's MCP endpoint (`POST /mcp`) for Claude
Code, Cursor and other MCP clients, with no SDK in between. See
[`MCP.md`](MCP.md).

### Local, in-memory

```bash
git clone https://github.com/lehelkovach/knowshowgo && cd knowshowgo
npm ci
PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start
curl http://127.0.0.1:3000/health
```

```js
const client = new KnowShowGoClient({ baseUrl: 'http://127.0.0.1:3000', defaultOwnerUserId: 'me' });
```

```python
client = KnowShowGoClient(base_url="http://127.0.0.1:3000", default_owner_user_id="me")
```

### Local, persistent

Follow the server's
[`QUICKSTART.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/QUICKSTART.md)
for ArangoDB and an embedding provider.

## 4. Configuration

The base URL resolves in this order, in both languages:

1. the explicit `baseUrl` / `base_url` argument
2. `KSG_API_URL`
3. `KSG_PUBLIC_API_URL`
4. `http://localhost:3000`

Other settings:

| Setting | JS | Python | Default |
|---|---|---|---|
| Owner namespace | `defaultOwnerUserId` | `default_owner_user_id` | none |
| Agent session (sub-scope of an owner) | `defaultAgentSessionId` | `default_agent_session_id` | none |
| Bearer token | `authToken` (aliases `accessToken`, `apiToken`) | `auth_token` (`access_token`, `api_token`) | none |
| Token supplier, for rotation | `tokenProvider` (function) | `token_provider` | none |
| Request timeout | `timeoutMs` or env `KSG_TIMEOUT_MS` | library default | 30 000 ms |
| API prefix for newer routes | `prototypeApiPrefix`, `topicApiPrefix` | `prototype_api_prefix`, `topic_api_prefix` | `/api2.0` |

## 5. Verify the connection

```js
const manifest = await client.connect();
console.log(manifest.version, manifest.channel, manifest.api.publicBaseUrl);
```

```python
m = client.connect()
print(m["version"], m["channel"], m["api"]["publicBaseUrl"])
```

`connect()` reads the server's release manifest. To fail fast when the server
is not the version you tested against, pass `expected_release: 'vX.Y.Z'` (and
optionally `expected_channel: 'release'`). To follow whatever host the server
advertises, pass `adopt_advertised_base_url: true`.

## 6. Versions and pairing

Client and server pair by version. The `dev` branch of the client pairs with
the `dev` branch of the server; `main` with `main`; a release tag
`vX.Y.Z-client` with server `vX.Y.Z`. The client's version is in
`package.json` and `python/pyproject.toml`; the server reports its own at
`GET /api/release`. A mismatched pair usually still works for the stable
`/api` surface, but new `/api2.0` methods may be missing on an older server.

## 7. Upgrading

```bash
npm update @lehelkovach/knowshowgo-client
pip install --upgrade knowshowgo-client
```

New methods land under `/api2.0`; the `/api` prefix stays as a
backward-compatible alias, so an upgraded client keeps working against a
server that has not moved yet.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401` on a write | hosted API requires a bearer token for writes | pass `authToken` |
| `401` with a token | token malformed, expired or revoked | mint a new one at the portal |
| Search returns nothing | server has no embedding model, so search is text match | use a word that appears in what you stored; or run a persistent local server |
| Private objects not visible | reading under a different owner than you wrote with | same `defaultOwnerUserId`, or the token for that owner |
| `expected release` error from `connect()` | you pinned a version the server does not run | drop the pin, or point at the matching server |
| Request hangs | slow server, default timeout 30 s | lower `timeoutMs`; check `GET /health` |

Next: [Getting started](GETTING-STARTED.md).
