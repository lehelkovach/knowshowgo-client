const DEFAULT_BASE_URL = "http://localhost:8787";

function getDefaultBaseUrl() {
  if (typeof process !== "undefined" && process.env?.KSG_BASE_URL) {
    return process.env.KSG_BASE_URL;
  }
  return DEFAULT_BASE_URL;
}

function getDefaultFetch() {
  if (typeof fetch === "function") return fetch.bind(globalThis);
  throw new Error("No fetch implementation available; pass fetchImpl to the client");
}

function appendParams(url, params = {}) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

function getUuid(payload) {
  return payload?.uuid ?? payload?.id ?? payload?.concept?.uuid ?? payload?.prototype?.uuid ?? payload?.node?.uuid;
}

export function KnowShowGoError(message, { status, body, method, endpoint } = {}) { // pragma: allowlist secret
  Error.call(this, message);
  this.name = "KSGError";
  this.message = message;
  this.status = status;
  this.body = body;
  this.method = method;
  this.endpoint = endpoint;
  if (Error.captureStackTrace) Error.captureStackTrace(this, KnowShowGoError); // pragma: allowlist secret
}

KnowShowGoError.prototype = Object.create(Error.prototype); // pragma: allowlist secret
KnowShowGoError.prototype.constructor = KnowShowGoError; // pragma: allowlist secret

/**
 * Vanilla JavaScript API client. Methods are attached to the constructor prototype so callers
 * can extend or override behavior with normal JavaScript prototype mechanics.
 *
 * @param {Object} options
 * @param {string} [options.baseUrl] Service base URL.
 * @param {typeof fetch} [options.fetchImpl] Fetch-compatible implementation.
 * @param {Object} [options.headers] Additional headers for every request.
 * @param {string} [options.apiToken] Optional bearer token.
 * @param {number} [options.timeoutMs] Optional request timeout.
 */
export function KnowShowGoClient({ baseUrl = getDefaultBaseUrl(), fetchImpl, headers = {}, apiToken, timeoutMs } = {}) { // pragma: allowlist secret
  this.baseUrl = baseUrl.replace(/\/+$/, "");
  this.fetch = fetchImpl ?? getDefaultFetch();
  this.headers = { ...headers };
  this.apiToken = apiToken;
  this.timeoutMs = timeoutMs;
}

