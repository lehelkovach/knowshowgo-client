# KnowShowGo Client SDK

JavaScript and Python REST clients for the KnowShowGo semantic memory API.

## JavaScript

```js
import { KnowShowGoClient } from '@lehelkovach/knowshowgo-client';

const ksg = new KnowShowGoClient({ baseUrl: process.env.KSG_API_URL });

const topic = await ksg.create_topic({
  label: 'Submit invoice workflow',
  aliases: ['#[submit invoice workflow]']
});

const procedure = await ksg.create_procedure({
  title: 'Submit invoice',
  steps: [
    { title: 'Open portal', tool: 'browser.open', payload: { url: 'https://portal.example' } },
    { title: 'Click submit', tool: 'browser.click', payload: { selector: '#submit' } }
  ],
  dependencies: [[0, 1]]
});
```

## Python

```py
from python.client import KnowShowGoClient

ksg = KnowShowGoClient(base_url="http://localhost:3000")

category = ksg.create_category({
    "name": "Person",
    "properties": [{"name": "name", "type": "string", "required": True}]
})

obj = ksg.upsert_object({
    "categoryPrototypeUuid": category["categoryPrototypeUuid"],
    "title": "David Bowie",
    "tags": ["#[David Bowie]"],
    "knowledgeKind": "fact",
    "properties": [{"name": "name", "type": "string", "value": "David Bowie"}]
})
```

## Current semantic API coverage

- Topics: create, get, resolve tag.
- Object categories: create, upsert, get.
- Objects: upsert, get, resolve, generalize.
- ConceptObjects: suggest, search, suggest prototypes.
- Assertions: create, query, vote, snapshot, evidence, explain.
- Procedures: create, get, insert step, generalize, import JSON, repair selector, search.
- Logic: create/get syllogisms.
- App primitives: market matching, channels, repeating events, ratings.
- Composites: create, get, update component.

