/**
 * KnowShowGo JavaScript REST API Client
 *
 * Mirrors the Python client in `api/python/client.py`.
 */

/** Canonical hosted KnowShowGo API (see server `docs/PUBLIC-API.md`). */
export const PUBLIC_API_BASE_URL = 'https://api.knowshowgo.com';
/** Local default used when nothing else is configured. */
export const LOCAL_API_BASE_URL = 'http://localhost:3000'; // pragma: allowlist secret

/**
 * Resolve the API base URL: explicit option → `KSG_API_URL` → `KSG_PUBLIC_API_URL`
 * → local default. Deployed callers configure the public host by env instead of
 * hardcoding it, and local dev still works with no config.
 */
export function resolveBaseUrl(explicit) {
  if (explicit) return explicit;
  const env = typeof process !== 'undefined' ? process.env || {} : {};
  return env.KSG_API_URL || env.KSG_PUBLIC_API_URL || LOCAL_API_BASE_URL;
}

/** camelCase / PascalCase → snake_case */
function toSnakeCase(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

/**
 * Resolve a property key from a JS-friendly name against a properties map.
 * Accepts exact, snake_case, and case-insensitive matches.
 */
export function resolvePropertyKey(name, properties = {}) {
  if (!name || !properties) return null;
  if (Object.prototype.hasOwnProperty.call(properties, name)) return name;
  const snake = toSnakeCase(name);
  if (Object.prototype.hasOwnProperty.call(properties, snake)) return snake;
  const lower = String(name).toLowerCase();
  const snakeLower = snake.toLowerCase();
  for (const key of Object.keys(properties)) {
    const k = key.toLowerCase();
    if (k === lower || k === snakeLower) return key;
  }
  return null;
}

/**
 * ORM-style entity view over `/api2.0/entities/:id/properties`.
 *   entity.middleName           → winner value
 *   entity.claims.middleName    → full ranked claim stack
 *   entity.prop('middle_name')  → { value, confidence, contested, claims }
 */
export class EntityProxy {
  constructor({ uuid = null, properties = {}, policy = null, ok = true, types = null, ...rest } = {}) {
    this.uuid = uuid ?? rest.entityId ?? null;
    this.ok = ok !== false;
    this.properties = properties || {};
    this.policy = policy || null;
    this.types = Array.isArray(types) ? types : (Array.isArray(rest.matched) ? rest.matched : []);
    this.raw = {
      uuid: this.uuid,
      properties: this.properties,
      policy: this.policy,
      ok: this.ok,
      types: this.types,
      ...rest,
    };

    const claimsTarget = {};
    this.claims = new Proxy(claimsTarget, {
      get: (_t, prop) => {
        if (typeof prop !== 'string') return undefined;
        const key = resolvePropertyKey(prop, this.properties);
        return key ? this.properties[key]?.claims : undefined;
      },
      ownKeys: () => Object.keys(this.properties),
      getOwnPropertyDescriptor: (_t, prop) => {
        const key = resolvePropertyKey(prop, this.properties);
        if (!key) return undefined;
        return { configurable: true, enumerable: true, value: this.properties[key]?.claims };
      },
    });

    // eslint-disable-next-line no-constructor-return -- intentional Proxy wrapper
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'symbol' || prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        if (typeof prop !== 'string') return undefined;
        const key = resolvePropertyKey(prop, target.properties);
        if (!key) return undefined;
        return target.properties[key]?.value;
      },
      has(target, prop) {
        if (prop in target) return true;
        return Boolean(resolvePropertyKey(prop, target.properties));
      },
      ownKeys(target) {
        return Reflect.ownKeys(target);
      },
    });
  }

  /** Full property cell: { value, confidence, contested, claims } */
  prop(name) {
    const key = resolvePropertyKey(name, this.properties);
    return key ? this.properties[key] : undefined;
  }

  /**
   * Ranked prototype matches (closest first). Optionally refresh from the API
   * when a client is attached via `_client` + `refresh`.
   */
  getType({ refresh = false } = {}) {
    if (refresh && this._client && typeof this._client.get_entity_types === 'function') {
      return this._client.get_entity_types(this.uuid).then((body) => {
        this.types = body.types || body.matched || [];
        return this.types;
      });
    }
    return this.types;
  }

  toJSON() {
    return {
      ok: this.ok,
      uuid: this.uuid,
      properties: this.properties,
      policy: this.policy,
      types: this.types,
    };
  }
}

export class KnowShowGoClient {
  /**
   * @param {Object} options
   * @param {string} [options.baseUrl] Defaults to `KSG_API_URL`, else localhost.
   * @param {typeof fetch} [options.fetchImpl]
   */
  constructor({
    baseUrl,
    fetchImpl,
    prototypeApiPrefix = '/api2.0',
    topicApiPrefix = '/api2.0',
    auto_connect = false,
    defaultOwnerUserId = null,
    defaultAgentSessionId = null
  } = {}) {
    this.baseUrl = resolveBaseUrl(baseUrl).replace(/\/+$/, '');
    // Wrap the global fetch so it is always invoked with the correct context.
    // Calling a stored reference to the browser/Node global `fetch` as a method
    // (this.fetch(...)) throws "Illegal invocation"; a closure avoids that while
    // still letting tests inject a plain fetchImpl mock.
    this.fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
    // New features live under the /api2.0 namespace by default; set this to
    // '/api' to fall back to the retained backward-compatible alias.
    this.prototypeApiPrefix = prototypeApiPrefix;
    this.topicApiPrefix = topicApiPrefix;
    // Soft identity for server read ACL (X-KSG-Owner / query ownerUserId).
    this.defaultOwnerUserId = defaultOwnerUserId || null;
    this.defaultAgentSessionId = defaultAgentSessionId || null;
    this._contract = null;
    this._enforceContract = false;
    this._connectPromise = auto_connect ? this.connect() : null;
  }

