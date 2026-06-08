# KSG Client SDK

JavaScript and Python client SDKs for the KSG semantic memory engine.

This package currently publishes the JavaScript SDK to npm and keeps the Python client in
`python/client.py` as a source reference.

The JavaScript SDK is intentionally vanilla JavaScript. It does not ship TypeScript
declarations and does not validate concept/prototype shapes in the client. Concept data stays
typeless and prototype matching remains a service/runtime concern.

## Install

```sh
npm install <package-name>
```

For development builds, install the `dev` dist-tag after the dev workflow publishes:

```sh
npm install <package-name>@dev
```

## JavaScript Usage

```js
import KSGClient from "<package-name>";

const client = new KSGClient({
  baseUrl: process.env.KSG_BASE_URL,
  apiToken: process.env.KSG_API_TOKEN
});

const prototypeUuid = await client.createPrototype({
  name: "Person",
  description: "A human individual",
  labels: ["person"],
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      email: { type: "string" }
    }
  }
});

const conceptUuid = await client.createConceptFromPrototype(prototypeUuid, {
  name: "Ada Lovelace",
  email: "ada@example.test"
});

const matches = await client.searchConcepts("mathematician", {
  top_k: 5,
  similarity_threshold: 0.65,
  prototype_filter: prototypeUuid
});
```

The SDK keeps the existing snake_case method names and also exposes camelCase aliases for
JavaScript callers.

Internally the SDK uses constructor functions and `KSGClient.prototype`-style method
dispatch, so advanced users can extend or override behavior with normal JavaScript prototype
mechanics:

```js
KSGClient.prototype.createLocalPrototype = function createLocalPrototype(shape) {
  return Object.assign(Object.create(shape), { createdAt: new Date().toISOString() });
};
```

## Core Interface Coverage

The client includes helpers for:

- Health checks: `healthCheck()`
- Prototypes: create, list, fetch, upsert, create from concept, fuzzy duck typing
- Concepts: create, create from prototype, fetch, upsert, query, semantic search
- Nodes: create, fetch, upsert, query, embedding refresh
- Associations and graph: associations, graph search, graph neighbors
- Vector search: embedding or text vector search request helpers
- Assertions and facts: create assertions, snapshots, evidence, verified facts, claim
  verification
- CPMS-style prototype matching: concept match, explained match, pattern match, form
  detection, CPMS concept/pattern CRUD-style helpers

See `docs/usage.md` for endpoint-oriented examples.

## Development

```sh
npm install
npm test
npm run test:integration
npm run build
npm pack --dry-run
python3 .AGENT/tests/agent_architecture_smoke.py
```

The tests are contract tests that validate HTTP methods, paths, payloads, query encoding,
auth headers, and error handling with a mock fetch implementation. They do not require a
live KSG service. `npm run test:integration` runs an optional live health check and
is skipped unless `KSG_DEV_BASE_URL` or `KSG_BASE_URL` is configured.

## Release Coordination

Release and compatibility rules live in `docs/release-coordination.md`.

Observed state at the current bootstrap:

- Client package version: `0.2.1`
- Public npm registry: package not found
- Client GitHub releases: none observed
- Service GitHub releases: none observed
- Service `main` source tree: `.gitignore` and `LICENSE` only
- CPMS tags: `v0.1.3`, `v0.2.0`
- CPMS package versions: `0.2.0`

## Agent Persistence and Auditing

This repo imports the `.AGENT/` layout from `lehelkovach/agent-repo-boilerplate`.
Agents should read `.AGENT/agent.md` before work, process `.AGENT/agent-run.md` and
`.AGENT/agent-run-once.md`, and record meaningful setup, implementation, verification, and
handoff activity in `.AGENT/agent-action-log.md`.
