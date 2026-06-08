# KSG Client and Service Release Coordination

This document records the current release state and the protocol for keeping the npm client
compatible with the KSG service and CPMS-style prototype matching interfaces.

## Observed Release State

Observed during the 2026-06-08 bootstrap:

| Repository or package | Observed state |
| --- | --- |
| KSG client package | `package.json` version `0.2.1` |
| npm registry | Client package not found |
| KSG client GitHub releases | None observed |
| KSG service GitHub releases | None observed |
| KSG service `main` | Only `.gitignore` and `LICENSE` tracked |
| CPMS repository tags | `v0.1.3`, `v0.2.0` |
| `@lehelkovach/cpms-core` | `0.2.0` |
| `@lehelkovach/cpms-server-node` | `0.2.0` |
| `cpms_client` | `0.2.0` |

Because the service repo does not yet publish an OpenAPI schema or route source on `main`,
this client uses contract tests to lock the intended HTTP request surface.

## Compatibility Policy

1. Stable Releases
	a) Stable client releases are published from `main` or `release/*`.
	b) Stable package versions come from `package.json`.
	c) A stable release should not remove an existing client method without a major version
	   bump or a documented migration path.
	d) Before publishing stable, run `npm test`, `npm run build`, and `npm pack --dry-run`.

2. Development Releases
	a) Development client releases are published from the `dev` branch.
	b) Development publishes use npm dist-tag `dev`.
	c) The workflow generates a prerelease version from the base package version and GitHub
	   run metadata, for example `0.2.1-dev.123.1`.
	d) Development releases are for coordination with a dev KSG service and may be
	   superseded quickly.

3. Service Coordination
	a) The service should publish either an OpenAPI schema or route source before the client
	   promotes new endpoint helpers to stable.
	b) If the service changes request or response shapes, update client methods, contract
	   tests, and `docs/usage.md` in the same PR.
	c) If a dev service URL exists, document it as `KSG_DEV_BASE_URL` in repository
	   or environment setup, not as a committed secret value.
	d) Production service deployment or production-data live testing requires explicit
	   maintainer instruction.

4. CPMS Coordination
	a) CPMS `0.2.0` exposes concept/pattern lifecycle, observation, feedback, revision, and
	   matching routes under `/cpms/*`.
	b) This client includes CPMS-style helpers for matching and concept/pattern CRUD-style
	   calls so KSG can delegate fuzzy prototype matching where appropriate.
	c) If CPMS tags advance, inspect CPMS `docs/RELEASE_LOG.md` and update this client's
	   route helpers only for endpoints that remain intended for KSG integration.

## Core Interface Checklist

Before a stable release, validate that the client and service agree on these interfaces:

1. Prototypes
	a) `POST /api/prototypes`
	b) `GET /api/prototypes/:uuid`
	c) `PUT /api/prototypes/:uuid`
	d) `POST /api/concepts/:uuid/prototype`
	e) `POST /api/prototypes/duck-type`

2. Concepts
	a) `POST /api/concepts`
	b) `POST /api/prototypes/:uuid/concepts`
	c) `GET /api/concepts/:uuid`
	d) `PUT /api/concepts/:uuid`
	e) `POST /api/concepts/query`
	f) `POST /api/concepts/search`

3. Nodes and Embeddings
	a) `POST /api/nodes`
	b) `GET /api/nodes/:uuid`
	c) `PUT /api/nodes/:uuid`
	d) `POST /api/nodes/query`
	e) `POST /api/nodes/:uuid/embedding`
	f) `POST /api/search/vector`

4. Graph
	a) `POST /api/associations`
	b) `GET /api/associations/:uuid`
	c) `POST /api/graph/search`
	d) `GET /api/graph/nodes/:uuid/neighbors`

5. Assertions and Verification
	a) `POST /api/assertions`
	b) `GET /api/assertions`
	c) `GET /api/entities/:entityId/snapshot`
	d) `GET /api/entities/:entityId/evidence`
	e) `POST /api/facts`
	f) `POST /api/facts/bulk`
	g) `POST /api/verify`
	h) `GET /api/facts/stats`

6. CPMS Matching
	a) `POST /cpms/match`
	b) `POST /cpms/match_explain`
	c) `POST /cpms/match_pattern`
	d) `POST /cpms/detect_form`
	e) `POST /cpms/concepts`
	f) `PATCH /cpms/concepts/:id`
	g) `GET /cpms/concepts/:id`
	h) `POST /cpms/patterns`
	i) `PATCH /cpms/patterns/:id`
	j) `GET /cpms/patterns/:id`

## Release Steps

1. Prepare
	a) Update `package.json` version for stable releases.
	b) Confirm service compatibility with route source, OpenAPI, or documented endpoint
	   contract.
	c) Update `README.md`, `docs/usage.md`, and this file when behavior changes.

2. Verify
	a) Run `npm test`.
	b) Run `npm run build`.
	c) Run `npm pack --dry-run`.
	d) Run `.AGENT` smoke tests when agent persistence files changed.

3. Publish
	a) Merge stable releases to `main` or `release/*`; workflow publishes `latest` if the
	   package version is not already on npm.
	b) Merge development releases to `dev`; workflow publishes generated prerelease builds
	   with npm dist-tag `dev`.

4. Audit
	a) Record release-relevant changes and verification in `.AGENT/agent-action-log.md`.
	b) Keep PR notes focused on endpoint compatibility, test evidence, and any service
	   follow-ups.
