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

    const res = await this.fetch(url.toString(), {
      method,
      headers: json ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      body: json ? JSON.stringify(json) : undefined
    });

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

  // ===== Assertions (v0.2.0/v0.2.1) =====
  create_assertion({
    subject,
    predicate,
    obj,
    truth = 1.0,
    source = 'user',
    strength = null,
    vote_score = null,
    source_rel = null,
    status = null,
    prev_assertion_id = null,
    provenance = null
  }) {
    return this._request('POST', '/api/assertions', {
      json: {
        subject,
        predicate,
        object: obj,
        truth,
        source,
        strength,
        voteScore: vote_score,
        sourceRel: source_rel,
        status,
        prevAssertionId: prev_assertion_id,
        provenance
      }
    });
  }

  get_assertions({ subject = null, predicate = null, obj = undefined } = {}) {
    const params = {};
    if (subject !== null && subject !== undefined) params.subject = subject;
    if (predicate !== null && predicate !== undefined) params.predicate = predicate;
    if (obj !== undefined) params.object = obj;
    return this._request('GET', '/api/assertions', { params }).then(r => r.assertions);
  }

  vote_assertion(assertion_id, { delta = 1 } = {}) {
    return this._request('POST', `/api/assertions/${encodeURIComponent(assertion_id)}/vote`, {
      json: { delta }
    }).then(r => r.assertion);
  }

  get_snapshot(entity_id) {
    return this._request('GET', `/api/entities/${encodeURIComponent(entity_id)}/snapshot`).then(r => r.snapshot);
  }

  get_evidence(entity_id, { predicate = null } = {}) {
    return this._request('GET', `/api/entities/${encodeURIComponent(entity_id)}/evidence`, {
      params: { predicate }
    }).then(r => r.evidence);
  }

  explain_entity(entity_id, { predicate = null } = {}) {
    return this._request('GET', `/api/entities/${encodeURIComponent(entity_id)}/explain`, {
      params: { predicate }
    });
  }

  // ===== Verification / Hallucination Detection =====
  store_fact({
    subject,
    predicate,
    obj,
    status = 'verified',
    confidence = 1.0,
    source = null
  }) {
    return this._request('POST', '/api/facts', {
      json: { subject, predicate, object: obj, status, confidence, source }
    });
  }

  store_facts_bulk(facts) {
    const normalizedFacts = (facts || []).map((fact) => {
      if (Array.isArray(fact)) {
        return {
          subject: fact[0],
          predicate: fact[1],
          object: fact[2]
        };
      }
      const { obj, ...rest } = fact || {};
      return {
        ...rest,
        object: rest.object ?? obj
      };
    });

    return this._request('POST', '/api/facts/bulk', {
      json: { facts: normalizedFacts }
    });
  }

  verify(claim, { threshold = 0.7 } = {}) {
    return this._request('POST', '/api/verify', {
      json: { claim, threshold }
    });
  }

  get_fact_stats() {
    return this._request('GET', '/api/facts/stats');
  }

  // Alias for scp_alg_test compatibility
  add_verified_fact({ subject, predicate, obj, sources = [] }) {
    const source = sources.length > 0 ? sources[0] : null;
    const confidence = source?.trust_score ?? 1.0;
    return this.store_fact({
      subject,
      predicate,
      obj,
      status: 'verified',
      confidence,
      source
    });
  }

  // Alias for scp_alg_test compatibility
  check(claim) {
    return this.verify(claim);
  }
}

