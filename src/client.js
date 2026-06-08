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

export class KnowShowGoError extends Error { // pragma: allowlist secret
  constructor(message, { status, body, method, endpoint } = {}) {
    super(message);
    this.name = "KSGError";
    this.status = status;
    this.body = body;
    this.method = method;
    this.endpoint = endpoint;
  }
}

export class KnowShowGoClient { // pragma: allowlist secret
  /**
   * @param {Object} options
   * @param {string} [options.baseUrl] Service base URL.
   * @param {typeof fetch} [options.fetchImpl] Fetch-compatible implementation.
   * @param {Record<string, string>} [options.headers] Additional headers for every request.
   * @param {string} [options.apiToken] Optional bearer token.
   * @param {number} [options.timeoutMs] Optional request timeout.
   */
  constructor({ baseUrl = getDefaultBaseUrl(), fetchImpl, headers = {}, apiToken, timeoutMs } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetch = fetchImpl ?? getDefaultFetch();
    this.headers = { ...headers };
    this.apiToken = apiToken;
    this.timeoutMs = timeoutMs;
  }

  async _request(method, endpoint, { json, params, headers = {} } = {}) {
    const url = new URL(this.baseUrl + endpoint);
    appendParams(url, params);

    const controller = this.timeoutMs ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : null;

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
  }

  // ===== Health =====
  health_check() {
    return this._request("GET", "/health");
  }

  healthCheck() {
    return this.health_check();
  }

  // ===== Prototypes =====
  async create_prototype({
    name,
    description = null,
    context = null,
    labels = [],
    embedding = null,
    parentPrototypeUuids = null,
    schema = null,
    metadata = {}
  }) {
    const out = await this._request("POST", "/api/prototypes", {
      json: { name, description, context, labels, embedding, parentPrototypeUuids, schema, metadata }
    });
    return getUuid(out);
  }

  createPrototype(input) {
    return this.create_prototype(input);
  }

  get_prototype(uuid) {
    return this._request("GET", `/api/prototypes/${encodeURIComponent(uuid)}`);
  }

  getPrototype(uuid) {
    return this.get_prototype(uuid);
  }

  upsert_prototype(uuid, prototype) {
    return this._request("PUT", `/api/prototypes/${encodeURIComponent(uuid)}`, { json: prototype });
  }

  upsertPrototype(uuid, prototype) {
    return this.upsert_prototype(uuid, prototype);
  }

  list_prototypes(params = {}) {
    return this._request("GET", "/api/prototypes", { params });
  }

  listPrototypes(params = {}) {
    return this.list_prototypes(params);
  }

  async create_prototype_from_concept(conceptUuid, options = {}) {
    const out = await this._request("POST", `/api/concepts/${encodeURIComponent(conceptUuid)}/prototype`, {
      json: options
    });
    return getUuid(out);
  }

  createPrototypeFromConcept(conceptUuid, options = {}) {
    return this.create_prototype_from_concept(conceptUuid, options);
  }

  fuzzy_duck_type_concept(jsonObj, options = {}) {
    return this._request("POST", "/api/prototypes/duck-type", {
      json: { jsonObj, ...options }
    });
  }

  fuzzyDuckTypeConcept(jsonObj, options = {}) {
    return this.fuzzy_duck_type_concept(jsonObj, options);
  }

  // ===== Concepts =====
  async create_concept({
    prototypeUuid,
    jsonObj,
    embedding = null,
    previousVersionUuid = null,
    metadata = {}
  }) {
    const out = await this._request("POST", "/api/concepts", {
      json: { prototypeUuid, jsonObj, embedding, previousVersionUuid, metadata }
    });
    return getUuid(out);
  }

  createConcept(input) {
    return this.create_concept(input);
  }

  async create_concept_from_prototype(prototypeUuid, jsonObj, options = {}) {
    const out = await this._request("POST", `/api/prototypes/${encodeURIComponent(prototypeUuid)}/concepts`, {
      json: { jsonObj, ...options }
    });
    return getUuid(out);
  }

  createConceptFromPrototype(prototypeUuid, jsonObj, options = {}) {
    return this.create_concept_from_prototype(prototypeUuid, jsonObj, options);
  }

  get_concept(uuid) {
    return this._request("GET", `/api/concepts/${encodeURIComponent(uuid)}`);
  }

  getConcept(uuid) {
    return this.get_concept(uuid);
  }

  upsert_concept(uuid, concept) {
    return this._request("PUT", `/api/concepts/${encodeURIComponent(uuid)}`, { json: concept });
  }

  upsertConcept(uuid, concept) {
    return this.upsert_concept(uuid, concept);
  }

  query_concepts(query = {}) {
    return this._request("POST", "/api/concepts/query", { json: query });
  }

