# Client Agent Operating Instructions

Repository: `knowshowgo-client`

## Required startup sequence

1. Read this file.
2. Read [`.AGENT/CONTINUITY.md`](./CONTINUITY.md).
3. Skim [`.AGENT/handoffs/latest.md`](./handoffs/latest.md) for active cross-repo pointers.
4. For Telnyx/voice takeover: use sibling `osl-oc-agent/.AGENT/handoffs/TELNYX-KICKOFF-PROMPT.txt` (not this repo).
5. Env secret *names*: `osl-oc-agent/.AGENT/handoffs/CURSOR-ENV-HANDOFF.md`.

## Scope

- Primary: this SDK (`js/`, `python/`).
- Pair with sibling `knowshowgo` on **`dev`**.
- Do not put SIP/Asterisk/Telnyx bootstrap work here.

## Verify

```bash
npm install --legacy-peer-deps
node --test js/client.test.mjs
python3 -m unittest discover -s python -p 'test_*.py'
```

## Continuity

Keep [`.AGENT/CONTINUITY.md`](./CONTINUITY.md) short. Prefer issues/PRs over resume logs.
v1 `resume-log.md` is historical only — do not append new session queues there.
