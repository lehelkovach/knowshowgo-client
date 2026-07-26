# AGENTS.md

Canonical instructions for the KnowShowGo **client SDK**
(`js/client.js`, `python/client.py`). Consumed by `osl-oc-agent`.

**Start:** [`README.md`](README.md). Server pairing:
[knowshowgo `CLIENT-SYNC`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/CLIENT-SYNC.md).

## Commands

```bash
npm install --legacy-peer-deps
node --test js/client.test.mjs
python3 -m unittest discover -s python -p 'test_*.py'
npm run build
```

## Versions

| Branch | Version | Pairs with server |
|--------|---------|-------------------|
| `main` | `0.2.4` (`v0.2.4-client`) | KSG `v0.2.4` |
| `dev` | `0.2.5-dev` | KSG `0.2.5-dev` |

## API prefixes

New features default to `/api2.0`; pass `/api` for regression tests.

| Family | JS | Python |
|---|---|---|
| Prototypes | `prototypeApiPrefix` | `prototype_api_prefix` |
| Topics / tags | `topicApiPrefix` | `topic_api_prefix` |
| Visual embeds | `visualApiPrefix` | `visual_api_prefix` |

Add JS **and** Python wrappers + dual-prefix tests when the server adds routes.

## Soft owner identity

Constructor `defaultOwnerUserId` / `defaultAgentSessionId` (Python snake_case);
per-call `owner_user_id` / `agent_session_id`. Sends `X-KSG-Owner` /
`X-KSG-Session`. Soft ACL only — not token auth.

## Cloud notes

- `npm install` without `--legacy-peer-deps` fails: peer `knowshowgo` is **unpublished**.
- JS tests = Node built-in runner (`node --test …`), not jest.
- Live: `new KnowShowGoClient({ baseUrl: 'http://localhost:3000' })` against
  sibling `PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start`.
- Private upstream check: `./scripts/agent-access-check.sh` (GitHub integration +
  multi-repo env if it fails; start a **new** run after fixing perms).

## Prompting

No separate prompt/handoff docs in this repo. Keep instructions here or in the
server `CLIENT-SYNC` / consumer `osl-oc-agent` prompts module.
