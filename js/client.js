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

  // ===== Topics / Tags =====
  resolveTag({ tag = null, phrase = null, language = 'und', topK = 10, createIfMissing = false } = {}) {
    return this._request('POST', '/api/topics/resolve-tag', {
      json: { tag, phrase, language, topK, createIfMissing }
    });
  }

  resolve_tag(options = {}) {
    return this.resolveTag(options);
  }

  createTopic({
    label = null,
    phrase = null,
    summary = '',
    aliases = [],
    kind = 'topic',
    language = 'und',
    provenance = null
  } = {}) {
    return this._request('POST', '/api/topics', {
      json: { label, phrase, summary, aliases, kind, language, provenance }
    });
  }

  create_topic(options = {}) {
    return this.createTopic(options);
  }

  getTopic(uuid) {
    return this._request('GET', `/api/topics/${encodeURIComponent(uuid)}`);
  }

  get_topic(uuid) {
    return this.getTopic(uuid);
  }

  // ===== Object Categories =====
  createCategory({
    name,
    description = '',
    context = 'object-category',
    parentPrototypeUuid = null,
    parentCategoryName = null,
    properties = [],
    source = null
  } = {}) {
    return this._request('POST', '/api/object-categories', {
      json: { name, description, context, parentPrototypeUuid, parentCategoryName, properties, source }
    });
  }

  create_category(options = {}) {
    return this.createCategory(options);
  }

  upsertCategory({
    name,
    description = '',
    context = 'object-category',
    parentPrototypeUuid = null,
    parentCategoryName = null,
    properties = [],
    source = null,
    categoryLineageKey = null
  } = {}) {
    return this._request('POST', '/api/object-categories/upsert', {
      json: {
        name,
        description,
        context,
        parentPrototypeUuid,
        parentCategoryName,
        properties,
        source,
        categoryLineageKey
      }
    });
  }

  upsert_category(options = {}) {
    return this.upsertCategory(options);
  }

  getCategory(uuid) {
    return this._request('GET', `/api/object-categories/${encodeURIComponent(uuid)}`);
  }

  get_category(uuid) {
    return this.getCategory(uuid);
  }

  // ===== Objects / ConceptObjects =====
  upsertObject({
    categoryPrototypeUuid = null,
    categoryName = null,
    parentCategoryName = null,
    title,
    summary = '',
    tags = [],
    defaultTagLanguage = 'und',
    properties = [],
    previousObjectUuid = null,
    objectLineageKey = null,
    provenance = null,
    knowledgeKind = 'personal',
    sensitivity = 'normal',
    privacyOverride = null,
    private: isPrivate = undefined,
    ownerUserId = null,
    agentSessionId = null
  } = {}) {
    return this._request('POST', '/api/objects/upsert', {
      json: {
        categoryPrototypeUuid,
        categoryName,
        parentCategoryName,
        title,
        summary,
        tags,
        defaultTagLanguage,
        properties,
        previousObjectUuid,
        objectLineageKey,
        provenance,
        knowledgeKind,
        sensitivity,
        privacyOverride,
        private: isPrivate,
        ownerUserId,
        agentSessionId
      }
    });
  }

  upsert_object(options = {}) {
    return this.upsertObject(options);
  }

  getObject(uuid) {
    return this._request('GET', `/api/objects/${encodeURIComponent(uuid)}`);
  }

  get_object(uuid) {
    return this.getObject(uuid);
  }

  resolveObject({
    objectLineageKey = null,
    categoryPrototypeUuid = null,
    title = null,
    private: isPrivate = false,
    ownerUserId = null,
    agentSessionId = null
  } = {}) {
    return this._request('POST', '/api/objects/resolve', {
      json: { objectLineageKey, categoryPrototypeUuid, title, private: isPrivate, ownerUserId, agentSessionId }
    });
  }

  resolve_object(options = {}) {
    return this.resolveObject(options);
  }

  suggest({ text = null, query = null, context = {}, topK = 10, createTagIfMissing = false } = {}) {
    return this._request('POST', '/api/concept-objects/suggest', {
      json: { text, query, context, topK, createTagIfMissing }
    });
  }

  suggestConceptObjects(options = {}) {
    return this.suggest(options);
  }

  suggest_concept_objects(options = {}) {
    return this.suggestConceptObjects(options);
  }

  searchConceptObjects(query, { text = null, context = {}, topK = 10 } = {}) {
    return this._request('POST', '/api/concept-objects/search', {
      json: { query, text, context, topK }
    });
  }

  search_concept_objects(query, options = {}) {
    return this.searchConceptObjects(query, options);
  }

  // ===== Assertions / Entity Resolution =====
  snapshot(entityId) {
    return this._request('GET', `/api/entities/${encodeURIComponent(entityId)}/snapshot`).then(r => r.snapshot);
  }

  get_snapshot(entityId) {
    return this.snapshot(entityId);
  }

  evidence(entityId, { predicate = null } = {}) {
    return this._request('GET', `/api/entities/${encodeURIComponent(entityId)}/evidence`, {
      params: { predicate }
    }).then(r => r.evidence);
  }

  get_evidence(entityId, predicate = null) {
    return this.evidence(entityId, { predicate });
  }

  // ===== Procedures =====
  createProcedure({ title, description = '', steps = [], dependencies = [], guards = null, extraProps = null } = {}) {
    return this._request('POST', '/api/procedures', {
      json: { title, description, steps, dependencies, guards, extraProps }
    });
  }

  create_procedure(options = {}) {
    return this.createProcedure(options);
  }

  getProcedure(uuid) {
    return this._request('GET', `/api/procedures/${encodeURIComponent(uuid)}`);
  }

  get_procedure(uuid) {
    return this.getProcedure(uuid);
  }

  insertProcedureStep(
    uuid,
    {
      title,
      payload = null,
      tool = null,
      guard_text = null,
      guard = null,
      on_fail = null,
      afterStepUuid = null,
      beforeStepUuid = null,
      order = null,
      provenance = null
    } = {}
  ) {
    return this._request('POST', `/api/procedures/${encodeURIComponent(uuid)}/steps`, {
      json: { title, payload, tool, guard_text, guard, on_fail, afterStepUuid, beforeStepUuid, order, provenance }
    });
  }

  insert_procedure_step(uuid, options = {}) {
    return this.insertProcedureStep(uuid, options);
  }

  generalizeProcedure(uuid, { title, description = '', mode = 'schema_only', provenance = null } = {}) {
    return this._request('POST', `/api/procedures/${encodeURIComponent(uuid)}/generalize`, {
      json: { title, description, mode, provenance }
    });
  }

  generalize_procedure(uuid, options = {}) {
    return this.generalizeProcedure(uuid, options);
  }

  searchProcedures(query, { topK = 5 } = {}) {
    return this._request('POST', '/api/procedures/search', {
      json: { query, topK }
    }).then(r => r.results);
  }

  search_procedures(query, options = {}) {
    return this.searchProcedures(query, options);
  }
}