  queryConcepts(query = {}) {
    return this.query_concepts(query);
  }

  search_concepts(query, { top_k = 10, similarity_threshold = 0.7, prototype_filter = null } = {}) {
    return this._request("POST", "/api/concepts/search", {
      json: {
        query,
        topK: top_k,
        similarityThreshold: similarity_threshold,
        prototypeFilter: prototype_filter
      }
    }).then((r) => r.results ?? r);
  }

  searchConcepts(query, options = {}) {
    return this.search_concepts(query, options);
  }

  // ===== Nodes with Documents =====
  async create_node_with_document({
    label,
    summary = null,
    tags = [],
    metadata = {},
    associations = [],
    prototypeUuid = null,
    uuid = null
  }) {
    const out = await this._request("POST", "/api/nodes", {
      json: { uuid, label, summary, tags, metadata, associations, prototypeUuid }
    });
    return getUuid(out);
  }

  createNodeWithDocument(input) {
    return this.create_node_with_document(input);
  }

  create_node(input) {
    return this.create_node_with_document(input);
  }

  createNode(input) {
    return this.create_node(input);
  }

  get_node(uuid) {
    return this._request("GET", `/api/nodes/${encodeURIComponent(uuid)}`);
  }

  getNode(uuid) {
    return this.get_node(uuid);
  }

  upsert_node(uuid, node) {
    return this._request("PUT", `/api/nodes/${encodeURIComponent(uuid)}`, { json: node });
  }

  upsertNode(uuid, node) {
    return this.upsert_node(uuid, node);
  }

  query_nodes(query = {}) {
    return this._request("POST", "/api/nodes/query", { json: query });
  }

  queryNodes(query = {}) {
    return this.query_nodes(query);
  }

  update_node_embedding(uuid) {
    return this._request("POST", `/api/nodes/${encodeURIComponent(uuid)}/embedding`);
  }

  updateNodeEmbedding(uuid) {
    return this.update_node_embedding(uuid);
  }

  // ===== Vector and Graph Search =====
  vector_search({ embedding, text, topK = 10, filters = {}, prototypeFilter = null } = {}) {
    return this._request("POST", "/api/search/vector", {
      json: { embedding, text, topK, filters, prototypeFilter }
    });
  }

  vectorSearch(input = {}) {
    return this.vector_search(input);
  }

  embedding_search(embedding, options = {}) {
    return this.vector_search({ embedding, ...options });
  }

  embeddingSearch(embedding, options = {}) {
    return this.embedding_search(embedding, options);
  }

  graph_search({ startUuid, query = null, relationTypes = [], maxDepth = 2, direction = "both", limit = 50 } = {}) {
    return this._request("POST", "/api/graph/search", {
      json: { startUuid, query, relationTypes, maxDepth, direction, limit }
    });
  }

  graphSearch(input = {}) {
    return this.graph_search(input);
  }

  graph_neighbors(uuid, { direction = "both", relationTypes = [], limit = 50 } = {}) {
    return this._request("GET", `/api/graph/nodes/${encodeURIComponent(uuid)}/neighbors`, {
      params: { direction, relationTypes, limit }
    });
  }

  graphNeighbors(uuid, options = {}) {
    return this.graph_neighbors(uuid, options);
  }

  // ===== Associations =====
  add_association({ from_concept_uuid, to_concept_uuid, relation_type, strength = 1.0 }) {
    return this._request("POST", "/api/associations", {
      json: {
        fromConceptUuid: from_concept_uuid,
        toConceptUuid: to_concept_uuid,
        relationType: relation_type,
        strength
      }
    });
  }

  addAssociation(input) {
    return this.add_association(input);
  }

  get_associations(uuid, { direction = "both" } = {}) {
    return this._request("GET", `/api/associations/${encodeURIComponent(uuid)}`, {
      params: { direction }
    }).then((r) => r.associations ?? r);
  }

  getAssociations(uuid, options = {}) {
    return this.get_associations(uuid, options);
  }

  // ===== ORM =====
  register_prototype(prototype_name, options = {}) {
    return this._request("POST", "/api/orm/register", {
      json: { prototypeName: prototype_name, options }
    });
  }

  registerPrototype(prototypeName, options = {}) {
    return this.register_prototype(prototypeName, options);
  }

  create_instance(prototype_name, properties) {
    return this._request("POST", `/api/orm/${encodeURIComponent(prototype_name)}/create`, {
      json: { properties }
    });
  }

  createInstance(prototypeName, properties) {
    return this.create_instance(prototypeName, properties);
  }

  get_instance(prototype_name, uuid) {
    return this._request("GET", `/api/orm/${encodeURIComponent(prototype_name)}/${encodeURIComponent(uuid)}`);
  }

