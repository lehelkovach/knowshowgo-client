# KSG Client Usage

## Configuration

```js
import KSGClient from "<package-name>";

const client = new KSGClient({
  baseUrl: process.env.KSG_BASE_URL,
  apiToken: process.env.KSG_API_TOKEN,
  timeoutMs: 30_000
});
```

If `baseUrl` is omitted, the client reads `KSG_BASE_URL` and then falls back to
`http://localhost:8787` for local development.

## Prototype-Based JavaScript Design

The SDK is written as vanilla JavaScript. It exports a constructor function with methods on
the runtime prototype chain rather than a TypeScript API model. The client does not coerce or
type-check concept/prototype objects; those payloads remain plain data for service-side
matching.

```js
const client = new KSGClient();

KSGClient.prototype.withTrace = function withTrace(label) {
  this.headers["x-ksg-trace"] = label;
  return this;
};

client.withTrace("agent-run");
```

## Prototypes

```js
const personPrototypeUuid = await client.createPrototype({
  name: "Person",
  description: "A human individual",
  labels: ["person", "human"],
  schema: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string" },
      email: { type: "string" }
    }
  },
  metadata: { owner: "agent" }
});

const prototype = await client.getPrototype(personPrototypeUuid);

await client.upsertPrototype(personPrototypeUuid, {
  name: "Person",
  labels: ["person", "human", "contact"]
});
```

Duck type a concept-like object to candidate prototypes:

```js
const candidates = await client.fuzzyDuckTypeConcept(
  { name: "Ada Lovelace", email: "ada@example.test" },
  { topK: 3, threshold: 0.55 }
);
```

## Concepts and Nodes

```js
const conceptUuid = await client.createConceptFromPrototype(personPrototypeUuid, {
  name: "Ada Lovelace",
  email: "ada@example.test"
});

await client.upsertConcept(conceptUuid, {
  jsonObj: { name: "Ada Lovelace", email: "ada@example.test", role: "mathematician" }
});

const concept = await client.getConcept(conceptUuid);

const nodeUuid = await client.createNode({
  label: "Ada Lovelace",
  summary: "Mathematician and early computing pioneer",
  tags: ["person", "history"],
  metadata: { source: "example" },
  prototypeUuid: personPrototypeUuid
});

await client.updateNodeEmbedding(nodeUuid);
```

Query by UUID or metadata:

```js
const nodes = await client.queryNodes({
  uuid: nodeUuid,
  tags: ["person"]
});

const concepts = await client.queryConcepts({
  where: { prototypeUuid: personPrototypeUuid }
});
```

## Semantic and Vector Search

```js
const semanticResults = await client.searchConcepts("early computer programmer", {
  top_k: 5,
  similarity_threshold: 0.65,
  prototype_filter: personPrototypeUuid
});

const vectorResults = await client.embeddingSearch([0.12, 0.32, 0.88], {
  topK: 10,
  filters: { kind: "person" }
});

const textVectorResults = await client.vectorSearch({
  text: "agent memory concept",
  topK: 10,
  prototypeFilter: personPrototypeUuid
});
```

## Graph Search and Associations

```js
await client.addAssociation({
  from_concept_uuid: conceptUuid,
  to_concept_uuid: "related-concept-uuid",
  relation_type: "related_to",
  strength: 0.8
});

const graph = await client.graphSearch({
  startUuid: conceptUuid,
  relationTypes: ["related_to"],
  maxDepth: 3,
  direction: "both",
  limit: 25
});

const neighbors = await client.graphNeighbors(conceptUuid, {
  relationTypes: ["related_to", "parent"],
  limit: 10
});
```

## Assertions, Evidence, and Fact Verification

```js
await client.createAssertion({
  subject: "Ada Lovelace",
  predicate: "worked_on",
  object: "Analytical Engine",
  truth: 1.0,
  source: "example"
});

const snapshot = await client.getSnapshot("Ada Lovelace");
const evidence = await client.getEvidence("Ada Lovelace", { predicate: "worked_on" });

await client.storeFact({
  subject: "Ada Lovelace",
  predicate: "worked_on",
  object: "Analytical Engine",
  confidence: 0.95
});

const verification = await client.verify("Ada Lovelace worked on the Analytical Engine", {
  threshold: 0.7
});
```

## CPMS-Style Concept Prototype Matching

These helpers align with the CPMS `0.2.0` server-node route shape and are useful when
KSG delegates fuzzy prototype matching to CPMS-compatible endpoints.

```js
const match = await client.matchConcept(conceptPrototype, observation);
const explained = await client.matchConceptExplain(conceptPrototype, observation);
const patternMatch = await client.matchPattern(patternPrototype, conceptPrototypes, observation);

const detection = await client.detectForm({
  html: "<form><input type=\"email\" /><input type=\"password\" /></form>",
  url: "https://example.test/login"
});

await client.cpmsCreateConcept({ concept_id: "concept:email@1.0.0", kind: "cpms.concept" });
await client.cpmsUpsertConcept("concept:email@1.0.0", { status: "active" });
await client.cpmsCreatePattern({ pattern_id: "pattern:login@1.0.0" });
```

## Testing Without a Live Service

The npm test suite uses a mock fetch implementation. Add new client methods by adding a
contract assertion for:

1. HTTP method
2. URL path and query parameters
3. Request payload shape
4. Response unwrapping behavior
5. Error behavior when the service returns a non-2xx status
