// Dynamic object materializer.
//
// Turns a KSG object + its prototype into a live JavaScript object whose
// PROPERTIES come from the object's stored data and whose METHODS come from the
// procedures the prototype is linked to in KSG. Nothing is hardcoded: property
// names are the object's own property names, and method names are derived from
// the linked procedures' titles. Point it at a different prototype (or rename a
// procedure in KSG) and the shape of the materialized object follows.
//
// Additive: this module does not touch the client class behavior.

const DEFAULT_PROCEDURE_PREDICATE = 'has_procedure';

// Camel-case a human procedure title into a JS-friendly method name.
// "Send Welcome Email" -> "sendWelcomeEmail".
export function toMethodName(title) {
  const parts = String(title == null ? '' : title)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  return parts
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
}

// Best-effort coercion of a stored string value into a JS primitive using the
// prototype's declared type. Unknown types pass through unchanged.
export function coerceValue(value, valueType) {
  if (value == null) return value;
  const t = String(valueType || '').toLowerCase();
  if (t === 'number' || t === 'integer' || t === 'int' || t === 'float' || t === 'decimal') {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (t === 'boolean' || t === 'bool') {
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true';
  }
  if (t === 'json' || t === 'object' || t === 'array') {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

// Normalize the many shapes get_object() responses can take into a flat
// { name: { value, valueType } } map.
function extractProperties(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const byName = payload.propertiesByName;
  if (byName && typeof byName === 'object' && !Array.isArray(byName)) {
    const out = {};
    for (const [name, def] of Object.entries(byName)) {
      if (def && typeof def === 'object') out[name] = { value: def.value, valueType: def.valueType || def.type };
      else out[name] = { value: def, valueType: undefined };
    }
    return out;
  }
  const arr = payload.properties;
  if (Array.isArray(arr)) {
    const out = {};
    for (const p of arr) {
      if (!p) continue;
      const name = p.name || p.propertyName || p.key;
      if (!name) continue;
      out[name] = { value: p.value, valueType: p.valueType || p.type };
    }
    return out;
  }
  return {};
}

function getProcedureTitle(compiled, fallback) {
  if (!compiled || typeof compiled !== 'object') return fallback;
  return (
    (compiled.procedure && (compiled.procedure.title || (compiled.procedure.props && compiled.procedure.props.title))) ||
    compiled.title ||
    fallback
  );
}

// Default prototype -> procedures discovery via KSG assertions:
// (subject = prototypeUuid, predicate = has_procedure, object = procedureUuid).
async function defaultDiscoverProcedures(client, prototypeUuid, predicate) {
  if (!prototypeUuid || typeof client.get_assertions !== 'function') return [];
  const links = (await client.get_assertions({ subject: prototypeUuid, predicate })) || [];
  const procs = [];
  for (const a of links) {
    const uuid = a && (a.object != null ? a.object : a.obj);
    if (!uuid) continue;
    let title = uuid;
    if (typeof client.get_procedure === 'function') {
      try {
        title = getProcedureTitle(await client.get_procedure(uuid), uuid);
      } catch {
        /* fall back to uuid */
      }
    }
    procs.push({ uuid, title });
  }
  return procs;
}

/**
 * Materialize a KSG object into a live JS object.
 *
 * @param {object} client - a KSG client instance
 * @param {string} objectUuid
 * @param {object} [opts]
 * @param {(ctx: {procedureUuid: string, title: string, object: object, args: object}) => Promise<any>} [opts.runProcedure]
 *        Optional runner. If omitted, calling a method returns the compiled
 *        procedure plan bound to the object instead of executing it.
 * @param {(client, prototypeUuid) => Promise<Array<{uuid: string, title?: string}>>} [opts.discoverProcedures]
 *        Optional override for how procedures are discovered for the prototype.
 * @param {string} [opts.procedureLinkPredicate='has_procedure']
 * @returns {Promise<object>} live object with properties + procedure-backed methods.
 */
export async function materializeObject(client, objectUuid, opts = {}) {
  const {
    runProcedure = null,
    discoverProcedures = null,
    procedureLinkPredicate = DEFAULT_PROCEDURE_PREDICATE,
  } = opts;

  const payload = await client.get_object(objectUuid);
  const object = (payload && payload.object) || {};
  const properties = extractProperties(payload);

  const instance = {};
  for (const [name, def] of Object.entries(properties)) {
    instance[name] = coerceValue(def.value, def.valueType);
  }

  const prototypeUuid = object.categoryPrototypeUuid || object.prototypeUuid || null;

  // Non-enumerable KSG metadata so it doesn't pollute property iteration.
  Object.defineProperty(instance, '__ksg', {
    enumerable: false,
    value: { uuid: object.uuid || objectUuid, title: object.title, prototypeUuid, raw: payload },
  });

  let procedures = [];
  if (prototypeUuid) {
    procedures =
      typeof discoverProcedures === 'function'
        ? (await discoverProcedures(client, prototypeUuid)) || []
        : await defaultDiscoverProcedures(client, prototypeUuid, procedureLinkPredicate);
  }

  const boundMethods = {};
  for (const p of procedures) {
    if (!p || !p.uuid) continue;
    const method = toMethodName(p.title || p.uuid);
    if (!method || method in instance || boundMethods[method]) continue;
    boundMethods[method] = { uuid: p.uuid, title: p.title || method };
    Object.defineProperty(instance, method, {
      enumerable: false,
      value: async (args = {}) => {
        if (typeof runProcedure === 'function') {
          return runProcedure({ procedureUuid: p.uuid, title: p.title || method, object: instance, args });
        }
        let compiled = null;
        if (typeof client.get_procedure === 'function') compiled = await client.get_procedure(p.uuid);
        return {
          ok: true,
          procedure: p.title || method,
          procedureUuid: p.uuid,
          boundTo: instance.__ksg.uuid,
          compiled,
          args,
        };
      },
    });
  }

  // Introspection helper: which method maps to which KSG procedure.
  Object.defineProperty(instance, '__methods', { enumerable: false, value: boundMethods });

  return instance;
}

export default materializeObject;
