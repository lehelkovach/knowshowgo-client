# Continuity digest — knowshowgo-client

**Updated:** 2026-08-21 · Agents: read this at session start; keep it short.

## Now

- Pair with KSG `dev` (`0.2.9-dev` tip): property-definition / `resolve_slots` and `semantic_remember/recall/ask/correct` on `dev`.
- Install: `npm install --legacy-peer-deps`. Tests: `node --test js/client.test.mjs`.
- **Cross-repo active ops:** Telnyx voice is **OSLO host** work — sibling `osl-oc-agent/.AGENT/handoffs/TELNYX-KICKOFF-PROMPT.txt`. No client SDK change required for SIP bootstrap.

## Holds / coordination

- Server must be on KSG tip for semantic + slots endpoints; older tagged releases soft-404 those paths.
- Gitflow: branch from **`dev`**, PR into **`dev`**.

## Anti-drift

Keep this file short. Point at KSG `docs/SEMANTIC-MEMORY.md` / `docs/STACK-MASTER.md` for product truth.
Env secret *names*: `osl-oc-agent/.AGENT/handoffs/CURSOR-ENV-HANDOFF.md`.
