# TDD ladder — knowshowgo-client

**This repo owns SDK wrappers only.** Canonical process:
[`knowshowgo/docs/TDD-LADDER.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/TDD-LADDER.md).

**`dev` is integration. `main` is release. `dev` is not `master`.**

## Slice law

```text
failing test → implement → local green → PR into `dev`
→ wait for merged-`dev` evidence → prod decision → next slice
```

This repo has **no PR unit GitHub workflow**. Local green is the merged-`dev` gate:

```bash
npm install
node --test js/client.test.mjs
python3 -m unittest discover -s python -p 'test_*.py'
```

Prod = paired tag with KSG (`vX.Y.Z-client`), not “merged to main.” See
KSG [`RELEASE-PROTOCOL.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/RELEASE-PROTOCOL.md).

## This repo’s slices

| Slice | Functions | Test | Status | Prod? | Unlocks |
|---|---|---|---|---|---|
| **S3** | `upsert_object_category`, `upsert_object`, `get_object`, `list_objects` | `js/client.test.mjs` (`upsert_object_category maps category_lineage_key`) | **Done** on `dev` and `main` | Already shipped | Influence A mock + live A' |
| **P1** | boolean/json field types + prototype match ([#44](https://github.com/lehelkovach/knowshowgo-client/pull/44)) | client tests for the new types | Rebase `main` → `dev` before merge | With next paired tag | Removes Influence JSON-string workaround. **Not required for A–F.** |

## Live KSG

OSL resolves `file:../knowshowgo-client`. Before Influence A' or B against a
running KSG `dev` service, this checkout must be **`dev`**, not `main`. Do not
`git switch` a shared workspace other agents are using — use a worktree.

`KSG_BASE_URL=http://127.0.0.1:3000 node scripts/live-contract-smoke.js`

## Do not start from here

Influence rungs, OSL runtime, IAC Bus, ComputeNet. Next stack merge is KSG S1
composition into `dev`, not a client change.