  /**
   * Client for the canonical hosted API, so callers don't hardcode the URL.
   * Equivalent to `new KnowShowGoClient({ baseUrl: PUBLIC_API_BASE_URL })`.
   */
  static publicApi(options = {}) {
    return new KnowShowGoClient({ ...options, baseUrl: options.baseUrl || PUBLIC_API_BASE_URL });
  }

  /**
   * Cache release manifest; optionally enforce clientContract path allowlist.
   *
   * `expected_channel` / `expected_release` are **opt-in** assertions: pass them to
   * fail fast against an unexpected server. They default to no assertion because a
   * pinned default rots — the old `dev` / `v0.2.8-dev` defaults made a bare
   * `connect()` throw against the public release API.
   *
   * `adopt_advertised_base_url` re-points this client at `api.publicBaseUrl`
   * from the manifest, so a caller bootstrapped against any reachable host ends
   * up talking to the canonical public API the service advertises.
   */
  async connect({
    expected_channel = null,
    expected_release = null,
    enforce_contract = false,
    adopt_advertised_base_url = false
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
    this.apiPrefixes = manifest.api?.prefixes || null;
    if (adopt_advertised_base_url) {
      const advertised = manifest.api?.publicBaseUrl;
      if (advertised) this.baseUrl = String(advertised).replace(/\/+$/, '');
    }
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

  /**
   * Ranked property map for an entity (winner + contested claim stack).
   * Canonical path `/api2.0/entities/:id/properties` with `/api` alias.
   *
   * @returns {Promise<{ ok, uuid, properties, policy }>}
   */
  get_entity_properties(entity_id, {
    predicate = null,
    entityApiPrefix = null,
  } = {}) {
    const prefix = entityApiPrefix || this.prototypeApiPrefix || '/api2.0';
    return this._request('GET', `${prefix}/entities/${encodeURIComponent(entity_id)}/properties`, {
      params: { predicate },
    });
  }

  /**
   * EntityProxy over get_entity_properties — `.middleName` returns the winner
   * value; `.claims.middleName` / `.prop('middle_name')` expose the claim stack.
   * Also hydrates `.getType()` from /entities/:id/types when available.
   */
  async get_entity_snapshot(entity_id, opts = {}) {
    const body = await this.get_entity_properties(entity_id, opts);
    let types = null;
    try {
      const typed = await this.get_entity_types(entity_id, {
        top_k: opts.top_k ?? opts.topK ?? 5,
        entityApiPrefix: opts.entityApiPrefix,
      });
      types = typed.types || typed.matched || [];
    } catch {
      /* older server without /types */
    }
    const proxy = new EntityProxy({ ...body, types });
    proxy._client = this;
    return proxy;
  }

  /** Alias for get_entity_snapshot. */
  entity(entity_id, opts = {}) {
    return this.get_entity_snapshot(entity_id, opts);
  }

  /**
   * Ranked prototype/type matches (fuzzy duck typing).
   * Canonical path `/api2.0/entities/:id/types` with `/api` alias.
   */
  get_entity_types(entity_id, {
    top_k = 5,
    threshold = 0,
    persist = false,
    persist_top_k = 1,
    entityApiPrefix = null,
  } = {}) {
    const prefix = entityApiPrefix || this.prototypeApiPrefix || '/api2.0';
    const params = { topK: top_k, threshold };
    if (persist) {
      params.persist = 'true';
      params.persistTopK = persist_top_k;
    }
    return this._request('GET', `${prefix}/entities/${encodeURIComponent(entity_id)}/types`, {
      params,
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
    return this._request('POST', `${this.topicApiPrefix}/topics`, {
      json: { label, phrase, summary, aliases, kind, language, provenance }
    }).then((body) => ({
      ...body,
      ...(body.topic || {})
    }));
  }

  get_topic(uuid) {
    return this._request('GET', `${this.topicApiPrefix}/topics/${encodeURIComponent(uuid)}`).then(r => r.topic);
  }

  resolve_topic_tag({ tag = null, phrase = null, language, top_k = 10, create_if_missing = false } = {}) {
    return this._request('POST', `${this.topicApiPrefix}/topics/resolve-tag`, {
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

  /**
   * Unified knowledge search over concepts (incl. episodic chunks) + typed
   * objects (Document / Idea / …). Canonical path `/api2.0/knowledge/search`
   * with `/api` alias. Pass owner identity so private docs are visible.
   */
  search_knowledge({
    query,
    top_k = 10,
    similarity_threshold = 0.55,
    categories = null,
    include_concepts = true,
    include_objects = true,
    owner_user_id = null,
    agent_session_id = null,
    knowledgeApiPrefix = null,
  } = {}) {
    const prefix = knowledgeApiPrefix || this.prototypeApiPrefix || '/api2.0';
    return this._request('POST', `${prefix}/knowledge/search`, {
      json: {
        query,
        topK: top_k,
        similarityThreshold: similarity_threshold,
        categories,
        includeConcepts: include_concepts,
        includeObjects: include_objects,
      },
      owner_user_id,
      agent_session_id,
    }).then((r) => ({
      ok: r.ok !== false,
      query: r.query ?? query,
      count: r.count ?? (r.results || []).length,
      results: r.results || [],
    }));
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

  seed_social_layer({ api_prefix = '/api2.0' } = {}) {
    const prefix = String(api_prefix || '/api2.0').replace(/\/+$/, '') || '/api2.0';
    return this._request('POST', `${prefix}/seed/social-layer`, { json: {} });
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

