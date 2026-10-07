---
name: knowshowgo-memory
description: Search KnowShowGo durable memory — private Document objects, entity graph, and episodic chunks via the KSG client /api2.0/knowledge/search surface.
trigger: /document|offer letter|resume|what does my|search (my )?(docs?|memory|ksg|knowshowgo)|ingested|drive file|pdf|knowledge graph/i
version: 0.1.0
---

# KnowShowGo memory search (OpenClaw skill)

Use the **built-in OSLO tools** (they call `knowshowgo-client` → KSG REST). Do not invent a second store.

## When to use

- User asks about something they **uploaded**, **ingested**, or put in **Drive**
- User asks “what does my … say”, “search my docs/memory”, resume/offer/contract details
- After `docs.ingest` / `drive.ingest` succeeded

## Tools (prefer in this order)

1. **`memory.search`** `{ query, topK? }` — unified: graph Documents/entities **plus** conversation episodic hits.
2. **`knowledge.search`** `{ query, topK?, categories? }` — same as client `search_knowledge` → `POST /api2.0/knowledge/search` (concepts + Document/Idea objects; ACL via session owner).
3. **`docs.search`** `{ query, topK? }` — document-focused wrapper (delegates to knowledge search when available).
4. **`profile.recall` / `memory.recall_fact`** — structured identity facts, not free-text docs.
5. **`memory.entity_props`** `{ entityId?|subject?|person?, predicate? }` — ranked property map (winner + contested claim stack via `GET /api2.0/entities/:id/properties`). Use when attributes may conflict; mention alternate claims when `contested` is true.
6. **`memory.entity_types`** `{ entityId?|subject?|person?, topK?, persist? }` — fuzzy duck typing via `GET /api2.0/entities/:id/types`. Returns ranked prototype matches (Person, Organization, …). `persist:true` stamps soft membership in KSG.

## Query tips

- Use **content terms** from the document (“Acme start date”, “equity cliff”), not meta phrases (“last pdf”, “that file”).
- Pass the session namespace / `defaultOwnerUserId` so private Documents are readable (the agent already does this).

## SDK (external OpenClaw agents)

```js
import { KnowShowGoClient } from '@lehelkovach/knowshowgo-client';

const client = new KnowShowGoClient({
  baseUrl: process.env.KSG_API_URL || 'https://api.knowshowgo.com',
  defaultOwnerUserId: process.env.KSG_OWNER || null, // e.g. slack:U…
  authToken: process.env.KSG_API_TOKEN || null,       // Bearer — preferred over soft headers alone
});

const { results } = await client.search_knowledge({
  query: 'offer letter start date',
  top_k: 8,
});
```

Canonical path: `/api2.0/knowledge/search` (`/api` alias). Send `X-KSG-Owner` (or constructor `defaultOwnerUserId`) for private docs.

## Do not

- Dump whole PDF text into `memory.remember` — use `docs.ingest` then search.
- Expect Topic Builder “search lehel” to return assertion profiles — use Document/entity objects or this skill.
