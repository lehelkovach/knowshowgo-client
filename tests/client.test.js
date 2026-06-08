import assert from "node:assert/strict";
import test from "node:test";
import { KnowShowGoClient, KnowShowGoError } from "../src/index.js"; // pragma: allowlist secret

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : "";
      }
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

function makeClient(responseBody = { ok: true, uuid: "generated-uuid" }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({
      url,
      method: options.method,
      headers: options.headers,
      body: options.body ? JSON.parse(options.body) : undefined
    });
    return jsonResponse(responseBody);
  };
  const client = new KnowShowGoClient({ // pragma: allowlist secret
    baseUrl: "https://api.example.test/",
    fetchImpl,
    apiToken: "test-token"
  });
  return { client, calls };
}

test("creates, fetches, upserts, and lists prototypes", async () => {
  const { client, calls } = makeClient({ uuid: "proto-1" });

  const uuid = await client.createPrototype({
    name: "Person",
    description: "Human",
    labels: ["person"],
    schema: { type: "object" },
    metadata: { release: "dev" }
  });
  await client.getPrototype("proto/1");
  await client.upsertPrototype("proto-1", { name: "Person", labels: ["human"] });
  await client.listPrototypes({ label: "person", limit: 5 });

  assert.equal(uuid, "proto-1");
  assert.equal(calls[0].method, "POST");
  assert.equal(new URL(calls[0].url).pathname, "/api/prototypes");
  assert.deepEqual(calls[0].body, {
    name: "Person",
    description: "Human",
    context: null,
    labels: ["person"],
    embedding: null,
    parentPrototypeUuids: null,
    schema: { type: "object" },
    metadata: { release: "dev" }
  });
  assert.equal(new URL(calls[1].url).pathname, "/api/prototypes/proto%2F1");
  assert.equal(calls[2].method, "PUT");
  assert.equal(new URL(calls[2].url).pathname, "/api/prototypes/proto-1");
  assert.equal(new URL(calls[3].url).searchParams.get("label"), "person");
  assert.equal(new URL(calls[3].url).searchParams.get("limit"), "5");
  assert.equal(calls[0].headers.authorization, "Bearer test-token");
});

test("exposes client behavior through the JavaScript prototype chain", () => {
  const { client } = makeClient();

  assert.equal(Object.hasOwn(client, "createPrototype"), false);
  assert.equal(KnowShowGoClient.prototype.createPrototype, client.createPrototype); // pragma: allowlist secret
  assert.equal(KnowShowGoClient.prototype.fuzzyDuckTypeConcept, client.fuzzyDuckTypeConcept); // pragma: allowlist secret
  assert.equal(typeof client.createPrototype, "function");
});

test("creates, upserts, queries, and searches concepts and nodes", async () => {
  const { client, calls } = makeClient({ uuid: "concept-1", results: [{ uuid: "concept-1" }] });

  await client.createConcept({
    prototypeUuid: "proto-1",
    jsonObj: { name: "Ada" },
    embedding: [0.1, 0.2],
    metadata: { source: "test" }
  });
  await client.createConceptFromPrototype("proto-1", { name: "Grace" }, { embedding: [0.3] });
  await client.upsertConcept("concept-1", { jsonObj: { name: "Ada Lovelace" } });
  await client.queryConcepts({ where: { prototypeUuid: "proto-1" } });
  const searchResults = await client.searchConcepts("mathematician", {
    top_k: 3,
    similarity_threshold: 0.5,
    prototype_filter: "proto-1"
  });
  await client.createNode({
    uuid: "node-1",
    label: "Ada",
    summary: "Mathematician",
    tags: ["person"],
    metadata: { source: "test" },
    associations: [],
    prototypeUuid: "proto-1"
  });
  await client.upsertNode("node-1", { label: "Ada Lovelace" });
  await client.queryNodes({ uuid: "node-1" });

  assert.deepEqual(searchResults, [{ uuid: "concept-1" }]);
  assert.equal(new URL(calls[0].url).pathname, "/api/concepts");
  assert.deepEqual(calls[0].body, {
    prototypeUuid: "proto-1",
    jsonObj: { name: "Ada" },
    embedding: [0.1, 0.2],
    previousVersionUuid: null,
    metadata: { source: "test" }
  });
  assert.equal(new URL(calls[1].url).pathname, "/api/prototypes/proto-1/concepts");
  assert.equal(calls[2].method, "PUT");
  assert.equal(new URL(calls[3].url).pathname, "/api/concepts/query");
  assert.equal(new URL(calls[4].url).pathname, "/api/concepts/search");
  assert.equal(calls[4].body.topK, 3);
  assert.equal(calls[5].body.uuid, "node-1");
  assert.equal(new URL(calls[6].url).pathname, "/api/nodes/node-1");
  assert.equal(new URL(calls[7].url).pathname, "/api/nodes/query");
});

