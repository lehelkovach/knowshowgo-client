# AGENTS.md

Canonical instructions for coding agents working in the KnowShowGo client SDK.

This repo ships the JavaScript (`js/client.js`) and Python (`python/client.py`)
client SDKs for the KnowShowGo (KSG) REST API. The `osl-oc-agent` OpenClaw agent
consumes this SDK to reach the KSG service.

## Commands

```bash
npm install --legacy-peer-deps        # see cloud note below
node --test js/client.test.mjs        # JS unit tests
python3 -m unittest discover -s python -p 'test_*.py'   # Python unit tests
npm run build                         # esbuild bundle -> dist/index.cjs
```

## Versions

| Branch | Version | Pairs with server |
|--------|---------|-------------------|
| `main` | `0.2.4` (`v0.2.4-client`) | KSG `v0.2.4` |
| `dev` | `0.2.5-dev` | KSG `0.2.5-dev` / `v0.2.5-dev` |

## API versioning

The KSG service introduces new REST features under the canonical `/api2.0`
namespace while retaining `/api` as a backward-compatible alias. SDK methods for
new features default to `/api2.0` and accept a prefix override:

| Feature family | JS | Python |
|---|---|---|
| Prototypes | `prototypeApiPrefix` | `prototype_api_prefix` |
| Topics / tags | `topicApiPrefix` | `topic_api_prefix` |
| Visual / multimodal embeds | `visualApiPrefix` | `visual_api_prefix` |

Default all to `/api2.0`; pass `/api` for regression tests. When adding a wrapper
for a new feature endpoint, build its path from the right prefix and add parity
tests for **both** namespaces. Keep this repo’s `dev`/`main` versions paired with
knowshowgo (`docs/VERSION-MATRIX.md` in the server repo).

**Visual APIs (pair with server `visualEmbedding`):** `embed_media`,
`update_node_visual_embedding`, `search_visual` → Gemini Embedding 2 space.
Text recompute remains `update_node_embedding` (OpenAI path on server).

### Keep server + client in sync

1. Land REST on knowshowgo under `/api2.0` (+ `/api` alias).  
2. Add JS **and** Python wrappers here in the same change set / paired PR.  
3. Set `peerDependencies.knowshowgo` to the server `dev` version (`0.2.5-dev`).  
4. Point knowshowgo’s `api/` submodule (if used) at this client commit.  
5. Run client unit tests + server `npm run test:client:contract`.

## Soft owner identity (read ACL)

KSG filters private objects by caller identity. The client supports:

- Constructor: `defaultOwnerUserId` / `defaultAgentSessionId` (JS) or
  `default_owner_user_id` / `default_agent_session_id` (Python)
- Per-call: `owner_user_id` / `agent_session_id` on `get_object`, `list_objects`,
  `search_concepts`, etc.
- Transport: sends `X-KSG-Owner` / `X-KSG-Session` and fills `ownerUserId` on
  query/body when set

Agents should set `defaultOwnerUserId` to the session namespace so list/search/get
cannot leak other users' private data. This is soft identity — server-side token
auth is a follow-up.

## Cursor Cloud specific instructions

- Install with `npm install --legacy-peer-deps`. The `peerDependencies` entry
  for the sibling service package is **not published to npm**, so a plain
  `npm install` fails with an E404. The SDK's own runtime dep is just
  `node-fetch`; the peer is only relevant when co-locating the service package.
- The JS tests use the **Node built-in test runner**, not jest. `npm test`
  (jest) reports "No tests found" because the test file is `js/client.test.mjs`.
  Run `node --test js/client.test.mjs` instead. All JS + Python tests are unit
  tests with mocked transport (no live server needed).
- For live integration against a running KSG service, construct the client with
  an explicit base URL, e.g. `new KnowShowGoClient({ baseUrl: 'http://localhost:3000' })`
  (Python: `KnowShowGoClient("http://localhost:3000")`). Start the service from
  the sibling service repo with `PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start`
  (no Docker needed). The Python client requires the `requests` package.
