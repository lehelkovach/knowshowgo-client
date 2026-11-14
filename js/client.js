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

/** A shallow copy without the keys whose value is null or undefined. */
/** snake_case option keys → the server's camelCase body keys. */
function camelKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k.replace(/_([a-z])/g, (_m, c) => c.toUpperCase())] = v;
  return out;
}

function withoutNulls(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

// KA4b: the proof-view fields of close_relation / evaluate_joins. Absent when
// not asked for, so the request body is unchanged for existing callers;
// `describe` only on the literal true.
function proofViewFields(excludeClaims, describe) {
  const out = {};
  if (excludeClaims !== null && excludeClaims !== undefined) {
    if (!Array.isArray(excludeClaims)) throw new Error('exclude_claims must be an array of claim uuids');
    out.excludeClaims = excludeClaims.map(String);
  }
  if (describe === true) out.describe = true;
  return out;
}

/**
 * `{ securityClass }` for an assertion write, or `{}` when neither
 * `security_class` nor its alias `scope` was given. The value is not checked
 * here: the server validates it (`public` | `private`, anything else 400).
 */
function securityClassField(security_class, scope) {
  const value = security_class ?? scope;
  return value === null || value === undefined ? {} : { securityClass: value };
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
   *
   * Returns an array without `refresh` and a Promise with it. That polymorphism
   * is a trap — `getType().length` breaks the moment a caller passes
   * `refresh: true` — so prefer `typesNow()` when you want the loaded snapshot
   * and `resolveTypes()` when you want to go to the network. Both have exactly
   * one return type. This method keeps its old behaviour for callers that
   * already depend on it.
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

  /** Ranked matches already loaded. Always an array, never a Promise. */
  typesNow() {
    return Array.isArray(this.types) ? this.types : [];
  }

  /** Refresh ranked matches from the API. Always a Promise, never an array. */
  async resolveTypes(opts = {}) {
    if (!this._client || typeof this._client.get_entity_types !== 'function') {
      return this.typesNow();
    }
    const body = await this._client.get_entity_types(this.uuid, opts);
    this.types = body.types || body.matched || [];
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


/**
 * Every spelling a caller might reasonably use for one member name.
 *
 * Built once per hydration so member access is a map lookup rather than a scan.
 * `resolvePropertyKey` walks `Object.keys` on every miss, which is fine for an
 * occasional call and wrong for a hot property accessor.
 */
function memberNameAliases(name) {
  const raw = String(name);
  const snake = toSnakeCase(raw);
  const camel = snake.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());
  return new Set([
    raw,
    snake,
    camel,
    raw.toLowerCase(),
    snake.toLowerCase(),
    camel.toLowerCase(),
    snake.replace(/_/g, ''),
  ]);
}

/**
 * A KSG entity projected as a duck-typed object.
 *
 * `person.middleName` is a synchronous map lookup, which is the whole reason
 * hydration is one round trip: a JavaScript `Proxy` get handler cannot await, so
 * a member map that arrives separately from its values cannot support plain
 * property access, `in`, `Object.keys`, or destructuring.
 *
 * Members come from whatever prototypes matched. The strongest match owns a
 * name; weaker prototypes that declare the same name are still reachable through
 * `as()` and are listed in `explain()`. That matters because the top match is a
 * ranking, not a fact — the same centroid machinery that ranks `cvv` above
 * `number` for "Card number" should not get to pick a member's meaning silently.
 *
 * This is a snapshot. `hydratedAt` records when, because prototype centroids
 * move as exemplars accumulate.
 */
export class KSGObject {
  constructor(payload = {}) {
    const {
      uuid = null,
      ok = true,
      hydratedAt = null,
      types = [],
      members = {},
      properties = {},
      byPrototype = {},
      policy = null,
    } = payload || {};

    this.uuid = uuid;
    this.ok = ok !== false;
    this.hydratedAt = hydratedAt;
    this.types = Array.isArray(types) ? types : [];
    this.members = members || {};
    this.properties = properties || {};
    this.byPrototype = byPrototype || {};
    this.policy = policy;
    this.raw = payload;

    const index = new Map();
    for (const name of Object.keys(this.members)) {
      for (const alias of memberNameAliases(name)) {
        // First writer wins, so a canonical name is never shadowed by another
        // member's alias.
        if (!index.has(alias)) index.set(alias, name);
      }
    }
    this._index = index;

    // eslint-disable-next-line no-constructor-return -- intentional Proxy wrapper
    return new Proxy(this, {
      get(target, prop, receiver) {
        // Real fields and methods win over members. A member called `uuid` or
        // `types` is still reachable through cell()/value().
        if (typeof prop === 'symbol' || prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        const name = target._index.get(prop) ?? target._index.get(String(prop).toLowerCase());
        if (!name) return undefined;
        return target.properties[name]?.value;
      },
      has(target, prop) {
        if (typeof prop !== 'symbol' && prop in target) return true;
        if (typeof prop === 'symbol') return false;
        return target._index.has(prop) || target._index.has(String(prop).toLowerCase());
      },
      ownKeys(target) {
        return Array.from(new Set([...Reflect.ownKeys(target), ...Object.keys(target.members)]));
      },
      getOwnPropertyDescriptor(target, prop) {
        const own = Reflect.getOwnPropertyDescriptor(target, prop);
        if (own) return own;
        if (typeof prop === 'symbol') return undefined;
        const name = target._index.get(prop);
        if (!name) return undefined;
        return {
          configurable: true,
          enumerable: true,
          writable: false,
          value: target.properties[name]?.value,
        };
      },
    });
  }

  /** Canonical member name for any accepted spelling, or null. */
  memberName(name) {
    return this._index.get(name) ?? this._index.get(String(name).toLowerCase()) ?? null;
  }

  /** True when a prototype declares the member or the entity holds a value. */
  hasMember(name) {
    return this.memberName(name) !== null;
  }

  /**
   * True when the member exists AND the entity has a value for it.
   *
   * Distinguishing this from `hasMember` is the point: plain access returns
   * `undefined` for a typo, for a declared-but-empty field, and for a member no
   * prototype declares, and telling those apart is most of debugging a fuzzy
   * projection.
   */
  hasValue(name) {
    const key = this.memberName(name);
    return Boolean(key && this.properties[key] && this.properties[key].value !== undefined);
  }

  /** Winner value, same as plain access, for computed names. */
  value(name) {
    const key = this.memberName(name);
    return key ? this.properties[key]?.value : undefined;
  }

  /**
   * Full cell: value plus confidence, contested flag, ranked claims, and which
   * prototype supplied the member.
   */
  cell(name) {
    const key = this.memberName(name);
    if (!key) return undefined;
    const member = this.members[key] || {};
    const property = this.properties[key] || {};
    return {
      name: key,
      value: property.value,
      confidence: property.confidence ?? null,
      contested: property.contested === true,
      claims: property.claims || [],
      valueType: member.valueType ?? null,
      required: member.required === true,
      definedBy: member.definedBy ?? null,
      alsoDefinedBy: member.alsoDefinedBy || [],
      hasValue: this.hasValue(key),
    };
  }

  /** Ranked claim stack for a member, strongest first. */
  claims(name) {
    return this.cell(name)?.claims ?? [];
  }

  /** True when claims disagree, so a caller can surface the conflict. */
  isContested(name) {
    return this.cell(name)?.contested === true;
  }

  /**
   * Where a member came from and what else could have supplied it.
   * Returns null for an unknown name.
   */
  explain(name) {
    const key = this.memberName(name);
    if (!key) return null;
    const member = this.members[key] || {};
    return {
      name: key,
      definedBy: member.definedBy ?? null,
      alsoDefinedBy: member.alsoDefinedBy || [],
      contested: this.isContested(key),
      confidence: this.properties[key]?.confidence ?? null,
    };
  }

  /** Strongest match, or null when nothing matched. */
  type() {
    return this.types[0] ?? null;
  }

  /** Ranked matches. Always an array. */
  typesNow() {
    return this.types;
  }

  /**
   * The same entity seen through one specific matched prototype, by name or
   * uuid. Members not declared by that prototype disappear, which is how a
   * caller escapes a wrong top-ranked guess without a second request.
   */
  as(prototype) {
    const wanted = String(prototype);
    let entry = this.byPrototype[wanted];
    let name = wanted;
    if (!entry) {
      const found = Object.entries(this.byPrototype).find(
        ([key, value]) => value?.uuid === wanted || key.toLowerCase() === wanted.toLowerCase(),
      );
      if (!found) return null;
      [name, entry] = found;
    }

    const allowed = new Set(entry.members || []);
    const members = {};
    const properties = {};
    for (const memberName of allowed) {
      if (this.members[memberName]) {
        members[memberName] = {
          ...this.members[memberName],
          definedBy: {
            prototypeUuid: entry.uuid,
            prototypeName: name,
            score: entry.score ?? null,
          },
        };
      }
      if (this.properties[memberName]) properties[memberName] = this.properties[memberName];
    }

    return new KSGObject({
      uuid: this.uuid,
      ok: this.ok,
      hydratedAt: this.hydratedAt,
      types: [{ uuid: entry.uuid, name, score: entry.score ?? null }],
      members,
      properties,
      byPrototype: { [name]: entry },
      policy: this.policy,
    });
  }

  toJSON() {
    return {
      ok: this.ok,
      uuid: this.uuid,
      hydratedAt: this.hydratedAt,
      types: this.types,
      members: this.members,
      properties: this.properties,
    };
  }
}

/**
 * Match a concrete request path against a release-contract template.
 * `/api/objects/:uuid` matches `/api/objects/4ee7…`; length must agree.
 */
export function matchesRoute(template, actual) {
  const expected = String(template || "").split("/");
  const received = String(actual || "").split("/");
  if (expected.length !== received.length) return false;
  return expected.every(
    (segment, i) => segment.startsWith(":") || segment === received[i],
  );
}

/** Lineage-key prefix every seeded Logic IR primitive category carries. */
// ===== Object → prototype matching (AC1) =====
// Keys that name or identify an object rather than describe it.
const OBJECT_NAME_KEYS = ['label', 'name', 'title'];
const OBJECT_META_KEYS = new Set(['uuid', 'id', 'type', 'types', 'prototype', 'prototypeIds', 'instanceOf', 'properties', 'props', 'description', 'summary', ...OBJECT_NAME_KEYS]);
// How much the property overlap may move a prototype's rank. The centroid score
// stays the main signal; overlap breaks near-ties the embedding cannot see,
// such as a person whose description reads like an employer.
export const PROPERTY_OVERLAP_WEIGHT = 0.3;
const TAXONOMY_CACHE_MS = 10 * 60 * 1000;
const MATCH_EVIDENCE_WINDOW = 25;

const normalizeKey = (k) => String(k ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const humanKey = (k) => String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function valueText(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(valueText).filter(Boolean).join(', ');
  if (typeof v === 'object') return valueText(v.label ?? v.name ?? v.value ?? v.title ?? '');
  const s = String(v);
  return UUID_RE.test(s) ? '' : s;
}

/** The descriptive properties of an object: `properties`/`props`, else its own non-meta keys. */
export function objectProperties(object) {
  if (!object || typeof object !== 'object') return {};
  const nested = object.properties ?? object.props;
  if (nested && typeof nested === 'object') return nested;
  const out = {};
  for (const [k, v] of Object.entries(object)) if (!OBJECT_META_KEYS.has(k)) out[k] = v;
  return out;
}

/**
 * Text an object is embedded as for prototype matching:
 * "<label>. <description>. key: value; key: value".
 */
export function objectToMatchText(object) {
  if (object == null) return '';
  if (typeof object !== 'object') return String(object);
  const name = OBJECT_NAME_KEYS.map((k) => object[k]).find((v) => v != null && v !== '');
  const parts = [];
  if (name) parts.push(`${valueText(name)}.`);
  const description = object.description ?? object.summary;
  if (description) parts.push(`${valueText(description)}.`);
  const pairs = Object.entries(objectProperties(object))
    .map(([k, v]) => [humanKey(k), valueText(v)])
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);
  if (pairs.length) parts.push(pairs.join('; '));
  return parts.join(' ').trim();
}

/**
 * For every prototype in a taxonomy tree, keyed by uuid: its own + inherited
 * property names (normalized → canonical) and its lineage (its own name, then
 * every ancestor's), so a match on City still counts as a Place.
 */
function propertySchemaByPrototype(tree) {
  const nodes = new Map((tree?.nodes || []).map((n) => [n.uuid, n]));
  const memo = new Map();
  const collect = (uuid, seen = new Set()) => {
    if (memo.has(uuid)) return memo.get(uuid);
    const empty = { props: new Map(), lineage: [] };
    if (seen.has(uuid)) return empty;
    seen.add(uuid);
    const node = nodes.get(uuid);
    const props = new Map();
    const lineage = node?.name ? [node.name] : [];
    for (const parent of node?.parents || []) {
      const up = collect(parent, seen);
      for (const [k, v] of up.props) props.set(k, v);
      for (const name of up.lineage) if (!lineage.includes(name)) lineage.push(name);
    }
    for (const p of node?.properties || []) {
      if (!p?.name) continue;
      props.set(normalizeKey(p.name), p.name);
      if (p.schemaName) props.set(normalizeKey(p.schemaName), p.name);
    }
    const out = { props, lineage };
    memo.set(uuid, out);
    return out;
  };
  const schema = new Map();
  for (const uuid of nodes.keys()) schema.set(uuid, collect(uuid));
  return schema;
}

const isPropertyValuePrototype = (m) => Boolean(m?.propertyName) || /^PropertyValue:/.test(String(m?.name || ''));

/** Which of the object's keys the prototype declares, and which it lacks. */
function propertyEvidence(objectProps, entry) {
  const keys = Object.keys(objectProps || {});
  if (!entry) return { schema: false, matched: [], missing: [], extra: keys, known: [], isA: [], overlap: null };
  const known = entry.props;
  const matched = [];
  const extra = [];
  for (const k of keys) {
    const hit = known.get(normalizeKey(k));
    if (hit) matched.push(hit); else extra.push(k);
  }
  const names = [...new Set(known.values())];
  const matchedSet = new Set(matched);
  return {
    schema: true,
    matched: [...matchedSet],
    extra,
    missing: names.filter((n) => !matchedSet.has(n)),
    known: names,
    isA: entry.lineage,
    overlap: keys.length ? Math.round((matchedSet.size / keys.length) * 10000) / 10000 : null
  };
}

const LOGIC_IR_LINEAGE_PREFIX = 'category:logic-ir:';

/** `category:logic-ir:proposition` -> `Proposition`, for rows with no name. */
function logicIrNameFromLineage(lineage) {
  const slug = lineage.slice(LOGIC_IR_LINEAGE_PREFIX.length);
  if (!slug) return null;
  return slug.charAt(0).toUpperCase() + slug.slice(1);
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
    defaultAgentSessionId = null,
    authToken = null,
    accessToken = null,
    apiToken = null,
    tokenProvider = null,
    adminSecret = null,
    timeoutMs = Number(globalThis?.process?.env?.KSG_TIMEOUT_MS ?? 30000)
  } = {}) {
    this.baseUrl = resolveBaseUrl(baseUrl).replace(/\/+$/, '');
    // Bound every request. 30s is above a healthy p99 and well under the agent's
    // stall timeout, so a degraded service reports rather than hangs.
    this.timeoutMs = Number(timeoutMs) || 0;
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
    // Hard identity. A signed token cannot be spoofed the way the soft owner
    // headers can, and the server prefers it over them when both are present.
    // Aliases: accessToken / apiToken (assessment + AGENTS.md naming).
    this.authToken = authToken || accessToken || apiToken || null;
    /** @type {null|(() => string|Promise<string|null|undefined>)} */
    this.tokenProvider = typeof tokenProvider === "function" ? tokenProvider : null;
    // Minting a token for someone else needs the server's admin secret, sent as
    // X-KSG-Admin. Without it a caller can only mint for the owner they already
    // hold a token for, which leaves no way to issue the first one.
    this.adminSecret = adminSecret || null;
    this._contract = null;
    this._enforceContract = false;
    this._connectPromise = auto_connect ? this.connect() : null;
    if (this._connectPromise && typeof this._connectPromise.catch === "function") {
      // Prevent an unhandled rejection if the caller never awaits ready().
      this._connectPromise.catch(() => {});
    }
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
   * `expected_channel` / `expected_release` are **opt-in**. A bare `connect()`
   * discovers whatever the server advertises (public release or dev) — pinned
   * defaults previously made `connect()` throw against api.knowshowgo.com.
   *
   * `adopt_advertised_base_url` re-points this client at `api.publicBaseUrl`
   * from the manifest.
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
    const allowed = this._contract.some(
      (entry) => entry.method === method && matchesRoute(entry.path, path),
    );
    if (!allowed) {
      throw new Error(`endpoint not in client contract: ${method} ${path}`);
    }
  }

  /**
   * Await the optional constructor `auto_connect` handshake.
   * Safe to call when auto_connect was false (resolves immediately).
   */
  async ready() {
    if (this._connectPromise) await this._connectPromise;
    return this;
  }

  async _resolveAuthToken(explicit) {
    if (explicit !== undefined && explicit !== null) return explicit;
    if (this.tokenProvider) {
      const provided = await this.tokenProvider();
      if (provided != null && provided !== "") {
        this.authToken = provided;
        return provided;
      }
    }
    return this.authToken;
  }

  /** Swap the bearer token on a live client (e.g. after minting or rotating one). */
  set_auth_token(token) {
    this.authToken = token || null;
    return this;
  }

  /**
   * Every request is bounded.
   *
   * An unbounded fetch turns a slow service into a hung caller. When Arango
   * degraded to ~19s per query on 2026-09-07, no request failed — they all just
   * waited, so an agent turn ran past its stall timeout and the product read as
   * "memory is down" rather than "memory is slow". A server that cannot answer
   * in time should surface as an error the caller can report, not as silence.
   *
   * `timeoutMs: 0` disables the bound, for callers deliberately awaiting a long
   * operation.
   */
  async _fetchWithTimeout(url, init, label) {
    const timeoutMs = Number(this.timeoutMs ?? 0);
    if (!timeoutMs || timeoutMs <= 0 || typeof AbortController === 'undefined') {
      return this.fetch(url, init);
    }

    const controller = new AbortController();
    let timer;
    // Race rather than rely on the signal. Aborting is a request, not a
    // guarantee: a transport that ignores `signal` (any injected fetch, and some
    // polyfills) would otherwise hang forever and the bound would be decorative.
    // The signal is still passed so a transport that does honour it can stop
    // work rather than merely being ignored.
    const expiry = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        const timeout = new Error(
          `KnowShowGo request timed out after ${timeoutMs}ms: ${label}. ` +
          'The service is reachable but not answering in time — check GET /health for arango.ok.'
        );
        timeout.code = 'KSG_TIMEOUT';
        timeout.timeoutMs = timeoutMs;
        reject(timeout);
      }, timeoutMs);
    });

    try {
      return await Promise.race([this.fetch(url, { ...init, signal: controller.signal }), expiry]);
    } finally {
      clearTimeout(timer);
    }
  }

  async _request(method, endpoint, { json, params, owner_user_id, agent_session_id, auth_token, admin_secret, skip_ready = false } = {}) {
    // Don't deadlock: connect() → get_release_manifest → _request must not await ready().
    if (!skip_ready && endpoint !== "/api/release" && endpoint !== "/health") {
      await this.ready();
    }
    this._assertContractPath(method, endpoint);
    const url = new URL(this.baseUrl + endpoint);
    const ownerUserId = owner_user_id ?? this.defaultOwnerUserId;
    const agentSessionId = agent_session_id ?? this.defaultAgentSessionId;
    const token = await this._resolveAuthToken(auth_token);
    const mergedParams = { ...(params || {}) };
    // Prefer Authorization over identity-in-query (logs/caches). Soft headers remain.
    if (!token) {
      if (ownerUserId != null && mergedParams.ownerUserId == null) {
        mergedParams.ownerUserId = ownerUserId;
      }
      if (agentSessionId != null && mergedParams.agentSessionId == null) {
        mergedParams.agentSessionId = agentSessionId;
      }
    }
    for (const [k, v] of Object.entries(mergedParams)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const headers = json
      ? { 'content-type': 'application/json', accept: 'application/json' }
      : { accept: 'application/json' };
    if (ownerUserId) headers['x-ksg-owner'] = String(ownerUserId);
    if (agentSessionId) headers['x-ksg-session'] = String(agentSessionId);
    if (token) headers.authorization = `Bearer ${token}`;
    const admin = admin_secret ?? this.adminSecret;
    if (admin) headers['x-ksg-admin'] = String(admin);

    let bodyJson = json;
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      bodyJson = { ...json };
      if (ownerUserId != null && bodyJson.ownerUserId == null) bodyJson.ownerUserId = ownerUserId;
      if (agentSessionId != null && bodyJson.agentSessionId == null) bodyJson.agentSessionId = agentSessionId;
    }

    const res = await this._fetchWithTimeout(url.toString(), {
      method,
      headers,
      body: bodyJson ? JSON.stringify(bodyJson) : undefined
    }, `${method} ${endpoint}`);

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
    return this._request('GET', '/health', { skip_ready: true });
  }

  get_release_manifest() {
    return this._request('GET', '/api/release', { skip_ready: true });
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

  /**
   * Search concepts by similarity.
   *
   * `similarity_threshold` defaults to **no floor**, matching the server. The
   * previous default of 0.7 was harmless only for as long as the server
   * accepted the parameter and dropped it. The server now applies it, and both
   * backends score a text-path match a constant 0.5 — so the old default made
   * this method return an empty array for any corpus answered by text, which
   * verified as a silent nothing against a live service while all 114 mocked
   * unit tests stayed green. Callers that want a floor pass one.
   */
  // `scope: 'owner'` (server ≥ 0.2.29) scopes the database scan to the caller's
  // own nodes — the owner is already on the request as identity; this applies
  // it before the scan instead of after — and `props` is exact equality on
  // named props, for the lookups where "close enough" is wrong (a card's last
  // four, a holder). Both are sent only when given, so the request to an
  // older server is unchanged.
  search_concepts(query, {
    top_k = 10,
    similarity_threshold = 0,
    prototype_filter = null,
    scope = null,
    props = null,
    kind = null,
    owner_user_id = null,
    agent_session_id = null
  } = {}) {
    return this._request('POST', '/api/concepts/search', {
      json: {
        query,
        topK: top_k,
        similarityThreshold: similarity_threshold,
        prototypeFilter: prototype_filter,
        ...(scope ? { scope } : {}),
        ...(props && typeof props === 'object' ? { props } : {}),
        ...(kind ? { kind } : {})
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

  // ===== API tokens (hard identity) =====
  // The soft X-KSG-Owner header is client-supplied and therefore trusted only as
  // far as the caller is; these mint signed tokens the server can actually
  // verify. Token endpoints share the prototype prefix (/api2.0 with /api kept
  // as the backward-compatible alias).

  /**
   * Mint a token for an owner. The raw token is returned exactly once — the
   * server stores only a record of it — so a caller that drops it must mint
   * another rather than re-read this one.
   *
   * @returns {Promise<{ ok: boolean, token: string, record: object }>}
   */
  create_api_token({ owner_user_id = null, label = null, agent_session_id = null, ttl_days = null } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/auth/tokens`, {
      json: {
        ownerUserId: owner_user_id,
        label,
        agentSessionId: agent_session_id,
        ttlDays: ttl_days
      }
    });
  }

  /** List an owner's token records (never the raw tokens). */
  list_api_tokens({ owner_user_id = null } = {}) {
    return this._request('GET', `${this.prototypeApiPrefix}/auth/tokens`, {
      params: owner_user_id ? { ownerUserId: owner_user_id } : undefined
    }).then((r) => r.tokens);
  }

  /** Revoke one token by its `jti`. */
  revoke_api_token(jti, { owner_user_id = null } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/auth/tokens/${encodeURIComponent(jti)}/revoke`, {
      json: { ownerUserId: owner_user_id }
    });
  }

  /**
   * Per-principal request/read/write counts for cost and quota tracking.
   *
   * Admin-only, and it authenticates differently from the token endpoints: the
   * admin secret goes in as the bearer here, not the X-KSG-Admin header.
   */
  get_admin_usage({ admin_token = null } = {}) {
    return this._request('GET', '/api/admin/usage', {
      auth_token: admin_token ?? this.adminSecret ?? this.authToken
    });
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
  // Nearest-centroid over the values each prototype has absorbed — a value-shaped
  // question ("which category is this?"). To ask which FIELD a label names, search
  // property-definition concepts instead (see `search_property_definitions`): a
  // value centroid drifts toward the shape of the data, so "Card number" would
  // rank closer to `cvv` than to `number`.
  //
  // Pass `object` (a label plus properties, e.g. `{ label, properties: { birthDate,
  // works_for } }`) to classify a structured thing. Each match then carries
  // `typicality` (cosine to the prototype's centroid), `evidence` (which of the
  // object's properties the prototype declares, own or inherited, from the
  // schema.org taxonomy) and `rankScore`, the order the list is returned in:
  // score blended with property overlap by PROPERTY_OVERLAP_WEIGHT. A prototype
  // outside the taxonomy, or no taxonomy at all, ranks on score alone.
  async match_prototypes({ text = null, embedding = null, object = null, top_k = 5, threshold = 0, evidence = null } = {}) {
    const queryText = text ?? (object != null ? objectToMatchText(object) : null);
    const withEvidence = evidence ?? (object != null);
    // Evidence can only re-rank what the server returns, so ask for a wider
    // window of candidates by centroid and cut back to top_k after re-ranking.
    const window = withEvidence ? Math.max(top_k * 4, MATCH_EVIDENCE_WINDOW) : top_k;
    const matches = await this._request('POST', `${this.prototypeApiPrefix}/prototypes/match`, {
      json: { text: queryText, embedding, topK: window, threshold }
    }).then(r => r.matches);
    if (!withEvidence || !Array.isArray(matches)) return matches;

    const objectProps = objectProperties(object);
    const hasProps = Object.keys(objectProps).length > 0;
    const schema = await this._taxonomySchema();
    // A per-property value prototype ("PropertyValue:city") answers which FIELD
    // a value fills, never what an object IS; keep them out of a classification.
    const ranked = matches.filter((m) => !isPropertyValuePrototype(m)).map((m) => {
      const ev = propertyEvidence(objectProps, schema?.get(m.uuid) || null);
      const score = Number(m.score) || 0;
      // With properties to compare, a prototype that declares none of them (or
      // has no schema at all) scores overlap 0 rather than escaping the blend.
      const rankScore = !hasProps
        ? score
        : Math.round(((1 - PROPERTY_OVERLAP_WEIGHT) * score + PROPERTY_OVERLAP_WEIGHT * (ev.overlap ?? 0)) * 10000) / 10000;
      return { ...m, typicality: m.centroidScore ?? m.score ?? null, evidence: ev, rankScore };
    });
    return ranked.sort((a, b) => b.rankScore - a.rankScore).slice(0, top_k);
  }

  /** The taxonomy's property schema, cached; null when the taxonomy cannot be read. */
  async _taxonomySchema() {
    const now = Date.now();
    if (this._taxonomyCache && now - this._taxonomyCache.at < TAXONOMY_CACHE_MS) return this._taxonomyCache.schema;
    try {
      const tree = await this.get_taxonomy();
      this._taxonomyCache = { at: now, schema: propertySchemaByPrototype(tree) };
    } catch {
      // Retry soon rather than every call: a missing route should not double latency.
      this._taxonomyCache = { at: now - TAXONOMY_CACHE_MS + 30000, schema: null };
    }
    return this._taxonomyCache.schema;
  }

  // ===== Taxonomy (TX1, read-only) =====
  /** The prototype tree under `root` (default Thing): properties, counts, badges. */
  get_taxonomy({ root = null } = {}) {
    return this._request('GET', `${this.prototypeApiPrefix}/taxonomy`, { params: root ? { root } : undefined });
  }

  /** One prototype: definition, centroid, own + inherited properties, exemplars, instances. */
  get_taxonomy_prototype(uuid) {
    return this._request('GET', `${this.prototypeApiPrefix}/taxonomy/prototypes/${encodeURIComponent(uuid)}`);
  }

  /** One node: its prototypes with typicality, propositions with provenance, links. */
  get_taxonomy_node(uuid, { history = false } = {}) {
    return this._request('GET', `${this.prototypeApiPrefix}/taxonomy/nodes/${encodeURIComponent(uuid)}`, {
      params: history ? { history: 1 } : undefined
    });
  }

  // ===== Concept lookup (CE3) =====
  /** Look a public term up in Wikidata / Wikipedia / Wiktionary and ground it as a concept. */
  lookup_concept({ term, context = null, entity_type = null, force = null } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/concepts/lookup`, {
      json: withoutNulls({ term, context, entityType: entity_type, force })
    });
  }

  /** CE3d counters: model propositions proposed, reused, refused, confirmed, contradicted. */
  get_inferred_proposition_stats() {
    return this._request('GET', `${this.prototypeApiPrefix}/propositions/inferred/stats`);
  }

  // ===== CS1: the rest of the agent-facing routes (server capability manifest) =====

  /**
   * CE3d: compare the model's proposals about a public name with higher-tier
   * claims about anything of that name; matches are promoted, single-valued
   * disagreements are marked contradicted.
   */
  reconcile_inferred_propositions({ label } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/propositions/reconcile`, { json: { label } });
  }

  // TB2 / KV1: typed property values.
  /** The closed list of property value types (url, uuid ref, number, date, time, …) and external-id schemes. */
  list_value_types() {
    return this._request('GET', `${this.prototypeApiPrefix}/value-types`);
  }

  /** Declared properties whose name matches `query`, with value type, cardinality and range. */
  search_predicates({ query = '', limit = null } = {}) {
    return this._request('GET', `${this.prototypeApiPrefix}/predicates`, { params: withoutNulls({ q: query, limit }) });
  }

  /**
   * Declare a property. An existing name is returned, not duplicated (200 vs
   * 201). `attach_to` proposes it to a prototype as a candidate field.
   */
  declare_predicate({ name, value_type, cardinality = null, range = null, options = null, description = null, attach_to = null } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/predicates/declare`, {
      json: withoutNulls({ name, valueType: value_type, cardinality, range, options, description, attachTo: attach_to })
    });
  }

  /** A prototype's own and inherited properties: the fields of its create form. */
  get_prototype_fields(uuid) {
    return this._request('GET', `${this.prototypeApiPrefix}/prototypes/${encodeURIComponent(uuid)}/fields`);
  }

  // TB2: topic articles and amendments.
  /** Topics (articles) whose title matches `query`, optionally within prototype names `range`. */
  search_articles({ query = '', range = null, limit = null } = {}) {
    return this._request('GET', `${this.prototypeApiPrefix}/articles`, {
      params: withoutNulls({ q: query, range: Array.isArray(range) && range.length ? range.join(',') : null, limit })
    });
  }

  /**
   * One topic as an article: lead, fields from its prototypes and claims, the
   * current value and every other version with its provenance.
   */
  get_article(uuid) {
    return this._request('GET', `${this.prototypeApiPrefix}/articles/${encodeURIComponent(uuid)}`);
  }

  /** Create a topic of a prototype with typed fields. Needs a signed-in owner (401 otherwise). */
  create_article({ prototype_uuid, title, description = null, fields = null, private: isPrivate = null, allow_duplicate = null, source_url = null, source_title = null, note = null } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/articles`, {
      json: withoutNulls({
        prototypeUuid: prototype_uuid, title, description, fields, private: isPrivate, allowDuplicate: allow_duplicate,
        sourceUrl: source_url, sourceTitle: source_title, note
      })
    });
  }

  /**
   * Amend a topic with one typed claim. `replaces_claim` makes it the next
   * version of that claim; the old value stays readable. Needs a signed-in owner.
   */
  amend_article(uuid, { predicate, value_type = null, value = undefined, object_uuid = null, unit = null, lang = null, precision = null, scheme = null, replaces_claim = null, source_url = null, source_title = null, note = null } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/articles/${encodeURIComponent(uuid)}/claims`, {
      json: withoutNulls({
        predicate, valueType: value_type, value, objectUuid: object_uuid, unit, lang, precision, scheme,
        replacesClaim: replaces_claim, sourceUrl: source_url, sourceTitle: source_title, note
      })
    });
  }

  // DH1: one active prototype per name.
  /** Public prototype names with more than one active prototype (counts and names only). */
  get_taxonomy_duplicates() {
    return this._request('GET', `${this.prototypeApiPrefix}/taxonomy/duplicates`);
  }

  // Concept identity.
  /** Resolve a label to its preferred concept (and the caller's personal one) without creating anything. */
  resolve_concept({ label, ...rest } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/concepts/resolve`, { json: withoutNulls({ label, ...camelKeys(rest) }) });
  }

  /** The identity path of concept creation: the existing concept for this label, or a new one. */
  find_or_create_concept({ label, ...rest } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/concepts/find-or-create`, { json: withoutNulls({ label, ...camelKeys(rest) }) });
  }

  /** Merge duplicate concepts into a survivor (reversible with `unmerge_concept`). */
  merge_concepts({ survivor, members = [], score = null, reason = null } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/concepts/merge`, { json: withoutNulls({ survivor, members, score, reason }) });
  }

  /** Take one member back out of a merge. */
  unmerge_concept(uuid, { reason = null } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/concepts/${encodeURIComponent(uuid)}/unmerge`, { json: withoutNulls({ reason }) });
  }

  /** The concepts merged into this one (its variants). */
  get_concept_variants(uuid) {
    return this._request('GET', `${this.prototypeApiPrefix}/concepts/${encodeURIComponent(uuid)}/variants`);
  }

  // Logic IR derivations.
  /** One recorded derivation, explained. */
  get_derivation(uuid) {
    return this._request('GET', `${this.prototypeApiPrefix}/logic-ir/derivations/${encodeURIComponent(uuid)}`);
  }

  /** The proof tree under a derivation: why a conclusion holds, premise by premise. */
  get_derivation_tree(uuid, { max_depth = null } = {}) {
    return this._request('GET', `${this.prototypeApiPrefix}/logic-ir/derivations/${encodeURIComponent(uuid)}/tree`, {
      params: withoutNulls({ maxDepth: max_depth })
    });
  }

  /** Add a confirmed member to a category's exemplars (moves the centroid, never the definition). */
  assimilate_exemplar({ subject, category } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/prototypes/assimilate`, { json: { subject, category } });
  }

  /** The raw one-trip hydration payload (`hydrate()` wraps it as a KSGObject). */
  hydrate_entity(entityId, { top_k = null, threshold = null } = {}) {
    return this._request('GET', `${this.prototypeApiPrefix}/entities/${encodeURIComponent(entityId)}/hydrate`, {
      params: withoutNulls({ topK: top_k, threshold })
    });
  }

  /**
   * KT1: a view of this client that acts as one owner. Every method called on
   * it sends that owner's token (and owner id), so one process can serve many
   * owners without swapping the client's own token. Without `auth_token` the
   * view keeps the parent's token. The parent client is not changed.
   *
   *   const avery = client.for_owner({ auth_token: averyToken, owner_user_id: 'avery' });
   *   await avery.search_procedures('order lunch');
   */
  for_owner({ auth_token = null, owner_user_id = null, agent_session_id = null } = {}) {
    const view = Object.create(this);
    if (auth_token != null) {
      view.authToken = auth_token;
      view.tokenProvider = null;
    }
    if (owner_user_id != null) view.defaultOwnerUserId = owner_user_id;
    if (agent_session_id != null) view.defaultAgentSessionId = agent_session_id;
    return view;
  }

  /**
   * Which stored field does this label name? Ranks property-definition concepts
   * over the same vector index every other search uses, filtered by node role.
   * Returns [{ property, valueType, score, uuid }] best first, one per property.
   */
  search_property_definitions(query, { top_k = 20, owner_user_id = null, agent_session_id = null } = {}) {
    return this.search_concepts(query, {
      top_k,
      similarity_threshold: 0,
      owner_user_id,
      agent_session_id
    }).then((results) => {
      const out = [];
      const seen = new Set();
      for (const r of results || []) {
        if (r?.props?.isObjectPropertyDefinition !== true) continue;
        const property = r.props.propertyName;
        if (!property || seen.has(property)) continue;
        seen.add(property);
        out.push({
          property,
          valueType: r.props.valueType ?? null,
          score: r.similarity ?? 0,
          uuid: r.uuid
        });
      }
      return out;
    });
  }

  /**
   * Resolve observed labels onto stored fields — a form's inputs, a CSV header
   * row, an API payload. The server ranks and assigns, so callers do not each
   * reimplement it.
   *
   * `candidates` closes the set to fields you actually hold, so a label naming
   * something unknown resolves to nothing instead of the nearest vector.
   * Assignment is one-to-one: a field fills at most one label.
   *
   * @returns {Promise<{ slots: Array<{label, property, score}>, unresolved: string[] }>}
   */
  resolve_slots({ labels = [], candidates = null, floor = 0.5, top_k = 40, owner_user_id = null, agent_session_id = null } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/slots/resolve`, {
      json: { labels, candidates, floor, topK: top_k },
      owner_user_id,
      agent_session_id
    });
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

  evaluatePrototypeMatch({
    objectRevisionUuid,
    prototypeRevisionUuid,
    contextRevisionUuid = null
  } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/prototype-matches/evaluate`, {
      json: { objectRevisionUuid, prototypeRevisionUuid, contextRevisionUuid }
    });
  }

  evaluate_prototype_match({
    object_revision_uuid,
    prototype_revision_uuid,
    context_revision_uuid = null
  } = {}) {
    return this.evaluatePrototypeMatch({
      objectRevisionUuid: object_revision_uuid,
      prototypeRevisionUuid: prototype_revision_uuid,
      contextRevisionUuid: context_revision_uuid
    });
  }

  /**
   * Additive list API. Does not replace evaluatePrototypeMatch and does not
   * WTA-cast. Empty prototypeRevisionUuids → server lists matchable prototypes.
   */
  evaluatePrototypeMatchList({
    objectRevisionUuid,
    prototypeRevisionUuids = [],
    contextRevisionUuid = null,
    limit = null
  } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/prototype-matches/list`, {
      json: {
        objectRevisionUuid,
        prototypeRevisionUuids,
        contextRevisionUuid,
        ...(limit != null ? { limit } : {})
      }
    });
  }

  evaluate_prototype_match_list({
    object_revision_uuid,
    prototype_revision_uuids = [],
    context_revision_uuid = null,
    limit = null
  } = {}) {
    return this.evaluatePrototypeMatchList({
      objectRevisionUuid: object_revision_uuid,
      prototypeRevisionUuids: prototype_revision_uuids,
      contextRevisionUuid: context_revision_uuid,
      limit
    });
  }

  /**
   * Persist a new object under a chosen prototype. Source revision is unchanged.
   * requireMatch defaults true (409 when the list/evaluate decision is not match).
   */
  cast_object({
    objectRevisionUuid,
    prototypeRevisionUuid,
    contextRevisionUuid = null,
    requireMatch = true,
    title = null,
    objectLineageKey = null,
    owner_user_id = null,
    agent_session_id = null
  } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/prototype-matches/cast`, {
      json: {
        objectRevisionUuid,
        prototypeRevisionUuid,
        contextRevisionUuid,
        requireMatch,
        title,
        objectLineageKey
      },
      owner_user_id,
      agent_session_id
    });
  }

  castObject(args = {}) {
    return this.cast_object(args);
  }

  /**
   * Structural validity of an argument (R2): does the conclusion follow from
   * the premises under the four inference rules. Never reads the graph.
   * `record: true` (KG2) persists a valid result as a Derivation object; the
   * response then carries `derivation: { ok, created, derivationUuid, rule }`.
   */
  evaluateLogicInference({
    premiseRevisionUuids = [],
    conclusionRevisionUuid = null,
    argumentRevisionUuid = null,
    record = false
  } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/logic-ir/infer`, {
      json: {
        premiseRevisionUuids,
        conclusionRevisionUuid,
        argumentRevisionUuid,
        ...(record === true ? { record: true } : {})
      }
    });
  }

  evaluate_logic_inference({
    premise_revision_uuids = [],
    conclusion_revision_uuid = null,
    argument_revision_uuid = null,
    record = false
  } = {}) {
    return this.evaluateLogicInference({
      premiseRevisionUuids: premise_revision_uuids,
      conclusionRevisionUuid: conclusion_revision_uuid,
      argumentRevisionUuid: argument_revision_uuid,
      record
    });
  }

  /**
   * Truth of a quantifier-free formula against stored claims (KG1): three
   * valued, `truth: 'true' | 'false' | 'unknown'`, with the claim uuids
   * consulted per atom. Absence is `unknown`, never `false`; quantifiers are
   * refused. Pass `ir` (+ `bindings`) or a `propositionRevisionUuid`.
   * `record: true` (KG2) persists a true/false evaluation as a Derivation.
   */
  evaluateLogicIr({
    ir = null,
    bindings = null,
    propositionRevisionUuid = null,
    membershipPredicate = null,
    record = false
  } = {}) {
    const json = {};
    if (ir !== null && ir !== undefined) json.ir = ir;
    if (bindings !== null && bindings !== undefined) json.bindings = bindings;
    if (propositionRevisionUuid) json.propositionRevisionUuid = propositionRevisionUuid;
    if (membershipPredicate) json.membershipPredicate = membershipPredicate;
    if (record === true) json.record = true;
    return this._request('POST', `${this.prototypeApiPrefix}/logic-ir/evaluate`, { json });
  }

  evaluate_logic_ir({
    ir = null,
    bindings = null,
    proposition_revision_uuid = null,
    membership_predicate = null,
    record = false
  } = {}) {
    return this.evaluateLogicIr({
      ir,
      bindings,
      propositionRevisionUuid: proposition_revision_uuid,
      membershipPredicate: membership_predicate,
      record
    });
  }

  /**
   * Walk a derivation back (KG2): `{ derivation, rule: { uuid, name,
   * engineRevision }, premises: [{ uuid, kind, claimUuid, order }],
   * conclusion: { uuid, hash } }`. Edges only, so it answers the same after a
   * restart. 404 when the uuid is not a derivation.
   */
  explainDerivation(derivationUuid) {
    if (!derivationUuid) throw new Error('derivationUuid is required');
    return this._request(
      'GET',
      `${this.prototypeApiPrefix}/logic-ir/derivations/${encodeURIComponent(derivationUuid)}`
    );
  }

  explain_derivation(derivation_uuid) {
    return this.explainDerivation(derivation_uuid);
  }

  /** Every derivation whose `derives` edge points at this conclusion (KG2). */
  listDerivations({ conclusionUuid } = {}) {
    if (!conclusionUuid) throw new Error('conclusionUuid is required');
    return this._request('GET', `${this.prototypeApiPrefix}/logic-ir/derivations`, {
      params: { conclusion: conclusionUuid }
    }).then((r) => r.derivations || []);
  }

  list_derivations({ conclusion_uuid } = {}) {
    return this.listDerivations({ conclusionUuid: conclusion_uuid });
  }

  // ===== Logic IR rules (KG3 / KG5 / KG21) =====
  // Rules are graph objects: each change is a new version of the same lineage,
  // and every derivation names the rule version it used. Refusals come back as
  // errors carrying the server body (`err.body.code`: R001 bad input, R002
  // disabled → 409, R003 not found → 404).

  /**
   * Add a rule (a guarded universal in Logic IR). The same name with the same
   * body is one object; a changed body is the next version. Resolves to
   * `{ ok, ruleUuid, version, reused, revision, enabled, name, domain, variable }`.
   */
  create_rule({ name, ir, description, enabled, provenance } = {}) {
    if (!name || !String(name).trim()) throw new Error('name is required');
    if (!ir || typeof ir !== 'object') throw new Error('ir is required');
    return this._request('POST', `${this.prototypeApiPrefix}/logic-ir/rules`, {
      json: withoutNulls({ name, ir, description, enabled, provenance })
    });
  }

  /** The current version of every rule the caller may read: `{ ok, rulesRevision, rules }`. */
  list_rules() {
    return this._request('GET', `${this.prototypeApiPrefix}/logic-ir/rules`);
  }

  /** One rule version with every version of its lineage: `{ ok, rule, versions }`. */
  get_rule(rule_uuid) {
    if (!rule_uuid) throw new Error('rule_uuid is required');
    return this._request('GET', `${this.prototypeApiPrefix}/logic-ir/rules/${encodeURIComponent(rule_uuid)}`);
  }

  /** Enable or disable a rule; writes a new version unless nothing changes (`unchanged: true`). */
  set_rule_enabled(rule_uuid, enabled) {
    if (!rule_uuid) throw new Error('rule_uuid is required');
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    return this._request('POST', `${this.prototypeApiPrefix}/logic-ir/rules/${encodeURIComponent(rule_uuid)}/enabled`, {
      json: { enabled }
    });
  }

  /**
   * Check rules against named members in one round trip. A member is a subject
   * string or `{ subject, facts: [{ predicate, object, negated? }] }`; given
   * facts are written first as the caller's claims. `record: true` keeps each
   * decided verdict as a Derivation. Resolves to `{ ok, rules, disabled,
   * members: [{ member, truth, clauses, failing, missing, derivationUuid }], factsWritten }`.
   */
  check_rules({ rule_uuids, members, record, provenance } = {}) {
    if (!Array.isArray(rule_uuids) || !rule_uuids.length) throw new Error('rule_uuids is required');
    if (!Array.isArray(members) || !members.length) throw new Error('members is required');
    return this._request('POST', `${this.prototypeApiPrefix}/logic-ir/rules/check`, {
      json: withoutNulls({ ruleUuids: rule_uuids, members, record: record === true ? true : null, provenance })
    });
  }

  /**
   * Fire one rule over its domain: one Derivation per member the antecedent
   * holds for. Resolves to `{ ok, rule, domain, fired, skipped, conflicts, complete }`.
   */
  apply_rule(rule_uuid, { domain_limit } = {}) {
    if (!rule_uuid) throw new Error('rule_uuid is required');
    return this._request('POST', `${this.prototypeApiPrefix}/logic-ir/rules/${encodeURIComponent(rule_uuid)}/apply`, {
      json: withoutNulls({ domainLimit: domain_limit })
    });
  }

  /**
   * KG4b / KG-P2: bind a graph pattern. A term is "?var", a uuid, or (KG-P2)
   * `{ label, prototype }` / `{ prototype }` / `{ value, valuePrototype }`,
   * resolved by structure to the one readable uuid (ambiguous → 409 with
   * `err.body.candidates`; nothing is guessed or created). `describe: true`
   * adds each variable's literal `value` and each claim's provenance:
   *
   *   bind_pattern({ pattern: [{ subject: { label: 'Avery Example', prototype: 'Person' },
   *                              predicate: 'email', object: '?e' }], describe: true })
   *
   * Resolves to `{ ok, bindings: [{ vars, constraints }], count, complete, resolved }`.
   */
  bind_pattern({ pattern, limit = null, describe = false } = {}) {
    if (!Array.isArray(pattern) || !pattern.length) throw new Error('pattern is required');
    return this._request('POST', `${this.prototypeApiPrefix}/logic-ir/bind`, {
      json: withoutNulls({ pattern, limit, describe: describe === true ? true : null })
    });
  }

  /**
   * KA4 / KG-P2: the transitive closure of one relation over the caller's
   * visible claims. Each fact names the claims on its path and (KA4b) its rule
   * (`closure.base` / `closure.extend`). Resolves to
   * `{ ok, edges, facts, conflicts, complete, excluded, ... }`.
   *
   * KA4b (server 0.2.61+): `exclude_claims: [uuid]` re-runs with those claims
   * read as absent ("what would change this"; `excluded.dropped` counts them);
   * `describe: true` adds `claimsById` (tier, support, status, source,
   * provenance, validity) and entity `labels`. An edge with a live opposing
   * claim comes back `contested: true` with `opposing: [uuid]`.
   */
  close_relation({ predicate, as = null, include_alleged = false, max_facts = null, max_rounds = null, edge_limit = null, exclude_claims = null, describe = false } = {}) {
    if (!predicate) throw new Error('predicate is required');
    return this._request('POST', `${this.prototypeApiPrefix}/logic-ir/closure`, {
      json: withoutNulls({ predicate, as, includeAlleged: include_alleged === true ? true : null, maxFacts: max_facts, maxRounds: max_rounds, edgeLimit: edge_limit, ...proofViewFields(exclude_claims, describe) })
    });
  }

  /**
   * KA4 / KG-P2: rules over binary relations with joins (`[{ name, ir }]`),
   * run to a fixpoint in memory; nothing is written. Conclusions explain back
   * to claim uuids. KA4b: `exclude_claims` and `describe` as on `close_relation`.
   */
  evaluate_joins({ rules, include_alleged = false, max_facts = null, max_rounds = null, edge_limit = null, exclude_claims = null, describe = false } = {}) {
    if (!Array.isArray(rules) || !rules.length) throw new Error('rules is required');
    return this._request('POST', `${this.prototypeApiPrefix}/logic-ir/joins`, {
      json: withoutNulls({ rules, includeAlleged: include_alleged === true ? true : null, maxFacts: max_facts, maxRounds: max_rounds, edgeLimit: edge_limit, ...proofViewFields(exclude_claims, describe) })
    });
  }

  /** KG-P2 / PR1: the Predicate concept for `name` (created once), `{ uuid, name, created }`. */
  ensure_predicate({ name, create = true } = {}) {
    if (!name) throw new Error('name is required');
    return this._request('POST', `${this.prototypeApiPrefix}/predicates`, {
      json: withoutNulls({ name, create: create === false ? false : null })
    });
  }

  /**
   * KG12: is `subject` a member of `category`, and how typical is it — two
   * answers kept apart. Resolves to `{ verdict: 'member'|'candidate'|'none',
   * membership, typicality }`.
   */
  check_membership({ subject, category, candidate_threshold = null } = {}) {
    if (!subject || !category) throw new Error('subject and category are required');
    return this._request('POST', `${this.prototypeApiPrefix}/prototypes/membership`, {
      json: withoutNulls({ subject, category, candidateThreshold: candidate_threshold })
    });
  }

  /** Run the enabled rules (or the named ones) to a fixpoint, within the given bounds. */
  saturate_rules({ rule_uuids, max_rounds, max_facts, domain_limit } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/logic-ir/fixpoint`, {
      json: withoutNulls({ ruleUuids: rule_uuids, maxRounds: max_rounds, maxFacts: max_facts, domainLimit: domain_limit })
    });
  }

  // ===== Events & episodes (KG10 / KG13) =====
  // An event is an action concept plus typed roles, each a concept uuid the
  // graph already has. Roles: agent, patient, beneficiary, instrument,
  // location, threat.

  /**
   * Record an event. `episode` is `{ uuid }` to extend one or `{ title,
   * observedAt, source }` to open one. Resolves to `{ ok, event, created,
   * reused, lineageKey, episode? }`; a role naming no concept is a 422 error
   * with `err.body.unresolved`.
   */
  record_event({ action, roles, title, observed_at, episode, provenance, private: isPrivate } = {}) {
    if (!action) throw new Error('action is required');
    return this._request('POST', `${this.prototypeApiPrefix}/events`, {
      json: withoutNulls({
        action,
        roles,
        title,
        observedAt: observed_at,
        episode,
        provenance,
        private: typeof isPrivate === 'boolean' ? isPrivate : null
      })
    });
  }

  /**
   * Find events by structure: each role given (as a concept uuid) is a
   * constraint; the answer is their intersection. Resolves to `{ ok,
   * constraints, walked, events, count, complete, limit }`.
   */
  find_events({ action, agent, patient, beneficiary, instrument, location, threat, limit } = {}) {
    const constraints = withoutNulls({ action, agent, patient, beneficiary, instrument, location, threat });
    if (!Object.keys(constraints).length) {
      throw new Error('find_events needs at least one role constraint (action, agent, patient, beneficiary, instrument, location, threat)');
    }
    return this._request('GET', `${this.prototypeApiPrefix}/events`, {
      params: { ...constraints, limit }
    });
  }

  /** One event with its roles, provenance and the episodes that contain it. */
  get_event(uuid) {
    if (!uuid) throw new Error('uuid is required');
    return this._request('GET', `${this.prototypeApiPrefix}/events/${encodeURIComponent(uuid)}`);
  }

  /** One episode with every event it contains. */
  get_episode(uuid) {
    if (!uuid) throw new Error('uuid is required');
    return this._request('GET', `${this.prototypeApiPrefix}/episodes/${encodeURIComponent(uuid)}`);
  }

  /**
   * Recall the episodes whose events satisfy a structural pattern (triples
   * over variables and concept uuids, with optional fuzzy roles). Each match
   * says why: bindings, derivation steps, fuzzy scores. Resolves to `{ ok,
   * episodes: [{ episode, matches, ranking }], events, count, complete }`.
   */
  recall_episodes({ pattern, event_variable, limit } = {}) {
    if (!pattern) throw new Error('pattern is required');
    return this._request('POST', `${this.prototypeApiPrefix}/episodes/recall`, {
      json: withoutNulls({ pattern, eventVariable: event_variable, limit })
    });
  }

  // ===== Procedure runs (verified memory) =====

  /**
   * Record one run of a procedure. `ok` is required; `verified_by` names who
   * confirmed the outcome: `'page' | 'person' | 'tool' | 'oracle' | 'email' |
   * 'api'` (only person, oracle, email and api count as independent in the
   * evaluation record). `version_uuid` or `version` names the procedure
   * version that ran (default: the current one); `held_out: true` marks a
   * held-out validation case. The server applies the lifecycle (draft →
   * verified → retired / revived) and the IR-S1 `state` (candidate →
   * validated → promoted | retired). Resolves to `{ ok, run, status, state,
   * previousStatus, retired, revived, procedure }`. Only the procedure's owner
   * may record its runs (403 otherwise); a version not of this procedure is a 400.
   */
  record_procedure_run(procedure_uuid, { ok, verified_by, failure, site, evidence, version_uuid, version, held_out } = {}) {
    if (!procedure_uuid) throw new Error('procedure_uuid is required');
    if (typeof ok !== 'boolean') throw new Error('ok (boolean) is required');
    if (version != null && (!Number.isInteger(version) || version < 1)) throw new Error('version must be a positive integer');
    return this._request('POST', `${this.prototypeApiPrefix}/procedures/${encodeURIComponent(procedure_uuid)}/runs`, {
      json: withoutNulls({
        ok,
        verifiedBy: verified_by,
        failure,
        site,
        evidence,
        versionUuid: version_uuid,
        version,
        heldOut: held_out === true ? true : null
      })
    });
  }

  /**
   * A procedure's runs (oldest first), lifecycle `status`, IR-S1 `state`, and
   * `currentVersion: { uuid, version, state, stateBasis }` (null when the
   * procedure has no versions). The server has no separate runs route; this
   * reads `GET /procedures/:uuid` and returns `{ procedureId, status, state,
   * currentVersion, lifecycle, runs }`. Each run names the version it ran
   * (`versionUuid`, `version`) when it was recorded with one.
   */
  list_procedure_runs(procedure_uuid) {
    if (!procedure_uuid) throw new Error('procedure_uuid is required');
    return this._request('GET', `${this.prototypeApiPrefix}/procedures/${encodeURIComponent(procedure_uuid)}`)
      .then((r) => ({
        procedureId: r.id ?? procedure_uuid,
        status: r.status ?? null,
        state: r.state ?? null,
        currentVersion: r.lifecycle?.currentVersion ?? r.currentVersion ?? null,
        lifecycle: r.lifecycle ?? null,
        runs: r.runs || []
      }));
  }

  /**
   * The procedure's evaluation record, computed on read: per version (newest
   * first) `stats: { runs, verifiedSuccesses, failures, unverified,
   * verifiedBy, lastRunAt, successRate, interval }` (Wilson 95%), `regression`
   * against the previous version (one-sided Fisher exact, flagged at p < 0.05;
   * `tested: false` when either side has no runs), `state` and `stateBasis`.
   * Resolves to `{ ok, procedureId, procedure, versions, regression,
   * unattributed, method }`.
   */
  get_procedure_evaluation(procedure_uuid) {
    if (!procedure_uuid) throw new Error('procedure_uuid is required');
    return this._request('GET', `${this.prototypeApiPrefix}/procedures/${encodeURIComponent(procedure_uuid)}/evaluation`);
  }

  /**
   * Verified procedural recall: semantic on `goal`, exact on `site`, verified
   * procedures only unless `include` names `'drafts' | 'retired' | 'all'` (or a
   * list). Each result carries `status`, `state` and, when the procedure has
   * versions, `currentVersion`. Resolves to `{ ok, query, results, excluded,
   * scanned }`. Distinct from `search_procedures` (POST, by meaning only).
   */
  search_verified_procedures({ goal, site, include, limit } = {}) {
    if (!goal && !site) throw new Error('goal or site is required');
    const inc = Array.isArray(include) ? include.join(',') : include;
    return this._request('GET', `${this.prototypeApiPrefix}/procedures/search`, {
      params: { goal, site, include: inc, limit }
    });
  }

  // ===== Procedure versions (capability model) =====
  // Every version read carries `state` (candidate | validated | promoted |
  // retired), computed from the runs of that version, with `stateBasis`
  // ('runs' | 'superseded' | 'status'), `statusAsState`, `lifecycle` and
  // `statusDeprecated: true`. The hand-set `status` (draft, dogfood, tested,
  // validated, stable, degraded, deprecated) is still returned and still
  // writable; it now decides only a retirement by hand (degraded/deprecated).

  /** Publish the next version of a procedure. Resolves to `{ ok, procedureVersion, capabilityResolution }`. */
  create_procedure_version(procedure_uuid, { status, implementation, requires, provides, provenance } = {}) {
    if (!procedure_uuid) throw new Error('procedure_uuid is required');
    return this._request('POST', `${this.prototypeApiPrefix}/procedures/${encodeURIComponent(procedure_uuid)}/versions`, {
      json: withoutNulls({ status, implementation, requires, provides, provenance })
    });
  }

  /** Every version, latest first, each with its `state`: `{ ok, procedureId, count, latest, versions, unattributedRuns }`. */
  list_procedure_versions(procedure_uuid) {
    if (!procedure_uuid) throw new Error('procedure_uuid is required');
    return this._request('GET', `${this.prototypeApiPrefix}/procedures/${encodeURIComponent(procedure_uuid)}/versions`);
  }

  /** One version by its number: `{ ok, procedureVersion }`. */
  get_procedure_version_by_number(procedure_uuid, version) {
    if (!procedure_uuid) throw new Error('procedure_uuid is required');
    if (!Number.isInteger(version) || version < 1) throw new Error('version must be a positive integer');
    return this._request('GET', `${this.prototypeApiPrefix}/procedures/${encodeURIComponent(procedure_uuid)}/versions/${version}`);
  }

  /** One version by its uuid, with its status history: `{ ok, procedureVersion }`. */
  get_procedure_version(version_uuid) {
    if (!version_uuid) throw new Error('version_uuid is required');
    return this._request('GET', `${this.prototypeApiPrefix}/procedure-versions/${encodeURIComponent(version_uuid)}`);
  }

  /**
   * Move a version to another hand-set status, recorded in its history. The
   * status is deprecated: `state` is computed from runs, and only degraded or
   * deprecated retire a version by hand.
   * Resolves to `{ ok, procedureVersion, transition }`; 409 `status_terminal`
   * out of deprecated, 409 `status_unchanged` for the same status.
   */
  transition_procedure_version(version_uuid, { status, reason, provenance } = {}) {
    if (!version_uuid) throw new Error('version_uuid is required');
    if (!status) throw new Error('status is required');
    return this._request('POST', `${this.prototypeApiPrefix}/procedure-versions/${encodeURIComponent(version_uuid)}/status`, {
      json: withoutNulls({ status, reason, provenance })
    });
  }

  // ===== Verified facts =====
  // Facts with status `candidate | confirmed` and provenance. Reads return
  // confirmed facts unless `include` asks for more; a correction keeps the old
  // fact as `corrected`. Distinct from the legacy `store_fact` (status
  // 'verified', no lifecycle).

  /** Add a fact, a `candidate` unless told otherwise. Resolves to `{ ok, fact }`. */
  add_fact({ subject, predicate, obj, status = 'candidate', provenance, visibility, confidence } = {}) {
    if (!subject) throw new Error('subject is required');
    if (!predicate) throw new Error('predicate is required');
    if (obj === undefined || obj === null || obj === '') throw new Error('obj is required');
    return this._request('POST', `${this.prototypeApiPrefix}/facts`, {
      json: withoutNulls({ subject, predicate, object: obj, status, provenance, visibility, confidence })
    });
  }

  /**
   * Facts about a subject (or, with no subject, the caller's own). `include`:
   * `'candidates' | 'corrected' | 'disputed' | 'all'` or a list. Resolves to
   * `{ ok, facts, total, truncated, include }`.
   */
  list_facts({ subject, predicate, include, limit } = {}) {
    const inc = Array.isArray(include) ? include.join(',') : include;
    return this._request('GET', `${this.prototypeApiPrefix}/facts`, {
      params: { subject, predicate, include: inc, limit }
    });
  }

  /** One fact with its provenance and history: `{ ok, fact }`. */
  get_fact(fact_id) {
    if (!fact_id) throw new Error('fact_id is required');
    return this._request('GET', `${this.prototypeApiPrefix}/facts/${encodeURIComponent(fact_id)}`);
  }

  /**
   * A candidate fact becomes confirmed (idempotent on a confirmed one). `by`
   * names who confirmed it. 409 when the fact was corrected (confirm its
   * `replacedBy` instead); 403 when the caller is not its owner.
   */
  confirm_fact(fact_id, { by, provenance } = {}) {
    if (!fact_id) throw new Error('fact_id is required');
    return this._request('POST', `${this.prototypeApiPrefix}/facts/${encodeURIComponent(fact_id)}/confirm`, {
      json: withoutNulls({ by, provenance })
    });
  }

  /** Write a corrected value as a new confirmed fact; the old one is kept as `corrected`. `{ ok, fact, corrected }`. */
  correct_fact(fact_id, { obj, provenance } = {}) {
    if (!fact_id) throw new Error('fact_id is required');
    if (obj === undefined || obj === null || obj === '') throw new Error('obj is required');
    return this._request('POST', `${this.prototypeApiPrefix}/facts/${encodeURIComponent(fact_id)}/correct`, {
      json: withoutNulls({ object: obj, provenance })
    });
  }

  // ===== Knowledge packs (PK1; needs a server newer than 0.2.59) =====
  /**
   * Export a chosen set of prototypes (uuid or name), procedures and facts as
   * one `ksg-pack/1`: a file with a name, a semver version, a license, a
   * source and provenance on every item. Returns `{ ok, pack, summary }`; the
   * `pack` is what you save or hand to `install_pack`. Read-only.
   *
   * `name`, `version` and `license` are required (there is no default
   * license). Name the items as `prototypes` / `procedures` / `facts`, or
   * pass `select: { prototypes, procedures, facts }` yourself.
   *
   * An item you may not read answers as a missing one (404) and fails the
   * whole export. Your own private items are held back: the server answers
   * 400 and lists them unless you pass `include_private: true`. That is an
   * explicit opt-in, off by default, and only the literal `true` turns it
   * on; use it only when the owner has said those items may leave their
   * scope. Secret-shaped values are redacted on the way out
   * (`summary.redactions`); read a pack before you publish it.
   */
  export_pack({
    name, version, license,
    description = null, source = null,
    prototypes = null, procedures = null, facts = null, select = null,
    include_private = false
  } = {}) {
    if (!name) throw new Error('name is required');
    if (!version) throw new Error('version is required (semver, for example 1.0.0)');
    if (!license) throw new Error('license is required (for example CC-BY-4.0)');
    const chosen = withoutNulls({
      prototypes: prototypes ?? select?.prototypes ?? null,
      procedures: procedures ?? select?.procedures ?? null,
      facts: facts ?? select?.facts ?? null
    });
    if (!Object.values(chosen).some((list) => Array.isArray(list) && list.length > 0)) {
      throw new Error('name at least one prototype, procedure or fact to export');
    }
    return this._request('POST', '/api2.0/packs/export', {
      json: {
        ...withoutNulls({ name, version, license, description, source }),
        select: chosen,
        ...(include_private === true ? { includePrivate: true } : {})
      }
    });
  }

  /**
   * Install a `ksg-pack/1` (the object `export_pack` returned as `pack`, or
   * the file's JSON text) into the caller's own scope. Needs an owner token.
   * `dry_run: true` returns the plan and writes nothing; run it first.
   *
   * A pack grants no trust. Installed procedures are your private candidates
   * with no runs: do not recall them as trusted until a verified run is
   * recorded. Installed facts are third-party candidates that keep what the
   * pack stated under `provenance`; only `confirm_fact` makes one confirmed.
   * The same pack again changes nothing; a newer version supersedes what it
   * replaces and deletes nothing; the same version with other contents, or
   * an older version, is 409. Returns `{ ok, dryRun, pack, previous, counts,
   * prototypes, procedures, facts, superseded, kept, warnings, redactions }`.
   */
  install_pack(pack, { dry_run = false } = {}) {
    let body = pack;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = null; }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('pack is required: a ksg-pack/1 object or its JSON text');
    }
    return this._request('POST', '/api2.0/packs/install', {
      json: { pack: body, ...(dry_run === true ? { dryRun: true } : {}) }
    });
  }

  // ===== Nodes with Documents =====
  /**
   * Create a node with an attached document.
   *
   * `private` exists because this wrapper previously had no way to express
   * privacy at all, so everything written through it — every episodic
   * conversation turn and tool call — landed in the anonymously-readable
   * commons. Pass `private: true` for anything owner-scoped; the owner comes
   * from `defaultOwnerUserId` (sent as `X-KSG-Owner`) unless overridden here.
   *
   * The server refuses a private write it cannot attribute, so a private node
   * is never silently stored as unreadable.
   */
  async create_node_with_document({
    label,
    summary = null,
    tags = [],
    metadata = {},
    associations = [],
    prototypeUuid = null,
    private: isPrivate = false,
    securityClass = null,
    ownerUserId = null,
    agentSessionId = null
  }) {
    const out = await this._request('POST', '/api/nodes', {
      json: {
        label,
        summary,
        tags,
        metadata,
        associations,
        prototypeUuid,
        ...(isPrivate || securityClass === 'private' ? { private: true } : {}),
        ...(securityClass ? { securityClass } : {}),
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(agentSessionId ? { agentSessionId } : {})
      }
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
  /**
   * State a claim. `security_class` (`'public'` | `'private'`; `scope` is an
   * alias) is sent as `securityClass` only when given, so the body of a call
   * that leaves it out is unchanged. A private claim is stored under the
   * caller's owner identity and read back only by that owner; the value is
   * passed through as typed and validated by the server.
   */
  create_assertion({
    subject = null,
    predicate = null,
    obj,
    truth = 1.0,
    source = 'user',
    strength = null,
    vote_score = null,
    source_rel = null,
    status = null,
    prev_assertion_id = null,
    provenance = null,
    security_class = null,
    scope = null,
    // KG-P1: name any term by uuid and the claim is written as a proposition
    // (three ConceptObject uuids). Leave them out and the call is unchanged.
    subject_uuid = null,
    predicate_uuid = null,
    object_uuid = null
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
        provenance,
        ...(subject_uuid ? { subjectUuid: subject_uuid } : {}),
        ...(predicate_uuid ? { predicateUuid: predicate_uuid } : {}),
        ...(object_uuid ? { objectUuid: object_uuid } : {}),
        ...securityClassField(security_class, scope)
      }
    });
  }

  /**
   * KG-P1: write a claim as a proposition whose subject, predicate and object
   * are ConceptObject uuids. Each term may be given as a uuid or a surface form:
   *
   *   assert_proposition({ subject: 'Avery Example', subject_prototype: 'Person',
   *                        predicate: 'email', value: 'avery@example.test',
   *                        scope: 'private', provenance: { statedBy: 'owner' } })
   *
   * The subject is found by structure (label + prototype + scope) or created as
   * an instance of `subject_prototype`; the predicate is a `Predicate` concept;
   * a literal `value` becomes a value node (EmailAddress, PhoneNumber, … under
   * Value); `object` + `object_prototype` resolves an entity instead. Two
   * instances bearing one label reject with 409 (`err.body.candidates`) and
   * nothing is written — pass `subject_uuid` to choose. `replace: true` marks
   * the live claims for this subject+predicate superseded (never deleted).
   * Resolves to `{ ok, reused, claim, subject, predicate, object, superseded }`.
   */
  assert_proposition({
    subject = null,
    subject_uuid = null,
    subject_prototype = null,
    predicate = null,
    predicate_uuid = null,
    object = undefined,
    object_uuid = null,
    object_prototype = null,
    value = undefined,
    value_prototype = null,
    truth = null,
    source = null,
    provenance = null,
    replace = false,
    security_class = null,
    scope = null
  } = {}) {
    return this._request('POST', `${this.prototypeApiPrefix}/propositions`, {
      json: withoutNulls({
        subject,
        subjectUuid: subject_uuid,
        subjectPrototype: subject_prototype,
        predicate,
        predicateUuid: predicate_uuid,
        ...(object !== undefined ? { object } : {}),
        objectUuid: object_uuid,
        objectPrototype: object_prototype,
        ...(value !== undefined ? { value } : {}),
        valuePrototype: value_prototype,
        truth,
        source,
        provenance,
        replace: replace === true ? true : null,
        ...securityClassField(security_class, scope)
      })
    });
  }

  /**
   * Claims by subject / predicate / object, or one claim by `uuid`.
   * `why: true` (WHY1) gives each claim a `why` block: sources with tier and
   * speaker, version chain, contested peers, model or Logic IR rule, status
   * with the reason. Another owner's private claim is simply absent.
   */
  get_assertions({ subject = null, predicate = null, obj = undefined, uuid = null, why = false } = {}) {
    const params = {};
    if (subject !== null && subject !== undefined) params.subject = subject;
    if (predicate !== null && predicate !== undefined) params.predicate = predicate;
    if (obj !== undefined) params.object = obj;
    if (uuid) params.uuid = uuid;
    if (why === true) params.why = 'true';
    return this._request('GET', '/api/assertions', { params }).then(r => r.assertions);
  }

  /**
   * WHY1 / KSG-1: "why do we believe this?" for one claim. Returns the claim
   * with its `why` block (`sources`, `versions`, `contested`, `inference`,
   * `status: { state, stored, reason }`), or null when there is no such claim
   * the caller may read.
   */
  explain_claim(claim_uuid) {
    return this._request('GET', '/api2.0/assertions', { params: { uuid: claim_uuid, why: 'true' } })
      .then(r => (Array.isArray(r?.assertions) && r.assertions[0]) || null);
  }

  /**
   * WHY1 / KSG-2: the contradiction inbox — open contested sets the caller may
   * read (their own private ones and the public ones), each side with its
   * source and tier, highest tier first. Returns `{ contradictions, total,
   * truncated }`. Resolve one with `confirm_fact(side_uuid)` (keep that side)
   * or `correct_fact(side_uuid, { obj })` (another value): a new version
   * supersedes every side; nothing is deleted.
   */
  list_contradictions({ visibility = null, limit = null } = {}) {
    const params = { contested: 'true' };
    if (visibility) params.visibility = visibility;
    if (limit !== null && limit !== undefined) params.limit = limit;
    return this._request('GET', '/api2.0/assertions', { params });
  }

  vote_assertion(assertion_id, { delta = 1 } = {}) {
    return this._request('POST', `/api/assertions/${encodeURIComponent(assertion_id)}/vote`, {
      json: { delta }
    }).then(r => r.assertion);
  }

  /**
   * Same claim from another speaker → strengthen belief (voteScore + speakers).
   * `security_class` / `scope` as on `create_assertion`: a private reinforce
   * bumps the caller's own private claim, never another owner's.
   */
  reinforce_assertion({
    subject,
    predicate,
    obj,
    speaker = null,
    delta = null,
    truth = null,
    source = 'user',
    provenance = null,
    security_class = null,
    scope = null
  } = {}) {
    // Optional fields are omitted, not sent as null: the server validates
    // `truth` as a number in [0, 1] and a literal null fails that check, which
    // turned every reinforce/contradict call that left `truth` out into a 500.
    // The Python client already omits them; this matches it.
    return this._request('POST', '/api/assertions/reinforce', {
      json: withoutNulls({
        subject,
        predicate,
        object: obj,
        speaker,
        delta,
        truth,
        source,
        provenance,
        ...securityClassField(security_class, scope)
      })
    });
  }

  /**
   * Competing claim for same subject/predicate (keeps prior evidence).
   * `security_class` / `scope` as on `create_assertion`.
   */
  contradict_assertion({
    subject,
    predicate,
    obj,
    speaker = null,
    truth = null,
    source = 'user',
    provenance = null,
    against_assertion_id = null,
    security_class = null,
    scope = null
  } = {}) {
    return this._request('POST', '/api/assertions/contradict', {
      json: withoutNulls({
        subject,
        predicate,
        object: obj,
        speaker,
        truth,
        source,
        provenance,
        againstAssertionId: against_assertion_id,
        ...securityClassField(security_class, scope)
      })
    });
  }

  retract_assertion(assertion_id, { speaker = null, reason = null } = {}) {
    return this._request('POST', `/api/assertions/${encodeURIComponent(assertion_id)}/retract`, {
      json: { speaker, reason }
    });
  }

  /** Live belief snapshot: resolved values + alternatives + speakers. */
  get_beliefs(entity_id, { predicate = null } = {}) {
    return this._request('GET', `/api/entities/${encodeURIComponent(entity_id)}/beliefs`, {
      params: { predicate }
    });
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
   * Hydrate an entity as a duck-typed `KSGObject` in one round trip.
   *
   *   const person = await client.hydrate(uuid);
   *   person.middleName          // synchronous, no await
   *   'middleName' in person     // true
   *   person.type()              // strongest prototype match
   *   person.explain('city')     // which prototype supplied it, and rivals
   *   person.as('Employee').role // read through a weaker match
   *
   * One call rather than two because member access cannot await: see KSGObject.
   * This never persists prototype membership — use `get_entity_types(id, {
   * persist: true })` when you actually mean to stamp it.
   */
  async hydrate(entity_id, { topK = 5, threshold = 0, entityApiPrefix = null } = {}) {
    const prefix = entityApiPrefix || this.prototypeApiPrefix || '/api2.0';
    const body = await this._request(
      'GET',
      `${prefix}/entities/${encodeURIComponent(entity_id)}/hydrate`,
      { params: { topK, threshold } },
    );
    return new KSGObject({ uuid: entity_id, ...body });
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
    category_lineage_key = null,
    hard_constraints = null,
    soft_constraints = null,
    min_score = null,
    decision_policy = null
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
        categoryLineageKey: category_lineage_key,
        hardConstraints: hard_constraints,
        softConstraints: soft_constraints,
        minScore: min_score,
        decisionPolicy: decision_policy
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

  get_object(uuid, {
    owner_user_id = null,
    agent_session_id = null,
    match_prototypes = false,
    prototype_revision_uuid = null,
    prototype_revision_uuids = null,
    infer = false
  } = {}) {
    const params = {
      ownerUserId: owner_user_id ?? this.defaultOwnerUserId,
      agentSessionId: agent_session_id ?? this.defaultAgentSessionId
    };
    if (match_prototypes) params.matchPrototypes = true;
    if (prototype_revision_uuid) params.prototypeRevisionUuid = prototype_revision_uuid;
    if (Array.isArray(prototype_revision_uuids) && prototype_revision_uuids.length > 0) {
      params.prototypeRevisionUuids = prototype_revision_uuids.join(',');
    } else if (typeof prototype_revision_uuids === 'string' && prototype_revision_uuids) {
      params.prototypeRevisionUuids = prototype_revision_uuids;
    }
    if (infer) params.infer = true;
    return this._request('GET', `/api/objects/${encodeURIComponent(uuid)}`, {
      params,
      owner_user_id,
      agent_session_id
    });
  }

  /**
   * Role catalog for typed memory (`mandate` / `schedule` / `rule` / `procedureDag`).
   * Canonical `/api2.0/memory/roles` with `/api` alias via `prototypeApiPrefix`.
   */
  list_memory_roles({ memory_api_prefix = null } = {}) {
    const prefix = memory_api_prefix || this.prototypeApiPrefix || '/api2.0';
    return this._request('GET', `${prefix}/memory/roles`).then((r) => r.roles || []);
  }

  /**
   * Role-typed create: maps `role` → category + parent, then the same write path
   * as `upsert_object`. Returns claims + prototype lineage.
   */
  instantiate_memory({
    role,
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
    private: is_private = null,
    owner_user_id = null,
    agent_session_id = null,
    memory_api_prefix = null
  } = {}) {
    const prefix = memory_api_prefix || this.prototypeApiPrefix || '/api2.0';
    return this._request('POST', `${prefix}/memory/instantiate`, {
      json: {
        role,
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
      },
      owner_user_id,
      agent_session_id
    });
  }

  /**
   * Object snapshot + assertion claims + prototype lineage walk.
   * Same ACL as `get_object`.
   */
  get_memory_object(uuid, {
    owner_user_id = null,
    agent_session_id = null,
    memory_api_prefix = null
  } = {}) {
    const prefix = memory_api_prefix || this.prototypeApiPrefix || '/api2.0';
    return this._request('GET', `${prefix}/memory/${encodeURIComponent(uuid)}`, {
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

  /**
   * Resolve the head of an object lineage by lineage key or title.
   *
   * `evidence` is `{ propertyName: value }` (a string, or a concept uuid for a
   * `concept_ref` property). When several objects bear the same title the
   * server answers `409 { status: 'ambiguous', candidates }` rather than pick
   * the newest; evidence narrows it to the individual whose current values
   * fit, and evidence that fits nobody is `404 { status: 'none' }`.
   */
  resolve_object({
    object_lineage_key = null,
    category_prototype_uuid = null,
    title = null,
    private: is_private = false,
    owner_user_id = null,
    agent_session_id = null,
    evidence = null
  } = {}) {
    return this._request('POST', '/api/objects/resolve', {
      json: {
        objectLineageKey: object_lineage_key,
        categoryPrototypeUuid: category_prototype_uuid,
        title,
        private: is_private,
        ownerUserId: owner_user_id,
        agentSessionId: agent_session_id,
        ...(evidence && typeof evidence === 'object' ? { evidence } : {})
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
  /**
   * Every procedure the caller may read, newest first. A complete listing
   * (`total`, `truncated`), unlike `search_procedures`, which is a top-K by
   * meaning. Resolves to `{ procedures, total, truncated }`.
   */
  list_procedures({ limit = 100, owner_user_id = null, agent_session_id = null } = {}) {
    return this._request('GET', '/api/procedures', {
      params: { limit },
      owner_user_id,
      agent_session_id
    }).then((r) => ({ procedures: r.procedures || [], total: r.total ?? (r.procedures || []).length, truncated: r.truncated === true }));
  }

  create_procedure({ title, description = '', steps = [], dependencies = [], guards, extra_props, dag_json } = {}) {
    return this._request('POST', '/api/procedures', {
      json: {
        title,
        description,
        steps,
        dependencies,
        guards,
        extraProps: extra_props,
        ...(dag_json != null ? { dagJson: dag_json } : {})
      }
    });
  }

  /**
   * Get a Procedure DAG.
   * @param {string} uuid
   * @param {{ source?: 'dagJson'|'graph'|'both' }} [opts]
   *   A/B load: dagJson (canonical JSON SoT), graph (edge compile), both (default; primary prefers dagJson).
   */
  get_procedure(uuid, { source } = {}) {
    const params = {};
    if (source != null && source !== '') params.source = source;
    return this._request('GET', `/api/procedures/${encodeURIComponent(uuid)}`, { params });
  }

  /**
   * Update canonical dagJson (source of truth). Optionally rematerializes next→ edges.
   */
  put_procedure_dag(uuid, { dag_json, rematerialize = true, provenance = null } = {}) {
    if (!dag_json || typeof dag_json !== 'object') {
      throw new Error('dag_json object is required for put_procedure_dag');
    }
    return this._request('PUT', `/api/procedures/${encodeURIComponent(uuid)}/dag`, {
      json: {
        dagJson: dag_json,
        rematerialize,
        provenance
      }
    });
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

  search_procedures(query, { top_k = 5, include = 'verified' } = {}) {
    // KSG-L1: only verified (replayable) procedures unless the caller opts in
    // with include: 'drafts' | 'retired' | 'all' (or a list). Each hit carries
    // its lifecycle `status`.
    const inc = Array.isArray(include) ? include.join(',') : (include || 'verified');
    return this._request('POST', '/api/procedures/search', {
      json: { query, topK: top_k, include: inc }
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
   *
   * CM1: with `where`, a typed question instead of a fuzzy one — the instances
   * of a category whose stored claims satisfy constraints:
   *
   *   search_knowledge({ where: { type: 'Requirement',
   *     all: [{ predicate: 'portal', op: 'eq', value: 'Contoso Supplier Portal' }],
   *     not: [{ predicate: 'form_code', op: 'starts_with', value: 'W-8' }] } })
   *
   * Operators: eq, in, starts_with, contains, gt, gte, lt, lte, exists; groups
   * all / any / not / knownNot / excludeKnown nest. Each constraint is true,
   * false or unknown per candidate (not(unknown) is unknown; a candidate or
   * model-inferred claim never matches). `results` holds only candidates known
   * to satisfy every constraint, each with `match` (constraints, claim ids,
   * tiers, a ranking score that is not a probability). Candidates that are
   * unknown on a constraint come back apart in `unknown`: never report those,
   * or the nearest text hit, as a match. `where.outcome` is `matched`,
   * `unknown_only` or `none`. With `where`, `query` is optional and only ranks;
   * `semantic_fallback: true` also proposes what resembles the query, flagged.
   * Without `where` the call and its result are unchanged.
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
    where = null,
    semantic_fallback = false,
    max_candidates = null,
    explain = true,
  } = {}) {
    const prefix = knowledgeApiPrefix || this.prototypeApiPrefix || '/api2.0';
    if (where && typeof where === 'object') {
      return this._request('POST', `${prefix}/knowledge/search`, {
        json: {
          ...(query !== undefined && query !== null ? { query } : {}),
          topK: top_k,
          similarityThreshold: similarity_threshold,
          where,
          ...(semantic_fallback === true ? { semanticFallback: true } : {}),
          ...(max_candidates != null ? { maxCandidates: max_candidates } : {}),
          ...(explain === false ? { explain: false } : {}),
        },
        owner_user_id,
        agent_session_id,
      }).then((r) => ({
        ok: r.ok !== false,
        query: r.query ?? query ?? null,
        count: r.count ?? (r.results || []).length,
        results: r.results || [],
        unknown: r.unknown || [],
        where: r.where || null,
      }));
    }
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

  /**
   * Ingest a chat utterance into the semantic graph (MemoryEvent + claims).
   * Canonical `/api2.0/semantic/remember` with `/api` alias via prototypeApiPrefix.
   * Pass `plan` when the agent already extracted entities/claims; otherwise the
   * server runs its heuristic (or fixture) extractor.
   */
  semantic_remember({
    text,
    speaker = 'user',
    source = 'conversation',
    owner_user_id = null,
    agent_session_id = null,
    session_id = null,
    is_private = true,
    plan = null,
    provenance = null,
    semanticApiPrefix = null,
  } = {}) {
    const prefix = semanticApiPrefix || this.prototypeApiPrefix || '/api2.0';
    return this._request('POST', `${prefix}/semantic/remember`, {
      json: {
        text,
        speaker,
        source,
        ownerUserId: owner_user_id,
        agentSessionId: agent_session_id,
        sessionId: session_id,
        private: is_private,
        plan,
        provenance,
      },
      owner_user_id,
      agent_session_id,
    });
  }

  semantic_recall({
    query,
    top_k = 8,
    expand_depth = 1,
    similarity_threshold = 0.15,
    owner_user_id = null,
    agent_session_id = null,
    semanticApiPrefix = null,
  } = {}) {
    const prefix = semanticApiPrefix || this.prototypeApiPrefix || '/api2.0';
    return this._request('POST', `${prefix}/semantic/recall`, {
      json: {
        query,
        topK: top_k,
        expandDepth: expand_depth,
        similarityThreshold: similarity_threshold,
        ownerUserId: owner_user_id,
      },
      owner_user_id,
      agent_session_id,
    });
  }

  semantic_ask({
    subject,
    predicate,
    object = undefined,
    pattern = null,
    owner_user_id = null,
    agent_session_id = null,
    semanticApiPrefix = null,
  } = {}) {
    const prefix = semanticApiPrefix || this.prototypeApiPrefix || '/api2.0';
    return this._request('POST', `${prefix}/semantic/ask`, {
      json: pattern || { subject, predicate, object, ownerUserId: owner_user_id },
      owner_user_id,
      agent_session_id,
    });
  }

  /**
   * Verify an answer claim by claim against stored claims
   * (`POST /api2.0/verify/answer`, knowshowgo >= 0.2.23). The caller decomposes
   * the answer into `claims: [{ subject, predicate, object }]`; the server runs
   * no LLM. Each claim comes back `supported`, `contradicted`, `disputed`,
   * `competing` (with the stored values) or `unknown`, with evidence, plus a
   * `verdict` for the whole answer. `record: true` remembers only the claims
   * the graph did not speak against, under `owner_user_id`, at the `inferred`
   * provenance tier.
   */
  verify_answer({
    claims,
    text = undefined,
    argument = undefined,
    record = undefined,
    agent = undefined,
    owner_user_id = null,
    agent_session_id = null,
    semanticApiPrefix = null,
  } = {}) {
    if (!Array.isArray(claims)) throw new Error('verify_answer requires claims[]');
    const prefix = semanticApiPrefix || this.prototypeApiPrefix || '/api2.0';
    return this._request('POST', `${prefix}/verify/answer`, {
      json: {
        claims,
        ...(text !== undefined ? { text } : {}),
        ...(argument !== undefined ? { argument } : {}),
        ...(record !== undefined ? { record } : {}),
        ...(agent !== undefined ? { agent } : {}),
        ownerUserId: owner_user_id,
      },
      owner_user_id,
      agent_session_id,
    });
  }

  /**
   * Ground a claim's terms, or one term, to concepts
   * (`POST /api2.0/ground`, knowshowgo >= 0.2.24). Pass `claim: { subject,
   * predicate, object }` or `term` + `role` (`entity` | `class` | `predicate`).
   * Each term comes back `resolved` (uuid, label, `definedness`), `ambiguous`
   * (`candidates[]`: ask the person which one), `undefined` (nothing readable
   * names it; nothing is created) or `literal`; the predicate in canonical
   * form (`is a` → `is_a`). `mentions` are concept uuids already in the
   * conversation, a discourse cue. Reads only.
   */
  ground({
    claim = undefined,
    term = undefined,
    role = undefined,
    mentions = undefined,
    owner_user_id = null,
    agent_session_id = null,
    semanticApiPrefix = null,
  } = {}) {
    if (!claim && !term) throw new Error('ground requires claim {subject, predicate, object} or term');
    const prefix = semanticApiPrefix || this.prototypeApiPrefix || '/api2.0';
    return this._request('POST', `${prefix}/ground`, {
      json: {
        ...(claim ? { claim } : { term, ...(role ? { role } : {}) }),
        ...(mentions !== undefined ? { mentions } : {}),
        ownerUserId: owner_user_id,
      },
      owner_user_id,
      agent_session_id,
    });
  }

  semantic_correct({
    text,
    speaker = 'user',
    source = 'correction',
    owner_user_id = null,
    agent_session_id = null,
    session_id = null,
    is_private = true,
    plan = null,
    provenance = null,
    semanticApiPrefix = null,
  } = {}) {
    const prefix = semanticApiPrefix || this.prototypeApiPrefix || '/api2.0';
    return this._request('POST', `${prefix}/semantic/correct`, {
      json: {
        text,
        speaker,
        source,
        ownerUserId: owner_user_id,
        agentSessionId: agent_session_id,
        sessionId: session_id,
        private: is_private,
        plan,
        provenance,
      },
      owner_user_id,
      agent_session_id,
    });
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
  query_graph({ search, traverse, match_prototypes = false, prototype_revision_uuids = null } = {}) {
    return this._request('POST', '/api/query', {
      json: {
        search,
        traverse,
        matchPrototypes: match_prototypes || undefined,
        prototypeRevisionUuids: prototype_revision_uuids || undefined
      }
    });
  }

  // ===== Seeds =====
  seed_osl_agent(body = {}) {
    return this._request('POST', '/api/seed/osl-agent', { json: body });
  }

  seed_osl_oc_agent(body = {}) {
    return this._request('POST', '/api/seed/osl-oc-agent', { json: body });
  }

  seed_openclaw_agent(body = {}) {
    return this._request('POST', '/api/seed/openclaw-agent', { json: body });
  }

  seed_social_layer({ api_prefix = '/api2.0' } = {}) {
    const prefix = String(api_prefix || '/api2.0').replace(/\/+$/, '') || '/api2.0';
    return this._request('POST', `${prefix}/seed/social-layer`, { json: {} });
  }

  seed_logic_ir_primitives({ api_prefix = '/api2.0' } = {}) {
    const prefix = String(api_prefix || '/api2.0').replace(/\/+$/, '') || '/api2.0';
    return this._request('POST', `${prefix}/seed/logic-ir-primitives`, { json: {} });
  }

  /**
   * The seeded Logic IR prototypes as `{ name: uuid }`, **without seeding**.
   *
   * Seeding is the only way to learn these uuids today, and seeding is a
   * write. On a deployment that sets `KSG_REQUIRE_WRITE_TOKEN=1` — which
   * `docs/PUBLIC-API.md` says is on for the public API — that write is
   * refused without write credentials, so a read-only caller cannot obtain
   * the uuids at all. This reads them off `GET /api/object-categories`
   * instead, which the write gate does not cover.
   *
   * (Re-seeding is otherwise cheap: it is idempotent, and an unchanged spec
   * does not bump a category's version. The cost this avoids is the write
   * itself and the ten upserts behind it, not version churn.)
   *
   * Rows are selected by their `category:logic-ir:` lineage key rather than by
   * name, so a caller's own category also called `Concept` is never mistaken
   * for the primitive. The listing collapses to the head version per lineage,
   * so these are the current revisions.
   *
   * @returns {Promise<Record<string, string>>} `{ Concept: uuid, … }`; empty
   *   when nothing has been seeded yet — seed once, then call this.
   */
  async logic_ir_prototypes() {
    const categories = await this.list_object_categories();
    const prototypes = {};
    for (const row of categories || []) {
      const lineage = String(row?.categoryLineageKey || '');
      if (!lineage.startsWith(LOGIC_IR_LINEAGE_PREFIX) || !row?.uuid) continue;
      const name = row?.name || logicIrNameFromLineage(lineage);
      if (name) prototypes[name] = row.uuid;
    }
    return prototypes;
  }

  /** camelCase alias of {@link logic_ir_prototypes}. */
  logicIrPrototypes() {
    return this.logic_ir_prototypes();
  }

  seed_procedure_run_primitives({ api_prefix = '/api2.0' } = {}) {
    const prefix = String(api_prefix || '/api2.0').replace(/\/+$/, '') || '/api2.0';
    return this._request('POST', `${prefix}/seed/procedure-run-primitives`, { json: {} });
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

