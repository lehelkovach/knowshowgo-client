# Latest client continuity pointer

**Updated:** 2026-08-21

Canonical short digest: [`../CONTINUITY.md`](../CONTINUITY.md).

## Active cross-repo task

Telnyx DID → Asterisk → OSLO `call.*` is **not** a client-SDK change.
Paste kickoff from sibling:

`osl-oc-agent/.AGENT/handoffs/TELNYX-KICKOFF-PROMPT.txt`

Full task: `osl-oc-agent/.AGENT/handoffs/2026-08-21-telnyx-oci-voice.md`.

## Tests

```bash
npm install --legacy-peer-deps
node --test js/client.test.mjs
```
