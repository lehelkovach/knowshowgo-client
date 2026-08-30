# Latest Client Handoff

Timestamp (UTC): 2026-06-19T00:10:00Z  
Repo: ksg-client (`api/` submodule)  
Branch: `cursor/client-dev-sync-eb91` → merge to `dev`

## Branch review (2026-06-19)

| Branch | Status | Notes |
|--------|--------|-------|
| **`origin/dev`** @ `7eec98f` | **Canonical** | Full MVP wrappers (composites, market, channels, logic, ratings). Base for sync. |
| `cursor/client-dev-sync-eb91` | **Merge this** | `0.2.3-dev-client`, connect/release guard, experimental routes, response aliases, live smoke. |
| `cursor/sync-ksg-dev-api-client` | Skip | Superseded by `dev`; duplicate rewrite. |
| `cursor/ksg-dev-api-client-methods` | Skip | Conflicts with dev parity work. |
| `cursor/client-semantic-api-f16c` | Skip | Older partial semantic wrappers only. |
| `da98d6b` (detached merge) | Skip | Behind `origin/dev`; do not resurrect. |

## This session

- Version `0.2.3-dev-client`, peer `ksg-server@0.2.3-dev`
- `connect()` + `get_release_manifest()` with optional contract enforcement
- Response aliases: `objectUuid`, `vaultUuid`, `suggestions`, `totalFacts`, `verified`, `intent_uuid`
- Compatibility: `resolve_tag`, `repair_selector`, `suggest_prototypes`
- Experimental: vaults, personal, private payment, knode, query, seeds
- `js/index.js` + package `type: module`
- `scripts/live-contract-smoke.js` — run with `KSG_BASE_URL`

## Tests

```bash
node --test js/client.test.mjs                              # 37/37 pass
KSG_BASE_URL=http://127.0.0.1:3000 node scripts/live-contract-smoke.js
```

## Server cross-check

From ksg-server `dev`:

```bash
npm run test:client:contract:live   # full 17-case contract suite
```

## Next

- [ ] Merge `cursor/client-dev-sync-eb91` → `dev` and tag `v0.2.3-dev-client`
- [ ] Bump server submodule pointer on `dev`
- [ ] Python parity for new experimental + connect helpers (optional)
