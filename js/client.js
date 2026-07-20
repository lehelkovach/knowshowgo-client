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
  constructor({
    baseUrl = 'http://localhost:3000', // pragma: allowlist secret
    fetchImpl,
    prototypeApiPrefix = '/api2.0',
    auto_connect = false,
    defaultOwnerUserId = null,
    defaultAgentSessionId = null
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    // Wrap the global fetch so it is always invoked with the correct context.
    // Calling a stored reference to the browser/Node global `fetch` as a method
    // (this.fetch(...)) throws "Illegal invocation"; a closure avoids that while
    // still letting tests inject a plain fetchImpl mock.
    this.fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
    // New features live under the /api2.0 namespace by default; set this to
    // '/api' to fall back to the retained backward-compatible alias.
    this.prototypeApiPrefix = prototypeApiPrefix;
    // Soft identity for server read ACL (X-KSG-Owner / query ownerUserId).
    this.defaultOwnerUserId = defaultOwnerUserId || null;
    this.defaultAgentSessionId = defaultAgentSessionId || null;
    this._contract = null;
    this._enforceContract = false;
    this._connectPromise = auto_connect ? this.connect() : null;
  }

  /** Cache release manifest; optionally enforce clientContract path allowlist. */
  async connect({
    expected_channel = 'dev',
    expected_release = 'v0.2.5-dev',
    enforce_contract = false
  } = {}) {
    const manifest = await this.get_release_manifest();
    if (expected_channel && manifest.channel !== expected_channel) {
      throw new Error(`expected channel ${expected_channel}, got ${manifest.channel}`);
    }
    if (expected_release && manifest.release !== expected_release) {
      throw new Error(`expected release ${expected_release}, got ${manifest.release}`);
    }
    this._contract = manifest.surfaces?.clientContract || null;
    this._enforceContract = enforce_contract;
    return manifest;
  }

  _assertContractPath(method, path) {
    if (!this._enforceContract || !this._contract) return;
    const prefix = path.split('/:')[0];
    const allowed = this._contract.some(
      (entry) => entry.method === method && (entry.path === path || entry.path.startsWith(prefix))
    );
    if (!allowed) {
      throw new Error(`endpoint not in dev contract: ${method} ${path}`);
    }
  }

  async _request(method, endpoint, { json, params, owner_user_id, agent_session_id } = {}) {
    this._assertContractPath(method, endpoint);
    const url = new URL(this.baseUrl + endpoint);
    const ownerUserId = owner_user_id ?? this.defaultOwnerUserId;
    const agentSessionId = agent_session_id ?? this.defaultAgentSessionId;
    const mergedParams = { ...(params || {}) };
    if (ownerUserId != null && mergedParams.ownerUserId == null) {
      mergedParams.ownerUserId = ownerUserId;
    }
    if (agentSessionId != null && mergedParams.agentSessionId == null) {
      mergedParams.agentSessionId = agentSessionId;
    }
    for (const [k, v] of Object.entries(mergedParams)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const headers = json
      ? { 'content-type': 'application/json', accept: 'application/json' }
      : { accept: 'application/json' };
    if (ownerUserId) headers['x-ksg-owner'] = String(ownerUserId);
    if (agentSessionId) headers['x-ksg-session'] = String(agentSessionId);

    let bodyJson = json;
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      bodyJson = { ...json };
      if (ownerUserId != null && bodyJson.ownerUserId == null) bodyJson.ownerUserId = ownerUserId;
      if (agentSessionId != null && bodyJson.agentSessionId == null) bodyJson.agentSessionId = agentSessionId;
    }

    const res = await this.fetch(url.toString(), {
      method,
      headers,
      body: bodyJson ? JSON.stringify(bodyJson) : undefined
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

  // ===== Health & release =====
  health_check() {
    return this._request('GET', '/health');
  }

  get_release_manifest() {
    return this._request('GET', '/api/release');
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

  search_concepts(query, {
    top_k = 10,
    similarity_threshold = 0.7,
    prototype_filter = null,
    owner_user_id = null,
    agent_session_id = null
  } = {}) {
    return this._request('POST', '/api/concepts/search', {
      json: {
        query,
        topK: top_k,
        similarityThreshold: similarity_threshold,
        prototypeFilter: prototype_filter
      },
      owner_user_id,
      agent_session_id
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

  // ===== Prototype / centroid (prototype-theory) mechanics =====
  // Generalize an exemplar into a category: the service embeds it (if needed),
  // finds the nearest prototype by centroid similarity, and folds it in,
  // creating a new prototype when nothing is similar enough.
  generalize_from_exemplar({
    concept_uuid = null,
    text = null,
    json_obj = null,
    prototype_uuid = null,
    label = null,
    threshold = 0.85,
    create_if_no_match = true
  } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/prototypes/generalize`, {
      json: {
        conceptUuid: concept_uuid,
        text,
        jsonObj: json_obj,
        prototypeUuid: prototype_uuid,
        label,
        threshold,
        createIfNoMatch: create_if_no_match
      }
    });
  }

  // Match a perceived item (text or embedding) against existing prototypes.
  match_prototypes({ text = null, embedding = null, top_k = 5, threshold = 0 } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/prototypes/match`, {
      json: { text, embedding, topK: top_k, threshold }
    }).then(r => r.matches);
  }

  // Label/tag autocomplete over prototypes (e.g. to pick an object "type").
  search_prototypes({ query = '', top_k = 10 } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/prototypes/search`, {
      json: { query, topK: top_k }
    }).then(r => r.prototypes);
  }

  // Attach an existing concept as an exemplar of a known prototype.
  attach_exemplar(prototype_uuid, concept_uuid) {
    return this._request('POST', `${this.prototypeApiPrefix}/prototypes/${encodeURIComponent(prototype_uuid)}/exemplars`, {
      json: { conceptUuid: concept_uuid }
    });
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
    }).then((result) => ({
      ...result,
      verified: result.status === 'verified'
    }));
  }

  get_fact_stats() {
    return this._request('GET', '/api/facts/stats').then((stats) => ({
      ...stats,
      totalFacts: stats.total ?? stats.totalFacts ?? 0
    }));
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

  // ===== Topics (v0.2.2) =====
  create_topic({ label = null, phrase = null, summary = '', aliases = [], kind = 'topic', language, provenance = null } = {}) {
    return this._request('POST', '/api/topics', {
      json: { label, phrase, summary, aliases, kind, language, provenance }
    }).then((body) => ({
      ...body,
      ...(body.topic || {})
    }));
  }

  get_topic(uuid) {
    return this._request('GET', `/api/topics/${encodeURIComponent(uuid)}`).then(r => r.topic);
  }

  resolve_topic_tag({ tag = null, phrase = null, language, top_k = 10, create_if_missing = false } = {}) {
    return this._request('POST', '/api/topics/resolve-tag', {
      json: { tag, phrase, language, topK: top_k, createIfMissing: create_if_missing }
    });
  }

  // ===== Object Categories (v0.2.2) =====
  create_object_category({
    name,
    description = '',
    context = 'object-category',
    parent_prototype_uuid = null,
    parent_category_name = null,
    properties = [],
    source = null
  }) {
    return this._request('POST', '/api/object-categories', {
      json: {
        name,
        description,
        context,
        parentPrototypeUuid: parent_prototype_uuid,
        parentCategoryName: parent_category_name,
        properties,
        source
      }
    });
  }

  upsert_object_category({
    name,
    description = '',
    context = 'object-category',
    parent_prototype_uuid = null,
    parent_category_name = null,
    properties = [],
    source = null,
    category_lineage_key = null
  }) {
    return this._request('POST', '/api/object-categories/upsert', {
      json: {
        name,
        description,
        context,
        parentPrototypeUuid: parent_prototype_uuid,
        parentCategoryName: parent_category_name,
        properties,
        source,
        categoryLineageKey: category_lineage_key
      }
    });
  }

  get_object_category(uuid) {
    return this._request('GET', `/api/object-categories/${encodeURIComponent(uuid)}`).then((body) => ({
      ...body,
      categoryPrototypeUuid: body.categoryPrototypeUuid ?? body.category?.uuid ?? uuid
    }));
  }

  // ===== Objects (v0.2.2) =====
  upsert_object({
    title,
    category_prototype_uuid = null,
    category_name = null,
    parent_category_name = null,
    summary = '',
    tags = [],
    properties = [],
    previous_object_uuid = null,
    object_lineage_key = null,
    provenance = null,
    knowledge_kind = 'personal',
    sensitivity = 'normal',
    privacy_override = null,
    private: is_private,
    owner_user_id = null,
    agent_session_id = null
  }) {
    return this._request('POST', '/api/objects/upsert', {
      json: {
        title,
        categoryPrototypeUuid: category_prototype_uuid,
        categoryName: category_name,
        parentCategoryName: parent_category_name,
        summary,
        tags,
        properties,
        previousObjectUuid: previous_object_uuid,
        objectLineageKey: object_lineage_key,
        provenance,
        knowledgeKind: knowledge_kind,
        sensitivity,
        privacyOverride: privacy_override,
        private: is_private,
        ownerUserId: owner_user_id,
        agentSessionId: agent_session_id
      }
    });
  }

  get_object(uuid, { owner_user_id = null, agent_session_id = null } = {}) {
    return this._request('GET', `/api/objects/${encodeURIComponent(uuid)}`, {
      params: {
        ownerUserId: owner_user_id ?? this.defaultOwnerUserId,
        agentSessionId: agent_session_id ?? this.defaultAgentSessionId
      },
      owner_user_id,
      agent_session_id
    });
  }

  // Inventory (read-only) for the memory inspector.
  list_objects({ category = null, limit = 200, owner_user_id = null, agent_session_id = null } = {}) {
    return this._request('GET', '/api/objects', {
      params: { category, limit },
      owner_user_id,
      agent_session_id
    }).then((r) => r.objects || []);
  }

  list_object_categories() {
    return this._request('GET', '/api/object-categories', {})
      .then((r) => r.categories || []);
  }

  resolve_object({
    object_lineage_key = null,
    category_prototype_uuid = null,
    title = null,
    private: is_private = false,
    owner_user_id = null,
    agent_session_id = null
  } = {}) {
    return this._request('POST', '/api/objects/resolve', {
      json: {
        objectLineageKey: object_lineage_key,
        categoryPrototypeUuid: category_prototype_uuid,
        title,
        private: is_private,
        ownerUserId: owner_user_id,
        agentSessionId: agent_session_id
      }
    }).then((body) => ({
      ...body,
      objectUuid: body.objectUuid ?? body.selectedObjectUuid
    }));
  }

  generalize_object({
    source_object_uuid = null,
    source_object_lineage_key = null,
    owner_user_id = null,
    agent_session_id = null,
    target_category_prototype_uuid = null,
    target_category_name = null,
    target_parent_category_name = null,
    target_title = null,
    target_tags = [],
    include_properties = null,
    exclude_properties = null,
    mode = 'safe',
    object_lineage_key = null,
    publish_assertion = false,
    assertion_predicate = 'generalized_fact',
    assertion_truth = 0.9,
    provenance = null
  } = {}) {
    return this._request('POST', '/api/objects/generalize', {
      json: {
        sourceObjectUuid: source_object_uuid,
        sourceObjectLineageKey: source_object_lineage_key,
        ownerUserId: owner_user_id,
        agentSessionId: agent_session_id,
        targetCategoryPrototypeUuid: target_category_prototype_uuid,
        targetCategoryName: target_category_name,
        targetParentCategoryName: target_parent_category_name,
        targetTitle: target_title,
        targetTags: target_tags,
        includeProperties: include_properties,
        excludeProperties: exclude_properties,
        mode,
        objectLineageKey: object_lineage_key,
        publishAssertion: publish_assertion,
        assertionPredicate: assertion_predicate,
        assertionTruth: assertion_truth,
        provenance
      }
    });
  }

  // ===== Procedures (v0.2.2) =====
  create_procedure({ title, description = '', steps = [], dependencies = [], guards, extra_props } = {}) {
    return this._request('POST', '/api/procedures', {
      json: { title, description, steps, dependencies, guards, extraProps: extra_props }
    });
  }

  get_procedure(uuid) {
    return this._request('GET', `/api/procedures/${encodeURIComponent(uuid)}`);
  }

  add_procedure_step(procedure_uuid, {
    title,
    payload,
    tool,
    guard_text,
    guard,
    on_fail,
    after_step_uuid,
    before_step_uuid,
    order,
    provenance
  } = {}) {
    return this._request('POST', `/api/procedures/${encodeURIComponent(procedure_uuid)}/steps`, {
      json: {
        title,
        payload,
        tool,
        guard_text,
        guard,
        on_fail,
        afterStepUuid: after_step_uuid,
        beforeStepUuid: before_step_uuid,
        order,
        provenance
      }
    });
  }

  generalize_procedure(procedure_uuid, { title, description = '', mode = 'schema_only', provenance = null } = {}) {
    return this._request('POST', `/api/procedures/${encodeURIComponent(procedure_uuid)}/generalize`, {
      json: { title, description, mode, provenance }
    });
  }

  repair_procedure_selector(procedure_uuid, {
    step_uuid,
    form_element_uuid,
    repaired_selector,
    failed_selector = null,
    provenance = null
  } = {}) {
    return this._request('POST', `/api/procedures/${encodeURIComponent(procedure_uuid)}/repair-selector`, {
      json: {
        stepUuid: step_uuid,
        formElementUuid: form_element_uuid,
        failedSelector: failed_selector,
        repairedSelector: repaired_selector,
        provenance
      }
    });
  }

  search_procedures(query, { top_k = 5 } = {}) {
    return this._request('POST', '/api/procedures/search', {
      json: { query, topK: top_k }
    }).then(r => r.results);
  }

  import_procedure_json({ procedure, form_element_category_prototype_uuid = null, provenance = null } = {}) {
    return this._request('POST', '/api/procedures/import-json', {
      json: {
        procedure,
        formElementCategoryPrototypeUuid: form_element_category_prototype_uuid,
        provenance
      }
    });
  }

  // ===== Concept Objects (v0.2.2) =====
  suggest_concept_objects({ text = null, query = null, context = {}, top_k = 10, create_tag_if_missing = false } = {}) {
    const input = text ?? query;
    if (!input || !String(input).trim()) {
      throw new Error('text or query is required for suggest_concept_objects');
    }
    return this._request('POST', '/api/concept-objects/suggest', {
      json: { text: input, query: input, context, topK: top_k, createTagIfMissing: create_tag_if_missing }
    }).then((body) => ({
      ...body,
      suggestions: body.suggestions ?? body.candidates ?? []
    }));
  }

  search_concept_objects({ query = null, text = null, context = {}, top_k = 10 } = {}) {
    return this._request('POST', '/api/concept-objects/search', {
      json: { query, text, context, topK: top_k }
    }).then(r => r.results);
  }

  suggest_concept_object_prototypes({ label = '', properties = [], context = {}, category_prototype_uuids = null, top_k = 5 } = {}) {
    if (!Array.isArray(properties) || properties.length === 0) {
      throw new Error('properties are required for suggest_concept_object_prototypes');
    }
    return this._request('POST', '/api/concept-objects/suggest-prototypes', {
      json: { label, properties, context, categoryPrototypeUuids: category_prototype_uuids, topK: top_k }
    }).then((body) => ({
      ...body,
      suggestions: body.suggestions ?? body.candidates ?? []
    }));
  }

  // ===== Composites (v0.2.2) =====
  create_composite({ category_prototype_uuid, title, summary = '', tags = [], properties = [], components = [], provenance = null }) {
    return this._request('POST', '/api/composites', {
      json: {
        categoryPrototypeUuid: category_prototype_uuid,
        title,
        summary,
        tags,
        properties,
        components,
        provenance
      }
    });
  }

  get_composite(uuid) {
    return this._request('GET', `/api/composites/${encodeURIComponent(uuid)}`);
  }

  update_composite_component(composite_uuid, component_uuid, { title, summary, tags = [], properties = [], provenance = null } = {}) {
    return this._request(
      'POST',
      `/api/composites/${encodeURIComponent(composite_uuid)}/components/${encodeURIComponent(component_uuid)}/update`,
      { json: { title, summary, tags, properties, provenance } }
    );
  }

  // ===== Logic / Syllogisms (v0.2.2) =====
  create_syllogism({ title, description = '', premises = [], conclusion = null, provenance = null }) {
    return this._request('POST', '/api/logic/syllogisms', {
      json: { title, description, premises, conclusion, provenance }
    });
  }

  get_syllogism(uuid) {
    return this._request('GET', `/api/logic/syllogisms/${encodeURIComponent(uuid)}`);
  }

  // ===== Market Matching (v0.2.2) =====
  register_market_match({ kind, actor_id, object_uuid = null, tags = [], properties = [] }) {
    return this._request('POST', '/api/market/matches/register', {
      json: { kind, actorId: actor_id, objectUuid: object_uuid, tags, properties }
    }).then((body) => ({
      ...body,
      matchUuid: body.matchUuid ?? body.intent_uuid,
      intent_uuid: body.intent_uuid ?? body.matchUuid
    }));
  }

  search_market_matches({ kind, tags = [], properties = [] }) {
    return this._request('POST', '/api/market/matches/search', {
      json: { kind, tags, properties }
    }).then(r => r.matches);
  }

  // ===== Channels (v0.2.2) =====
  subscribe_channel({ channel_tag, actor_id }) {
    return this._request('POST', '/api/channels/subscribe', {
      json: { channelTag: channel_tag, actorId: actor_id }
    });
  }

  post_channel_message({ channel_tag, actor_id, message, tags = [] }) {
    return this._request('POST', '/api/channels/messages', {
      json: { channelTag: channel_tag, actorId: actor_id, message, tags }
    });
  }

  get_channel_feed(actor_id) {
    return this._request('GET', '/api/channels/feed', {
      params: { actorId: actor_id }
    }).then(r => r.items);
  }

  // ===== Repeating Events (v0.2.2) =====
  create_repeating_event({ category_prototype_uuid, title, tags = [], properties = [], provenance = null }) {
    return this._request('POST', '/api/events/repeating', {
      json: { categoryPrototypeUuid: category_prototype_uuid, title, tags, properties, provenance }
    });
  }

  // ===== Ratings (v0.2.2) =====
  rate_entity(uuid, { actor_id, value, metric = 'overall', scale = 5, comment = '' } = {}) {
    return this._request('POST', `/api/ratings/${encodeURIComponent(uuid)}`, {
      json: { actorId: actor_id, metric, value, scale, comment }
    });
  }

  get_ratings(uuid) {
    return this._request('GET', `/api/ratings/${encodeURIComponent(uuid)}`);
  }

  // ===== Legacy knode =====
  async create_knode({ label, summary = '', tags = [], metadata = {} } = {}) {
    const out = await this._request('POST', '/api/knodes', {
      json: { label, summary, tags, metadata }
    });
    return out.uuid;
  }

  // ===== Graph query (devExtended) =====
  query_graph({ search, traverse } = {}) {
    return this._request('POST', '/api/query', {
      json: { search, traverse }
    });
  }

  // ===== Seeds =====
  seed_osl_agent(body = {}) {
    return this._request('POST', '/api/seed/osl-agent', { json: body });
  }

  seed_openclaw_agent(body = {}) {
    return this._request('POST', '/api/seed/openclaw-agent', { json: body });
  }

  // ===== Experimental (dev preview) =====
  create_vault({ owner_user_id, agent_session_id = null, title = 'Personal vault', tags, provenance = null } = {}) {
    return this._request('POST', '/api/vaults', {
      json: {
        ownerUserId: owner_user_id,
        agentSessionId: agent_session_id,
        title,
        tags,
        provenance
      }
    }).then((body) => ({
      ...body,
      vaultUuid: body.vaultUuid ?? body.vault_uuid
    }));
  }

  personal_remember({
    owner_user_id,
    agent_session_id = null,
    vault_uuid = null,
    category_name,
    parent_category_name = 'PersonalMemory',
    title,
    summary = '',
    tags = [],
    properties = [],
    provenance = null
  } = {}) {
    return this._request('POST', '/api/personal/remember', {
      json: {
        ownerUserId: owner_user_id,
        agentSessionId: agent_session_id,
        vaultUuid: vault_uuid,
        categoryName: category_name,
        parentCategoryName: parent_category_name,
        title,
        summary,
        tags,
        properties,
        provenance
      }
    });
  }

  personal_recall({ owner_user_id, query, vault_uuid = null } = {}) {
    return this._request('GET', '/api/personal/recall', {
      params: { ownerUserId: owner_user_id, query, vaultUuid: vault_uuid }
    });
  }

  ingest_private_payment({ owner_user_id, agent_session_id, label, text } = {}) {
    return this._request('POST', '/api/private/payment/ingest', {
      json: { ownerUserId: owner_user_id, agentSessionId: agent_session_id, label, text }
    });
  }

  list_private_payments({ owner_user_id, agent_session_id = null } = {}) {
    return this._request('GET', '/api/private/payments', {
      params: { ownerUserId: owner_user_id, agentSessionId: agent_session_id }
    });
  }

  get_private_payment(uuid, { owner_user_id } = {}) {
    return this._request('GET', `/api/private/payment/${encodeURIComponent(uuid)}`, {
      params: { ownerUserId: owner_user_id }
    });
  }

  lookup_private_payment({ owner_user_id, agent_session_id } = {}) {
    return this._request('POST', '/api/private/payment/lookup', {
      json: { ownerUserId: owner_user_id, agentSessionId: agent_session_id }
    });
  }

  // ===== Compatibility aliases (server dogfood / older names) =====
  resolve_tag(args) {
    return this.resolve_topic_tag(args);
  }

  repair_selector(procedure_uuid, args) {
    return this.repair_procedure_selector(procedure_uuid, {
      step_uuid: args.stepUuid ?? args.step_uuid,
      form_element_uuid: args.formElementUuid ?? args.form_element_uuid,
      failed_selector: args.failedSelector ?? args.failed_selector,
      repaired_selector: args.repairedSelector ?? args.repaired_selector,
      provenance: args.provenance
    });
  }

  suggest_prototypes(args) {
    return this.suggest_concept_object_prototypes({
      label: args.label,
      properties: args.properties,
      context: args.context,
      category_prototype_uuids: args.categoryPrototypeUuids ?? args.category_prototype_uuids,
      top_k: args.top_k ?? args.topK
    });
  }
}