  getInstance(prototypeName, uuid) {
    return this.get_instance(prototypeName, uuid);
  }

  // ===== Assertions / Facts =====
  create_assertion({ subject, predicate, object, truth = 1.0, source = "user" }) {
    return this._request("POST", "/api/assertions", {
      json: { subject, predicate, object, truth, source }
    });
  }

  createAssertion(input) {
    return this.create_assertion(input);
  }

  get_assertions({ subject, predicate, object } = {}) {
    return this._request("GET", "/api/assertions", {
      params: { subject, predicate, object }
    }).then((r) => r.assertions ?? r);
  }

  getAssertions(input = {}) {
    return this.get_assertions(input);
  }

  get_snapshot(entityId) {
    return this._request("GET", `/api/entities/${encodeURIComponent(entityId)}/snapshot`).then((r) => r.snapshot ?? r);
  }

  getSnapshot(entityId) {
    return this.get_snapshot(entityId);
  }

  get_evidence(entityId, { predicate } = {}) {
    return this._request("GET", `/api/entities/${encodeURIComponent(entityId)}/evidence`, {
      params: { predicate }
    }).then((r) => r.evidence ?? r);
  }

  getEvidence(entityId, options = {}) {
    return this.get_evidence(entityId, options);
  }

  store_fact({ subject, predicate, object, status = "verified", confidence = 1.0, source = null }) {
    return this._request("POST", "/api/facts", {
      json: { subject, predicate, object, status, confidence, source }
    });
  }

  storeFact(input) {
    return this.store_fact(input);
  }

  store_facts_bulk(facts) {
    const factObjects = facts.map((fact) =>
      Array.isArray(fact)
        ? { subject: fact[0], predicate: fact[1], object: fact[2] }
        : fact
    );
    return this._request("POST", "/api/facts/bulk", { json: { facts: factObjects } });
  }

  storeFactsBulk(facts) {
    return this.store_facts_bulk(facts);
  }

  verify(claim, { threshold = 0.7 } = {}) {
    return this._request("POST", "/api/verify", { json: { claim, threshold } });
  }

  get_fact_stats() {
    return this._request("GET", "/api/facts/stats");
  }

  getFactStats() {
    return this.get_fact_stats();
  }

  // ===== CPMS-style concept/prototype matching helpers =====
  match_concept(concept, observation) {
    return this._request("POST", "/cpms/match", { json: { concept, observation } });
  }

  matchConcept(concept, observation) {
    return this.match_concept(concept, observation);
  }

  match_concept_explain(concept, observation) {
    return this._request("POST", "/cpms/match_explain", { json: { concept, observation } });
  }

  matchConceptExplain(concept, observation) {
    return this.match_concept_explain(concept, observation);
  }

  match_pattern(pattern, concepts, observation) {
    return this._request("POST", "/cpms/match_pattern", { json: { pattern, concepts, observation } });
  }

  matchPattern(pattern, concepts, observation) {
    return this.match_pattern(pattern, concepts, observation);
  }

  detect_form(input = {}) {
    return this._request("POST", "/cpms/detect_form", { json: input });
  }

  detectForm(input = {}) {
    return this.detect_form(input);
  }

  cpms_create_concept(concept) {
    return this._request("POST", "/cpms/concepts", { json: { concept } });
  }

  cpmsCreateConcept(concept) {
    return this.cpms_create_concept(concept);
  }

  cpms_upsert_concept(id, patch) {
    return this._request("PATCH", `/cpms/concepts/${encodeURIComponent(id)}`, { json: { patch } });
  }

  cpmsUpsertConcept(id, patch) {
    return this.cpms_upsert_concept(id, patch);
  }

  cpms_get_concept(id) {
    return this._request("GET", `/cpms/concepts/${encodeURIComponent(id)}`);
  }

  cpmsGetConcept(id) {
    return this.cpms_get_concept(id);
  }

  cpms_create_pattern(pattern) {
    return this._request("POST", "/cpms/patterns", { json: { pattern } });
  }

  cpmsCreatePattern(pattern) {
    return this.cpms_create_pattern(pattern);
  }

  cpms_upsert_pattern(id, patch) {
    return this._request("PATCH", `/cpms/patterns/${encodeURIComponent(id)}`, { json: { patch } });
  }

  cpmsUpsertPattern(id, patch) {
    return this.cpms_upsert_pattern(id, patch);
  }

  cpms_get_pattern(id) {
    return this._request("GET", `/cpms/patterns/${encodeURIComponent(id)}`);
  }

  cpmsGetPattern(id) {
    return this.cpms_get_pattern(id);
  }
}

export default KnowShowGoClient; // pragma: allowlist secret
