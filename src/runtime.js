const RUNTIME = Symbol("noShogoRuntime");
const PROTOTYPE_DESCRIPTOR = Symbol("noShogoPrototypeDescriptor");

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const RUNTIME_KEYS = new Set(["uuid", "kind", "prototypeId", "matches", "metadata", "sourceConcept"]);

function safeAssign(target, source = {}) {
  for (const [key, value] of Object.entries(source)) {
    if (!UNSAFE_KEYS.has(key)) target[key] = value;
  }
  return target;
}

function defineHidden(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    configurable: true,
    enumerable: false,
    writable: true
  });
}

function getRuntime(concept) {
  const runtime = concept?.[RUNTIME];
  if (!runtime) throw new Error("Concept object is not attached to a NoShogoRuntime");
  return runtime;
}

function getDescriptor(prototypeObject) {
  return prototypeObject?.[PROTOTYPE_DESCRIPTOR] ?? null;
}

function readConceptProperties(record = {}) {
  if (record.jsonObj && typeof record.jsonObj === "object") return record.jsonObj;
  if (record.properties && typeof record.properties === "object") return record.properties;
  if (record.data && typeof record.data === "object") return record.data;
  return record;
}

function normalizeScore(score) {
  if (typeof score === "number" && Number.isFinite(score)) return score;
  if (score && typeof score === "object") {
    const value = score.score ?? score.probability ?? score.confidence ?? score.p;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeMatch(match) {
  if (!match || typeof match !== "object") return null;
  const prototypeId =
    match.prototypeId ??
    match.prototypeUuid ??
    match.prototype_uuid ??
    match.prototype ??
    match.kind ??
    match.name ??
    match.id;
  if (!prototypeId) return null;
  return {
    ...match,
    prototypeId,
    kind: match.kind ?? match.name ?? prototypeId,
    score: normalizeScore(match)
  };
}

function normalizeMatches(matches) {
  const list = Array.isArray(matches)
    ? matches
    : matches?.results ?? matches?.matches ?? matches?.prototypes ?? [];
  return list.map(normalizeMatch).filter(Boolean).sort((a, b) => b.score - a.score);
}

function ownSerializableEntries(concept) {
  return Object.entries(concept).filter(([key, value]) => (
    !UNSAFE_KEYS.has(key) &&
    !RUNTIME_KEYS.has(key) &&
    typeof value !== "function"
  ));
}

export function toPlainConcept(concept) {
  const plain = Object.create(null);
  for (const [key, value] of ownSerializableEntries(concept)) {
    plain[key] = value;
  }
  return plain;
}

export const NoShogoObject = {};

Object.defineProperties(NoShogoObject, {
  save: {
    enumerable: false,
    value: function save(options = {}) {
      return getRuntime(this).saveConcept(this, options);
    }
  },
  rematch: {
    enumerable: false,
    value: function rematch(options = {}) {
      return getRuntime(this).rematchConcept(this, options);
    }
  },
  as: {
    enumerable: false,
    value: function as(kind) {
      return getRuntime(this).castConcept(this, kind);
    }
  },
  is: {
    enumerable: false,
    value: function is(kind) {
      if (this.kind === kind) return true;
      return (this.matches ?? []).some((match) => match.kind === kind || match.prototypeId === kind);
    }
  },
  prototypeDescriptor: {
    enumerable: false,
    value: function prototypeDescriptor() {
      return getDescriptor(Object.getPrototypeOf(this));
    }
  }
});

export function NoShogoRuntime({ client = null, matcher = null } = {}) {
  this.client = client;
  this.matcher = matcher;
  this.rootPrototype = Object.create(NoShogoObject);
  this.prototypes = new Map();
  this.definePrototype("Object", {
    id: "Object",
    methods: {},
    metadata: { root: true }
  });
}

NoShogoRuntime.prototype.definePrototype = function definePrototype(name, definition = {}) {
  const id = definition.id ?? definition.uuid ?? name;
  const parentId = definition.parent ?? definition.parentId ?? "Object";
  const parentDescriptor = parentId === id ? null : this.getPrototype(parentId);
  const parentPrototype = parentDescriptor?.prototypeObject ?? this.rootPrototype;
  const prototypeObject = Object.create(parentPrototype);
  const descriptor = {
    id,
    uuid: definition.uuid ?? null,
    name,
    parent: parentDescriptor?.id ?? null,
    match: definition.match ?? null,
    defaults: definition.defaults ?? {},
    metadata: definition.metadata ?? {},
    prototypeObject
  };

  safeAssign(prototypeObject, definition.methods ?? {});
  defineHidden(prototypeObject, PROTOTYPE_DESCRIPTOR, descriptor);

  this.prototypes.set(id, descriptor);
  this.prototypes.set(name, descriptor);
  if (definition.uuid) this.prototypes.set(definition.uuid, descriptor);
  return descriptor;
};

NoShogoRuntime.prototype.getPrototype = function getPrototype(id) {
  return this.prototypes.get(id) ?? null;
};

NoShogoRuntime.prototype.hydrateConcept = function hydrateConcept(record = {}, options = {}) {
  const kind = options.kind ?? record.kind ?? record.prototypeName ?? record.prototypeUuid ?? record.prototypeId ?? "Object";
  const descriptor = this.getPrototype(kind) ?? this.getPrototype("Object");
  const concept = Object.create(descriptor.prototypeObject);
  const matches = normalizeMatches(options.matches ?? record.matches ?? record.prototypeMatches ?? record.matchMetadata);

  safeAssign(concept, descriptor.defaults);
  safeAssign(concept, readConceptProperties(record));
  concept.uuid = options.uuid ?? record.uuid ?? record.id ?? concept.uuid ?? null;
  concept.kind = descriptor.name;
  concept.prototypeId = descriptor.id;
  concept.matches = matches;
  concept.metadata = { ...(record.metadata ?? {}), ...(options.metadata ?? {}) };
  defineHidden(concept, RUNTIME, this);
  return concept;
};

NoShogoRuntime.prototype.scorePrototype = function scorePrototype(concept, descriptor) {
  if (descriptor.name === "Object") return 0;
  if (this.matcher) return normalizeScore(this.matcher(concept, descriptor));
  if (typeof descriptor.match === "function") return normalizeScore(descriptor.match(concept, descriptor));
  if (!descriptor.match || typeof descriptor.match !== "object") return 0;

  const required = descriptor.match.has ?? descriptor.match.properties ?? [];
  if (!required.length) return 0;
  const matched = required.filter((key) => concept[key] !== undefined && concept[key] !== null).length;
  return matched / required.length;
};

NoShogoRuntime.prototype.matchConceptLocally = function matchConceptLocally(concept) {
  const seen = new Set();
  const matches = [];

  for (const descriptor of this.prototypes.values()) {
    if (seen.has(descriptor.id)) continue;
    seen.add(descriptor.id);
    const score = this.scorePrototype(concept, descriptor);
    if (score > 0) {
      matches.push({
        prototypeId: descriptor.id,
        kind: descriptor.name,
        score,
        source: "local"
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
};

NoShogoRuntime.prototype.applyPrototype = function applyPrototype(concept, matchOrKind) {
  const match = typeof matchOrKind === "string" ? { prototypeId: matchOrKind, kind: matchOrKind } : matchOrKind;
  const descriptor = this.getPrototype(match?.prototypeId) ?? this.getPrototype(match?.kind) ?? this.getPrototype("Object");
  Object.setPrototypeOf(concept, descriptor.prototypeObject);
  concept.kind = descriptor.name;
  concept.prototypeId = descriptor.id;
  defineHidden(concept, RUNTIME, this);
  return concept;
};

NoShogoRuntime.prototype.rematchConcept = async function rematchConcept(concept, options = {}) {
  const remote = options.remote ?? Boolean(this.client?.fuzzyDuckTypeConcept);
  let matches = [];

  if (remote) {
    const remoteMatches = await this.client.fuzzyDuckTypeConcept(toPlainConcept(concept), options.matchOptions ?? {});
    matches = normalizeMatches(remoteMatches);
  }

  if (!matches.length) matches = this.matchConceptLocally(concept);
  concept.matches = matches;
  if (matches[0]) this.applyPrototype(concept, matches[0]);

  if (options.persist) await this.saveConcept(concept, options.saveOptions ?? {});
  return concept;
};

NoShogoRuntime.prototype.castConcept = function castConcept(concept, kind) {
  const descriptor = this.getPrototype(kind);
  if (!descriptor) throw new Error(`Unknown prototype: ${kind}`);
  const view = Object.create(descriptor.prototypeObject);
  safeAssign(view, toPlainConcept(concept));
  view.kind = descriptor.name;
  view.prototypeId = descriptor.id;
  view.matches = concept.matches ?? [];
  view.metadata = concept.metadata ?? {};
  defineHidden(view, RUNTIME, this);
  defineHidden(view, "sourceConcept", concept);
  return view;
};

NoShogoRuntime.prototype.saveConcept = async function saveConcept(concept, options = {}) {
  if (!this.client) throw new Error("No client configured for persistence");

  const payload = {
    jsonObj: toPlainConcept(concept),
    kind: concept.kind,
    prototypeId: concept.prototypeId,
    matches: concept.matches ?? [],
    metadata: concept.metadata ?? {}
  };

  if (concept.uuid && typeof this.client.upsertConcept === "function") {
    return this.client.upsertConcept(concept.uuid, payload);
  }

  if (typeof this.client.createConcept === "function") {
    const prototypeUuid = options.prototypeUuid ?? concept.prototypeId ?? concept.kind;
    const created = await this.client.createConcept({
      prototypeUuid,
      jsonObj: payload.jsonObj,
      metadata: {
        ...payload.metadata,
        kind: payload.kind,
        matches: payload.matches
      }
    });
    if (typeof created === "string") concept.uuid = created;
    return created;
  }

  throw new Error("Configured client does not expose concept persistence methods");
};

export function createNoShogoRuntime(options = {}) {
  return new NoShogoRuntime(options);
}
