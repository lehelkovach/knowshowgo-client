# KSG Semantic + Procedural Memory Model (with CPMS)

This document consolidates the model implied by the available client/docs material in:

- this repository's interface surface (`js/client.js`, `python/client.py`)
- client docs on the docs/release branches (`README.md`, `docs/usage.md`, `docs/release-coordination.md`)
- API-plan notes (`docs/semantic-object-api-plan.md` on `ksg-dev-api-client-methods`)

It defines a practical data model and initial prototype set for working memory in KSG.

## 1) Core entities and minimum shapes

These are the minimum interoperable entity shapes, based on the documented API contracts.

### Topic (semantic indexing layer)

- Endpoint family: `/api/topics`, `/api/topics/resolve-tag`
- Core fields:
  - `topicUuid` (string)
  - `label` (string)
  - `aliases` (string[])
  - `description` (string, optional)

Use topics to anchor phrase tags and semantic routing (for search, retrieval, and workflow intent mapping).

### Object Category Prototype (semantic schema layer)

- Endpoint family: `/api/object-categories`, `/api/object-categories/upsert`
- Core fields:
  - `categoryPrototypeUuid` (string)
  - `name` (string)
  - `properties` (array of `{ name, type, required? }`)
  - `version` (string, recommended)

This is the canonical "prototype definition" layer for semantic objects.

### Semantic Object (semantic memory instance)

- Endpoint family: `/api/objects/upsert`, `/api/objects/resolve`, `/api/objects/generalize`
- Core fields:
  - `objectUuid` (string)
  - `categoryPrototypeUuid` (string)
  - `title` (string)
  - `tags` (string[])
  - `knowledgeKind` (string; e.g. `fact`, `context`, `artifact`)
  - `properties` (array of `{ name, type, value }`)
  - `metadata` (object, optional)

### Assertion (append-only truth/evidence layer)

- Endpoint family: `/api/assertions`, `/api/entities/:id/snapshot`, `/api/entities/:id/evidence`, `/api/entities/:id/explain`
- Core fields:
  - `subject` (string)
  - `predicate` (string)
  - `object` (any)
  - `truth` (number, default `1.0`)
  - `source` (string or provenance object)
  - `voteScore`, `status`, `prevAssertionId` (optional evidence/conflict fields)

Assertions are the event log; snapshots are the resolved current state.

### Procedure DAG (procedural memory)

- Endpoint family: `/api/procedures`, `/api/procedures/:id/steps`, `/api/procedures/:id/generalize`, `/api/procedures/import-json`, `/api/procedures/search`
- Core fields:
  - `procedure_uuid` (string)
  - `title` (string)
  - `steps` (array of `{ stepUuid?, title, tool, payload }`)
  - `dependencies` (array of index pairs, e.g. `[[0,1], [1,2]]`)
  - `tags` / `topicRefs` / `preconditions` / `postconditions` (recommended for retrieval quality)

Procedures are explicit DAGs and serve as executable procedural memory.

## 2) Recommended starter prototypes

For semantic + procedural memory, define this starter set first:

1. `Person`
   - `name`, `email`, `role`
2. `Organization`
   - `name`, `domain`
3. `Invoice`
   - `invoiceNumber`, `vendor`, `amount`, `currency`, `dueDate`, `status`
4. `PortalResource`
   - `url`, `ownerOrg`, `authKind`
5. `ProcedureTemplate`
   - `title`, `goal`, `inputs`, `outputs`, `riskLevel`
6. `ProcedureRun`
   - `procedureUuid`, `actor`, `runStatus`, `startedAt`, `endedAt`
7. `EvidenceArtifact`
   - `artifactType`, `uri`, `hash`, `capturedAt`

Why this set: it covers entities, artifacts, and execution-state objects needed to connect semantic state to procedural execution.

## 3) CPMS alignment (concept/pattern matching)

From documented CPMS-compatible routes:

- `POST /cpms/match`
- `POST /cpms/match_explain`
- `POST /cpms/match_pattern`
- `POST /cpms/detect_form`
- Concept CRUD-style: `/cpms/concepts`, `/cpms/concepts/:id`
- Pattern CRUD-style: `/cpms/patterns`, `/cpms/patterns/:id`

### CPMS concept prototype shape (practical minimum)

- `concept_id` (string, versioned id)
- `kind` (string, e.g. `cpms.concept`)
- `features` (object or list of typed features)
- `constraints` (object, optional)
- `metadata` (object)

### CPMS pattern prototype shape (practical minimum)

- `pattern_id` (string, versioned id)
- `kind` (string, e.g. `cpms.pattern`)
- `slots` (array of named slot constraints)
- `relations` (array of slot-to-slot constraints)
- `metadata` (object)

CPMS should be used as the scoring/candidate layer for fuzzy prototype or procedure-intent matching, while KSG assertions/snapshots remain the source of resolved state.

## 4) Mock data artifacts in this repo

Use these files together:

- `docs/mock-data/semantic-procedural-memory-seed.json`
  - topics, object category prototypes, semantic objects, assertions, procedures
- `docs/mock-data/cpms-prototypes.json`
  - CPMS concept prototypes, pattern prototypes, observations, expected match outcomes

These fixtures are designed to drive:

1. semantic recall (`/api/concept-objects/search`, `/api/entities/:id/snapshot`)
2. procedural retrieval (`/api/procedures/search`)
3. semantic-to-procedural linking (assertions connecting objects to procedures)
4. CPMS fuzzy matching for prototype/pattern scoring

## 5) Minimal flow to exercise both memory systems

1. Create topic(s) and object category prototypes.
2. Upsert semantic objects for the scenario.
3. Append assertions that link entities and facts.
4. Create procedure DAG(s) and link them to topics/entities with assertions.
5. Run CPMS match endpoints with observation payloads from the same scenario.
6. Verify:
   - semantic snapshot correctness
   - procedure retrieval relevance
   - CPMS match confidence ordering