test("supports duck typing, vector search, graph search, and graph neighbors", async () => {
  const { client, calls } = makeClient();

  await client.fuzzyDuckTypeConcept({ name: "Ada", email: "ada@example.test" }, { topK: 2 });
  await client.embeddingSearch([0.1, 0.2], { topK: 4, filters: { kind: "person" } });
  await client.vectorSearch({ text: "semantic query", topK: 5, prototypeFilter: "proto-1" });
  await client.graphSearch({
    startUuid: "node-1",
    relationTypes: ["related_to"],
    maxDepth: 3,
    direction: "out",
    limit: 20
  });
  await client.graphNeighbors("node-1", { relationTypes: ["related_to", "parent"], limit: 10 });

  assert.equal(new URL(calls[0].url).pathname, "/api/prototypes/duck-type");
  assert.deepEqual(calls[0].body, { jsonObj: { name: "Ada", email: "ada@example.test" }, topK: 2 });
  assert.equal(new URL(calls[1].url).pathname, "/api/search/vector");
  assert.deepEqual(calls[1].body.embedding, [0.1, 0.2]);
  assert.equal(calls[2].body.text, "semantic query");
  assert.equal(new URL(calls[3].url).pathname, "/api/graph/search");
  assert.equal(calls[3].body.maxDepth, 3);
  const neighborUrl = new URL(calls[4].url);
  assert.equal(neighborUrl.pathname, "/api/graph/nodes/node-1/neighbors");
  assert.deepEqual(neighborUrl.searchParams.getAll("relationTypes"), ["related_to", "parent"]);
});

test("supports assertions, facts, verification, and associations", async () => {
  const { client, calls } = makeClient({ assertions: [], evidence: [], snapshot: { ok: true } });

  await client.addAssociation({
    from_concept_uuid: "a",
    to_concept_uuid: "b",
    relation_type: "related_to",
    strength: 0.8
  });
  await client.createAssertion({ subject: "Ada", predicate: "created", object: "programming", truth: 0.9 });
  await client.getAssertions({ subject: "Ada", predicate: "created", object: "programming" });
  await client.getSnapshot("Ada");
  await client.getEvidence("Ada", { predicate: "created" });
  await client.storeFact({ subject: "Ada", predicate: "created", object: "programming" });
  await client.storeFactsBulk([["Ada", "worked_on", "Analytical Engine"]]);
  await client.verify("Ada created programming", { threshold: 0.6 });
  await client.getFactStats();

  assert.equal(new URL(calls[0].url).pathname, "/api/associations");
  assert.equal(calls[0].body.fromConceptUuid, "a");
  assert.equal(new URL(calls[1].url).pathname, "/api/assertions");
  assert.equal(new URL(calls[2].url).searchParams.get("object"), "programming");
  assert.equal(new URL(calls[3].url).pathname, "/api/entities/Ada/snapshot");
  assert.equal(new URL(calls[4].url).pathname, "/api/entities/Ada/evidence");
  assert.equal(new URL(calls[5].url).pathname, "/api/facts");
  assert.deepEqual(calls[6].body.facts, [{ subject: "Ada", predicate: "worked_on", object: "Analytical Engine" }]);
  assert.equal(calls[7].body.threshold, 0.6);
  assert.equal(new URL(calls[8].url).pathname, "/api/facts/stats");
});

test("supports CPMS concept, pattern, matching, and form detection helpers", async () => {
  const { client, calls } = makeClient();

  await client.matchConcept({ concept_id: "concept:email@1.0.0" }, { candidates: [] });
  await client.matchConceptExplain({ concept_id: "concept:email@1.0.0" }, { candidates: [] });
  await client.matchPattern({ pattern_id: "pattern:login@1.0.0" }, [], { candidates: [] });
  await client.detectForm({ html: "<form></form>", url: "https://example.test/login" });
  await client.cpmsCreateConcept({ concept_id: "concept:email@1.0.0" });
  await client.cpmsUpsertConcept("concept:email@1.0.0", { status: "active" });
  await client.cpmsGetConcept("concept:email@1.0.0");
  await client.cpmsCreatePattern({ pattern_id: "pattern:login@1.0.0" });
  await client.cpmsUpsertPattern("pattern:login@1.0.0", { status: "active" });
  await client.cpmsGetPattern("pattern:login@1.0.0");

  assert.equal(new URL(calls[0].url).pathname, "/cpms/match");
  assert.equal(new URL(calls[1].url).pathname, "/cpms/match_explain");
  assert.equal(new URL(calls[2].url).pathname, "/cpms/match_pattern");
  assert.equal(new URL(calls[3].url).pathname, "/cpms/detect_form");
  assert.equal(new URL(calls[4].url).pathname, "/cpms/concepts");
  assert.equal(new URL(calls[5].url).pathname, "/cpms/concepts/concept%3Aemail%401.0.0");
  assert.equal(calls[5].method, "PATCH");
  assert.equal(calls[5].body.patch.status, "active");
  assert.equal(new URL(calls[7].url).pathname, "/cpms/patterns");
  assert.equal(new URL(calls[8].url).pathname, "/cpms/patterns/pattern%3Alogin%401.0.0");
});

test("throws SDK error with service error details", async () => {
  const fetchImpl = async () => jsonResponse({ error: "bad request", code: "BAD_REQUEST" }, { status: 400 });
  const client = new KnowShowGoClient({ baseUrl: "https://api.example.test", fetchImpl }); // pragma: allowlist secret

  await assert.rejects(
    () => client.getConcept("missing"),
    (error) => {
      assert.ok(error instanceof KnowShowGoError); // pragma: allowlist secret
      assert.equal(error.message, "bad request");
      assert.equal(error.status, 400);
      assert.equal(error.endpoint, "/api/concepts/missing");
      assert.deepEqual(error.body, { error: "bad request", code: "BAD_REQUEST" });
      return true;
    }
  );
});
