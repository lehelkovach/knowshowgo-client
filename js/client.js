/**
 * KnowShowGo JavaScript REST API Client
 *
 * Mirrors the Python client in `api/python/client.py`.
 */

export class KnowShowGoClient {
  /**
   * @param {Object} options
   * @param {string} [options.baseUrl='http://localhost:3000']
   * @param {typeof fetch} [options.fetchImpl]
   */
  constructor({ baseUrl = 'http://localhost:3000', fetchImpl } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetch = fetchImpl ?? fetch;
  }

  async _request(method, endpoint, { json, params } = {}) {
    const url = new URL(this.baseUrl + endpoint);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const hasJsonBody = json !== undefined;
    const res = await this.fetch(url.toString(), {
      method,
      headers: hasJsonBody ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      body: hasJsonBody ? JSON.stringify(json) : undefined
    });

    if (res.status === 204) return null;

    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const message =
        typeof payload === 'object' && payload && payload.error
          ? payload.error
          : `Request failed: ${method} ${endpoint} (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.body = payload;
      throw err;
    }

    return payload;
  }

  // ===== Health =====
  health_check() {
    return this._request('GET', '/health');
  }

  // ===== Topic Registry / Phrase Tags =====
  create_topic(payload) {
    return this._request('POST', '/api/topics', { json: payload });
  }

  get_topic(uuid) {
    return this._request('GET', `/api/topics/${encodeURIComponent(uuid)}`);
  }

  resolve_topic_tag(payload) {
    return this._request('POST', '/api/topics/resolve-tag', { json: payload });
  }

  resolve_topic(payload) {
    return this.resolve_topic_tag(payload);
  }

  // ===== Object Categories / Prototypes =====
  create_category(payload) {
    return this._request('POST', '/api/object-categories', { json: payload });
  }

  create_object_category(payload) {
    return this.create_category(payload);
  }

  upsert_category(payload) {
    return this._request('POST', '/api/object-categories/upsert', { json: payload });
  }

  upsert_object_category(payload) {
    return this.upsert_category(payload);
  }

  get_category(uuid) {
    return this._request('GET', `/api/object-categories/${encodeURIComponent(uuid)}`);
  }

  get_object_category(uuid) {
    return this.get_category(uuid);
  }

  // ===== Semantic Object Instances =====
  upsert_object(payload) {
    return this._request('POST', '/api/objects/upsert', { json: payload });
  }

  get_object(uuid, params = {}) {
    return this._request('GET', `/api/objects/${encodeURIComponent(uuid)}`, { params });
  }

  resolve_object(payload) {
    return this._request('POST', '/api/objects/resolve', { json: payload });
  }

  generalize_object(payload) {
    return this._request('POST', '/api/objects/generalize', { json: payload });
  }

  // ===== ConceptObject Suggestion / Search =====
  suggest_concept_objects(payload) {
    return this._request('POST', '/api/concept-objects/suggest', { json: payload });
  }

  search_concept_objects(payload) {
    return this._request('POST', '/api/concept-objects/search', { json: payload });
  }

  suggest_prototypes(payload) {
    return this._request('POST', '/api/concept-objects/suggest-prototypes', { json: payload });
  }

  suggest_concept_object_prototypes(payload) {
    return this.suggest_prototypes(payload);
  }

  // ===== Composite ConceptObjects =====
  create_composite(payload) {
    return this._request('POST', '/api/composites', { json: payload });
  }

  get_composite(uuid) {
    return this._request('GET', `/api/composites/${encodeURIComponent(uuid)}`);
  }

  update_composite_component(compositeUuid, componentUuid, payload) {
    return this._request(
      'POST',
      `/api/composites/${encodeURIComponent(compositeUuid)}/components/${encodeURIComponent(componentUuid)}/update`,
      { json: payload }
    );
  }

  // ===== Assertions / Evidence / Snapshots =====
  create_assertion(payload) {
    return this._request('POST', '/api/assertions', { json: payload });
  }

  get_assertions(params = {}) {
    return this._request('GET', '/api/assertions', { params });
  }

  vote_assertion(id, delta = 1) {
    return this._request('POST', `/api/assertions/${encodeURIComponent(id)}/vote`, { json: { delta } });
  }

  get_snapshot(entityId) {
    return this._request('GET', `/api/entities/${encodeURIComponent(entityId)}/snapshot`);
  }

  get_evidence(entityId, params = {}) {
    return this._request('GET', `/api/entities/${encodeURIComponent(entityId)}/evidence`, { params });
  }

  explain_entity(entityId, params = {}) {
    return this._request('GET', `/api/entities/${encodeURIComponent(entityId)}/explain`, { params });
  }

  get_explain(entityId, params = {}) {
    return this.explain_entity(entityId, params);
  }

  // ===== Procedure DAGs =====
  create_procedure(payload) {
    return this._request('POST', '/api/procedures', { json: payload });
  }

  get_procedure(uuid) {
    return this._request('GET', `/api/procedures/${encodeURIComponent(uuid)}`);
  }

  insert_procedure_step(uuid, payload) {
    return this._request('POST', `/api/procedures/${encodeURIComponent(uuid)}/steps`, { json: payload });
  }

  generalize_procedure(uuid, payload) {
    return this._request('POST', `/api/procedures/${encodeURIComponent(uuid)}/generalize`, { json: payload });
  }

  import_procedure_json(payload) {
    return this._request('POST', '/api/procedures/import-json', { json: payload });
  }

  import_json_procedure(payload) {
    return this.import_procedure_json(payload);
  }

  repair_procedure_selector(uuid, payload) {
    return this._request('POST', `/api/procedures/${encodeURIComponent(uuid)}/repair-selector`, { json: payload });
  }

  search_procedures(queryOrPayload, { topK } = {}) {
    const payload = typeof queryOrPayload === 'object' && queryOrPayload !== null
      ? queryOrPayload
      : { query: queryOrPayload, topK };
    return this._request('POST', '/api/procedures/search', { json: payload });
  }

  // ===== Logic DAGs =====
  create_syllogism(payload) {
    return this._request('POST', '/api/logic/syllogisms', { json: payload });
  }

  get_syllogism(uuid) {
    return this._request('GET', `/api/logic/syllogisms/${encodeURIComponent(uuid)}`);
  }

  // ===== App Scenario Primitives =====
  register_market_match(payload) {
    return this._request('POST', '/api/market/matches/register', { json: payload });
  }

  search_market_matches(payload) {
    return this._request('POST', '/api/market/matches/search', { json: payload });
  }

  subscribe_channel(payload) {
    return this._request('POST', '/api/channels/subscribe', { json: payload });
  }

  post_channel_message(payload) {
    return this._request('POST', '/api/channels/messages', { json: payload });
  }

  get_channel_feed(actorIdOrParams) {
    const params = typeof actorIdOrParams === 'object' && actorIdOrParams !== null
      ? actorIdOrParams
      : { actorId: actorIdOrParams };
    return this._request('GET', '/api/channels/feed', { params });
  }

  create_repeating_event(payload) {
    return this._request('POST', '/api/events/repeating', { json: payload });
  }

  rate_entity(uuid, payload) {
    return this._request('POST', `/api/ratings/${encodeURIComponent(uuid)}`, { json: payload });
  }

  get_ratings(uuid) {
    return this._request('GET', `/api/ratings/${encodeURIComponent(uuid)}`);
  }

  // ===== Prototypes =====
  async create_prototype({
    name,
    description = null,
    context = null,
    labels = [],
    embedding = null,
    parentPrototypeUuids = null
  }) {
    const out = await this._request('POST', '/api/prototypes', {
      json: { name, description, context, labels, embedding, parentPrototypeUuids }
    });
    return out.uuid;
  }

  get_prototype(uuid) {
    return this._request('GET', `/api/prototypes/${encodeURIComponent(uuid)}`);
  }

  // ===== Concepts =====
  async create_concept({
    prototypeUuid,
    jsonObj,
    embedding = null,
    previousVersionUuid = null
  }) {
    const out = await this._request('POST', '/api/concepts', {
      json: { prototypeUuid, jsonObj, embedding, previousVersionUuid }
    });
    return out.uuid;
  }

  get_concept(uuid) {
    return this._request('GET', `/api/concepts/${encodeURIComponent(uuid)}`);
  }

  search_concepts(query, { top_k = 10, similarity_threshold = 0.7, prototype_filter = null } = {}) {
    return this._request('POST', '/api/concepts/search', {
      json: {
        query,
        topK: top_k,
        similarityThreshold: similarity_threshold,
        prototypeFilter: prototype_filter
      }
    }).then(r => r.results);
  }

  // ===== Associations =====
  add_association({ from_concept_uuid, to_concept_uuid, relation_type, strength = 1.0 }) {
    return this._request('POST', '/api/associations', {
      json: {
        fromConceptUuid: from_concept_uuid,
        toConceptUuid: to_concept_uuid,
        relationType: relation_type,
        strength
      }
    });
  }

  get_associations(uuid, { direction = 'both' } = {}) {
    return this._request('GET', `/api/associations/${encodeURIComponent(uuid)}`, {
      params: { direction }
    }).then(r => r.associations);
  }

  // ===== Nodes with Documents =====
  async create_node_with_document({
    label,
    summary = null,
    tags = [],
    metadata = {},
    associations = [],
    prototypeUuid = null
  }) {
    const out = await this._request('POST', '/api/nodes', {
      json: { label, summary, tags, metadata, associations, prototypeUuid }
    });
    return out.uuid;
  }

  update_node_embedding(uuid) {
    return this._request('POST', `/api/nodes/${encodeURIComponent(uuid)}/embedding`);
  }

  // ===== ORM =====
  register_prototype(prototype_name, options = {}) {
    return this._request('POST', '/api/orm/register', {
      json: { prototypeName: prototype_name, options }
    });
  }

  create_instance(prototype_name, properties) {
    return this._request('POST', `/api/orm/${encodeURIComponent(prototype_name)}/create`, {
      json: { properties }
    });
  }

  get_instance(prototype_name, uuid) {
    return this._request('GET', `/api/orm/${encodeURIComponent(prototype_name)}/${encodeURIComponent(uuid)}`);
  }
}

