---
name: agenti-call
description: Place and manage phone calls via Asterisk ARI — approve-to-dial, allowlist + AI disclosure, hangup/bridge/status. OpenClaw telephony skill for OSLO and standalone robocall hosts.
trigger: /call |phone|dial|ring|telephony|asterisk|pstn|voice call|robocall|hang up|bridge (the )?call/i
version: 0.1.0
---

# Agenti-call (OpenClaw telephony skill)

Use the **`call.*` tools** provided by the host (OSLO registers them from
`@lehelkovach/agenti-call`). Do **not** invent SIP credentials, dialplan, or
raw ARI HTTP. Do **not** place a call without an explicit user yes after the
preview.

## Hard rules

1. **Allowlist only** — if `call.list_allowed` is empty or the number is
   missing, tell the user to add consent (`VOICE_ALLOWLIST`); never invent a
   number to dial.
2. **Approve-to-dial** — first `call.place` **without** `confirmed:true`. Show
   the user the preview (`to`, contact name, **disclosure** that will be spoken
   first). Only after they clearly say yes, re-call with `confirmed:true`.
3. **Disclosure is mandatory** — the stack speaks an AI disclosure before any
   conversation. Do not ask to skip it; there is no skip.
4. **Stop means stop** — if the callee says stop / do not call / hang up, the
   session ends immediately. Do not argue on the line.
5. **One consequential action at a time** — same gate for `call.bridge`.

## Tools

1. **`call.list_allowed`** `{}` — who may be dialled (number, name, consent note).
2. **`call.place`** `{ to, reason?, from?, confirmed? }` — preview unless
   `confirmed:true`. `to` is E.164 (`+1…`) or a 10-digit NANP number.
3. **`call.status`** `{ channelId }` — Asterisk channel state (`Ring` / `Up` / `Down`).
4. **`call.hangup`** `{ channelId, reason? }`.
5. **`call.bridge`** `{ channelIds, confirmed? }` — join live Stasis-controlled
   channels (MVP caveat: dialplan-originated AudioSocket legs need a Stasis hop
   before bridge works live).
6. **`call.activity`** `{ limit? }` — recent call feed (`call.requested` /
   `call.completed` / `call.needs_you`).

## Typical flow

```
user: "Call Dave and tell him the demo works"
→ call.list_allowed  (confirm Dave is on the list)
→ call.place { to: "+1…", reason: "…" }   # needsConfirmation + disclosure preview
→ show user the preview in plain language; wait for yes
→ call.place { to: "+1…", confirmed: true, reason: "…" }
→ call.status / conversation via AudioSocket voice session
→ call.hangup when done
```

## Host setup (operators)

| Env | Meaning |
|---|---|
| `VOICE_ARI_URL` | e.g. `http://127.0.0.1:8088/ari` — unset ⇒ tools return not-configured |
| `ARI_USER` / `ARI_PASSWORD` | ARI Basic auth |
| `VOICE_ALLOWLIST` | JSON `[{"number":"+1…","name":"…","consent":"…"}]` |
| `VOICE_OWNER_NAME` | name spoken in the disclosure |
| `VOICE_TRUNK_NAME` | PJSIP trunk id (default `trunk`) |

Package: `@lehelkovach/agenti-call` — `createTelephonyRuntime()` or
`createCallTools({ ari, policy })`. Docs: `docs/VOICE-CALLS.md`,
`docs/OPENCLAW-SKILL.md`. Asterisk lab: `asterisk/`.

## Do not

- Dial strangers, spoof caller ID, or use DISA/spoof dialplans (see
  `docs/archive/stuntbanana-integration.md` — safe patterns only).
- Bypass `confirmed:true` after a failed preview.
- Put real phone numbers or recordings into chat logs when avoidable; prefer
  `call.activity` summaries.