KnowShowGoClient.prototype._request = async function request(method, endpoint, { json, params, headers = {} } = {}) { // pragma: allowlist secret
  const url = new URL(this.baseUrl + endpoint);
  appendParams(url, params);

  const controller = this.timeoutMs ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;

  const requestHeaders = {
    accept: "application/json",
    ...this.headers,
    ...headers
  };
  if (json !== undefined) requestHeaders["content-type"] = "application/json";
  if (this.apiToken && !requestHeaders.authorization) {
    requestHeaders.authorization = `Bearer ${this.apiToken}`;
  }

  try {
    const res = await this.fetch(url.toString(), {
      method,
      headers: requestHeaders,
      body: json !== undefined ? JSON.stringify(json) : undefined,
      signal: controller?.signal
    });

    if (res.status === 204) return null;

    const contentType = res.headers?.get?.("content-type") || "";
    const payload = contentType.includes("application/json") ? await res.json() : await res.text();

    if (!res.ok) {
      const message =
        payload && typeof payload === "object"
          ? payload.error ?? payload.message ?? payload.detail ?? `Request failed: ${method} ${endpoint} (${res.status})`
          : payload || `Request failed: ${method} ${endpoint} (${res.status})`;
      throw new KnowShowGoError(message, { status: res.status, body: payload, method, endpoint }); // pragma: allowlist secret
    }

    return payload;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

// ===== Health =====
KnowShowGoClient.prototype.health_check = function health_check() { // pragma: allowlist secret
  return this._request("GET", "/health");
};

KnowShowGoClient.prototype.healthCheck = function healthCheck() { // pragma: allowlist secret
  return this.health_check();
};

// ===== Prototypes =====
KnowShowGoClient.prototype.create_prototype = async function create_prototype({ // pragma: allowlist secret
  name,
  description = null,
  context = null,
  labels = [],
  embedding = null,
  parentPrototypeUuids = null,
  schema = null,
  metadata = {}
}) { // pragma: allowlist secret
  const out = await this._request("POST", "/api/prototypes", {
    json: { name, description, context, labels, embedding, parentPrototypeUuids, schema, metadata }
  });
  return getUuid(out);
};

KnowShowGoClient.prototype.createPrototype = function createPrototype(input) { // pragma: allowlist secret
  return this.create_prototype(input);
};

KnowShowGoClient.prototype.get_prototype = function get_prototype(uuid) { // pragma: allowlist secret
  return this._request("GET", `/api/prototypes/${encodeURIComponent(uuid)}`);
};

KnowShowGoClient.prototype.getPrototype = function getPrototype(uuid) { // pragma: allowlist secret
  return this.get_prototype(uuid);
};

KnowShowGoClient.prototype.upsert_prototype = function upsert_prototype(uuid, prototype) { // pragma: allowlist secret
  return this._request("PUT", `/api/prototypes/${encodeURIComponent(uuid)}`, { json: prototype });
};

KnowShowGoClient.prototype.upsertPrototype = function upsertPrototype(uuid, prototype) { // pragma: allowlist secret
  return this.upsert_prototype(uuid, prototype);
};

KnowShowGoClient.prototype.list_prototypes = function list_prototypes(params = {}) { // pragma: allowlist secret
  return this._request("GET", "/api/prototypes", { params });
};

KnowShowGoClient.prototype.listPrototypes = function listPrototypes(params = {}) { // pragma: allowlist secret
  return this.list_prototypes(params);
};

KnowShowGoClient.prototype.create_prototype_from_concept = async function create_prototype_from_concept(conceptUuid, options = {}) { // pragma: allowlist secret
  const out = await this._request("POST", `/api/concepts/${encodeURIComponent(conceptUuid)}/prototype`, {
    json: options
  });
  return getUuid(out);
};

KnowShowGoClient.prototype.createPrototypeFromConcept = function createPrototypeFromConcept(conceptUuid, options = {}) { // pragma: allowlist secret
  return this.create_prototype_from_concept(conceptUuid, options);
};

KnowShowGoClient.prototype.fuzzy_duck_type_concept = function fuzzy_duck_type_concept(jsonObj, options = {}) { // pragma: allowlist secret
  return this._request("POST", "/api/prototypes/duck-type", {
    json: { jsonObj, ...options }
  });
};

KnowShowGoClient.prototype.fuzzyDuckTypeConcept = function fuzzyDuckTypeConcept(jsonObj, options = {}) { // pragma: allowlist secret
  return this.fuzzy_duck_type_concept(jsonObj, options);
};

// ===== Concepts =====
KnowShowGoClient.prototype.create_concept = async function create_concept({ // pragma: allowlist secret
  prototypeUuid,
  jsonObj,
  embedding = null,
  previousVersionUuid = null,
  metadata = {}
}) { // pragma: allowlist secret
  const out = await this._request("POST", "/api/concepts", {
    json: { prototypeUuid, jsonObj, embedding, previousVersionUuid, metadata }
  });
  return getUuid(out);
};

KnowShowGoClient.prototype.createConcept = function createConcept(input) { // pragma: allowlist secret
  return this.create_concept(input);
};

KnowShowGoClient.prototype.create_concept_from_prototype = async function create_concept_from_prototype(prototypeUuid, jsonObj, options = {}) { // pragma: allowlist secret
  const out = await this._request("POST", `/api/prototypes/${encodeURIComponent(prototypeUuid)}/concepts`, {
    json: { jsonObj, ...options }
  });
  return getUuid(out);
};

KnowShowGoClient.prototype.createConceptFromPrototype = function createConceptFromPrototype(prototypeUuid, jsonObj, options = {}) { // pragma: allowlist secret
  return this.create_concept_from_prototype(prototypeUuid, jsonObj, options);
};

KnowShowGoClient.prototype.get_concept = function get_concept(uuid) { // pragma: allowlist secret
  return this._request("GET", `/api/concepts/${encodeURIComponent(uuid)}`);
};

KnowShowGoClient.prototype.getConcept = function getConcept(uuid) { // pragma: allowlist secret
  return this.get_concept(uuid);
};

KnowShowGoClient.prototype.upsert_concept = function upsert_concept(uuid, concept) { // pragma: allowlist secret
  return this._request("PUT", `/api/concepts/${encodeURIComponent(uuid)}`, { json: concept });
};

KnowShowGoClient.prototype.upsertConcept = function upsertConcept(uuid, concept) { // pragma: allowlist secret
  return this.upsert_concept(uuid, concept);
};

KnowShowGoClient.prototype.query_concepts = function query_concepts(query = {}) { // pragma: allowlist secret
  return this._request("POST", "/api/concepts/query", { json: query });
};

KnowShowGoClient.prototype.queryConcepts = function queryConcepts(query = {}) { // pragma: allowlist secret
  return this.query_concepts(query);
};

KnowShowGoClient.prototype.search_concepts = function search_concepts(query, { top_k = 10, similarity_threshold = 0.7, prototype_filter = null } = {}) { // pragma: allowlist secret
  return this._request("POST", "/api/concepts/search", {
    json: {
      query,
      topK: top_k,
      similarityThreshold: similarity_threshold,
      prototypeFilter: prototype_filter
    }
  }).then((r) => r.results ?? r);
};

KnowShowGoClient.prototype.searchConcepts = function searchConcepts(query, options = {}) { // pragma: allowlist secret
  return this.search_concepts(query, options);
};

// ===== Nodes with Documents =====
KnowShowGoClient.prototype.create_node_with_document = async function create_node_with_document({ // pragma: allowlist secret
  label,
  summary = null,
  tags = [],
  metadata = {},
  associations = [],
  prototypeUuid = null,
  uuid = null
}) { // pragma: allowlist secret
  const out = await this._request("POST", "/api/nodes", {
    json: { uuid, label, summary, tags, metadata, associations, prototypeUuid }
  });
  return getUuid(out);
};

KnowShowGoClient.prototype.createNodeWithDocument = function createNodeWithDocument(input) { // pragma: allowlist secret
  return this.create_node_with_document(input);
};

KnowShowGoClient.prototype.create_node = function create_node(input) { // pragma: allowlist secret
  return this.create_node_with_document(input);
};

KnowShowGoClient.prototype.createNode = function createNode(input) { // pragma: allowlist secret
  return this.create_node(input);
};

KnowShowGoClient.prototype.get_node = function get_node(uuid) { // pragma: allowlist secret
  return this._request("GET", `/api/nodes/${encodeURIComponent(uuid)}`);
};

KnowShowGoClient.prototype.getNode = function getNode(uuid) { // pragma: allowlist secret
  return this.get_node(uuid);
};

KnowShowGoClient.prototype.upsert_node = function upsert_node(uuid, node) { // pragma: allowlist secret
  return this._request("PUT", `/api/nodes/${encodeURIComponent(uuid)}`, { json: node });
};

KnowShowGoClient.prototype.upsertNode = function upsertNode(uuid, node) { // pragma: allowlist secret
  return this.upsert_node(uuid, node);
};

KnowShowGoClient.prototype.query_nodes = function query_nodes(query = {}) { // pragma: allowlist secret
  return this._request("POST", "/api/nodes/query", { json: query });
};

KnowShowGoClient.prototype.queryNodes = function queryNodes(query = {}) { // pragma: allowlist secret
  return this.query_nodes(query);
};

KnowShowGoClient.prototype.update_node_embedding = function update_node_embedding(uuid) { // pragma: allowlist secret
  return this._request("POST", `/api/nodes/${encodeURIComponent(uuid)}/embedding`);
};

KnowShowGoClient.prototype.updateNodeEmbedding = function updateNodeEmbedding(uuid) { // pragma: allowlist secret
  return this.update_node_embedding(uuid);
};

// ===== Vector and Graph Search =====
KnowShowGoClient.prototype.vector_search = function vector_search({ embedding, text, topK = 10, filters = {}, prototypeFilter = null } = {}) { // pragma: allowlist secret
  return this._request("POST", "/api/search/vector", {
    json: { embedding, text, topK, filters, prototypeFilter }
  });
};

KnowShowGoClient.prototype.vectorSearch = function vectorSearch(input = {}) { // pragma: allowlist secret
  return this.vector_search(input);
};

KnowShowGoClient.prototype.embedding_search = function embedding_search(embedding, options = {}) { // pragma: allowlist secret
  return this.vector_search({ embedding, ...options });
};

KnowShowGoClient.prototype.embeddingSearch = function embeddingSearch(embedding, options = {}) { // pragma: allowlist secret
  return this.embedding_search(embedding, options);
};

KnowShowGoClient.prototype.graph_search = function graph_search({ startUuid, query = null, relationTypes = [], maxDepth = 2, direction = "both", limit = 50 } = {}) { // pragma: allowlist secret
  return this._request("POST", "/api/graph/search", {
    json: { startUuid, query, relationTypes, maxDepth, direction, limit }
  });
};

KnowShowGoClient.prototype.graphSearch = function graphSearch(input = {}) { // pragma: allowlist secret
  return this.graph_search(input);
};

KnowShowGoClient.prototype.graph_neighbors = function graph_neighbors(uuid, { direction = "both", relationTypes = [], limit = 50 } = {}) { // pragma: allowlist secret
  return this._request("GET", `/api/graph/nodes/${encodeURIComponent(uuid)}/neighbors`, {
    params: { direction, relationTypes, limit }
  });
};

KnowShowGoClient.prototype.graphNeighbors = function graphNeighbors(uuid, options = {}) { // pragma: allowlist secret
  return this.graph_neighbors(uuid, options);
};

// ===== Associations =====
KnowShowGoClient.prototype.add_association = function add_association({ from_concept_uuid, to_concept_uuid, relation_type, strength = 1.0 }) { // pragma: allowlist secret
  return this._request("POST", "/api/associations", {
    json: {
      fromConceptUuid: from_concept_uuid,
      toConceptUuid: to_concept_uuid,
      relationType: relation_type,
      strength
    }
  });
};

KnowShowGoClient.prototype.addAssociation = function addAssociation(input) { // pragma: allowlist secret
  return this.add_association(input);
};

KnowShowGoClient.prototype.get_associations = function get_associations(uuid, { direction = "both" } = {}) { // pragma: allowlist secret
  return this._request("GET", `/api/associations/${encodeURIComponent(uuid)}`, {
    params: { direction }
  }).then((r) => r.associations ?? r);
};

KnowShowGoClient.prototype.getAssociations = function getAssociations(uuid, options = {}) { // pragma: allowlist secret
  return this.get_associations(uuid, options);
};

// ===== ORM =====
KnowShowGoClient.prototype.register_prototype = function register_prototype(prototype_name, options = {}) { // pragma: allowlist secret
  return this._request("POST", "/api/orm/register", {
    json: { prototypeName: prototype_name, options }
  });
};

KnowShowGoClient.prototype.registerPrototype = function registerPrototype(prototypeName, options = {}) { // pragma: allowlist secret
  return this.register_prototype(prototypeName, options);
};

KnowShowGoClient.prototype.create_instance = function create_instance(prototype_name, properties) { // pragma: allowlist secret
  return this._request("POST", `/api/orm/${encodeURIComponent(prototype_name)}/create`, {
    json: { properties }
  });
};

KnowShowGoClient.prototype.createInstance = function createInstance(prototypeName, properties) { // pragma: allowlist secret
  return this.create_instance(prototypeName, properties);
};

KnowShowGoClient.prototype.get_instance = function get_instance(prototype_name, uuid) { // pragma: allowlist secret
  return this._request("GET", `/api/orm/${encodeURIComponent(prototype_name)}/${encodeURIComponent(uuid)}`);
};

KnowShowGoClient.prototype.getInstance = function getInstance(prototypeName, uuid) { // pragma: allowlist secret
  return this.get_instance(prototypeName, uuid);
};

// ===== Assertions / Facts =====
KnowShowGoClient.prototype.create_assertion = function create_assertion({ subject, predicate, object, truth = 1.0, source = "user" }) { // pragma: allowlist secret
  return this._request("POST", "/api/assertions", {
    json: { subject, predicate, object, truth, source }
  });
};

KnowShowGoClient.prototype.createAssertion = function createAssertion(input) { // pragma: allowlist secret
  return this.create_assertion(input);
};

KnowShowGoClient.prototype.get_assertions = function get_assertions({ subject, predicate, object } = {}) { // pragma: allowlist secret
  return this._request("GET", "/api/assertions", {
    params: { subject, predicate, object }
  }).then((r) => r.assertions ?? r);
};

KnowShowGoClient.prototype.getAssertions = function getAssertions(input = {}) { // pragma: allowlist secret
  return this.get_assertions(input);
};

KnowShowGoClient.prototype.get_snapshot = function get_snapshot(entityId) { // pragma: allowlist secret
  return this._request("GET", `/api/entities/${encodeURIComponent(entityId)}/snapshot`).then((r) => r.snapshot ?? r);
};

KnowShowGoClient.prototype.getSnapshot = function getSnapshot(entityId) { // pragma: allowlist secret
  return this.get_snapshot(entityId);
};

KnowShowGoClient.prototype.get_evidence = function get_evidence(entityId, { predicate } = {}) { // pragma: allowlist secret
  return this._request("GET", `/api/entities/${encodeURIComponent(entityId)}/evidence`, {
    params: { predicate }
  }).then((r) => r.evidence ?? r);
};

KnowShowGoClient.prototype.getEvidence = function getEvidence(entityId, options = {}) { // pragma: allowlist secret
  return this.get_evidence(entityId, options);
};

KnowShowGoClient.prototype.store_fact = function store_fact({ subject, predicate, object, status = "verified", confidence = 1.0, source = null }) { // pragma: allowlist secret
  return this._request("POST", "/api/facts", {
    json: { subject, predicate, object, status, confidence, source }
  });
};

KnowShowGoClient.prototype.storeFact = function storeFact(input) { // pragma: allowlist secret
  return this.store_fact(input);
};

KnowShowGoClient.prototype.store_facts_bulk = function store_facts_bulk(facts) { // pragma: allowlist secret
  const factObjects = facts.map((fact) =>
    Array.isArray(fact)
      ? { subject: fact[0], predicate: fact[1], object: fact[2] }
      : fact
  );
  return this._request("POST", "/api/facts/bulk", { json: { facts: factObjects } });
};

KnowShowGoClient.prototype.storeFactsBulk = function storeFactsBulk(facts) { // pragma: allowlist secret
  return this.store_facts_bulk(facts);
};

KnowShowGoClient.prototype.verify = function verify(claim, { threshold = 0.7 } = {}) { // pragma: allowlist secret
  return this._request("POST", "/api/verify", { json: { claim, threshold } });
};

KnowShowGoClient.prototype.get_fact_stats = function get_fact_stats() { // pragma: allowlist secret
  return this._request("GET", "/api/facts/stats");
};

KnowShowGoClient.prototype.getFactStats = function getFactStats() { // pragma: allowlist secret
  return this.get_fact_stats();
};

// ===== CPMS-style concept/prototype matching helpers =====
KnowShowGoClient.prototype.match_concept = function match_concept(concept, observation) { // pragma: allowlist secret
  return this._request("POST", "/cpms/match", { json: { concept, observation } });
};

KnowShowGoClient.prototype.matchConcept = function matchConcept(concept, observation) { // pragma: allowlist secret
  return this.match_concept(concept, observation);
};

KnowShowGoClient.prototype.match_concept_explain = function match_concept_explain(concept, observation) { // pragma: allowlist secret
  return this._request("POST", "/cpms/match_explain", { json: { concept, observation } });
};

KnowShowGoClient.prototype.matchConceptExplain = function matchConceptExplain(concept, observation) { // pragma: allowlist secret
  return this.match_concept_explain(concept, observation);
};

KnowShowGoClient.prototype.match_pattern = function match_pattern(pattern, concepts, observation) { // pragma: allowlist secret
  return this._request("POST", "/cpms/match_pattern", { json: { pattern, concepts, observation } });
};

KnowShowGoClient.prototype.matchPattern = function matchPattern(pattern, concepts, observation) { // pragma: allowlist secret
  return this.match_pattern(pattern, concepts, observation);
};

KnowShowGoClient.prototype.detect_form = function detect_form(input = {}) { // pragma: allowlist secret
  return this._request("POST", "/cpms/detect_form", { json: input });
};

KnowShowGoClient.prototype.detectForm = function detectForm(input = {}) { // pragma: allowlist secret
  return this.detect_form(input);
};

KnowShowGoClient.prototype.cpms_create_concept = function cpms_create_concept(concept) { // pragma: allowlist secret
  return this._request("POST", "/cpms/concepts", { json: { concept } });
};

KnowShowGoClient.prototype.cpmsCreateConcept = function cpmsCreateConcept(concept) { // pragma: allowlist secret
  return this.cpms_create_concept(concept);
};

KnowShowGoClient.prototype.cpms_upsert_concept = function cpms_upsert_concept(id, patch) { // pragma: allowlist secret
  return this._request("PATCH", `/cpms/concepts/${encodeURIComponent(id)}`, { json: { patch } });
};

KnowShowGoClient.prototype.cpmsUpsertConcept = function cpmsUpsertConcept(id, patch) { // pragma: allowlist secret
  return this.cpms_upsert_concept(id, patch);
};

KnowShowGoClient.prototype.cpms_get_concept = function cpms_get_concept(id) { // pragma: allowlist secret
  return this._request("GET", `/cpms/concepts/${encodeURIComponent(id)}`);
};

KnowShowGoClient.prototype.cpmsGetConcept = function cpmsGetConcept(id) { // pragma: allowlist secret
  return this.cpms_get_concept(id);
};

KnowShowGoClient.prototype.cpms_create_pattern = function cpms_create_pattern(pattern) { // pragma: allowlist secret
  return this._request("POST", "/cpms/patterns", { json: { pattern } });
};

KnowShowGoClient.prototype.cpmsCreatePattern = function cpmsCreatePattern(pattern) { // pragma: allowlist secret
  return this.cpms_create_pattern(pattern);
};

KnowShowGoClient.prototype.cpms_upsert_pattern = function cpms_upsert_pattern(id, patch) { // pragma: allowlist secret
  return this._request("PATCH", `/cpms/patterns/${encodeURIComponent(id)}`, { json: { patch } });
};

KnowShowGoClient.prototype.cpmsUpsertPattern = function cpmsUpsertPattern(id, patch) { // pragma: allowlist secret
  return this.cpms_upsert_pattern(id, patch);
};

KnowShowGoClient.prototype.cpms_get_pattern = function cpms_get_pattern(id) { // pragma: allowlist secret
  return this._request("GET", `/cpms/patterns/${encodeURIComponent(id)}`);
};

KnowShowGoClient.prototype.cpmsGetPattern = function cpmsGetPattern(id) { // pragma: allowlist secret
  return this.cpms_get_pattern(id);
};

export default KnowShowGoClient; // pragma: allowlist secret
