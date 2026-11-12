// AC1: match_prototypes(object) — ranked prototypes with typicality and
// property-overlap evidence; public methods for concept lookup, CE3d stats and
// the TX1 taxonomy routes. Mocked transport, shapes copied from knowshowgo
// src/prototype/prototype_service.js (matchPrototypes) and
// src/prototype/taxonomy.js (taxonomyTree). Fake data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadModule() {
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const THING = U(1); const PERSON = U(2); const ORG = U(3); const LEGACY = U(9);

const prop = (name) => ({ uuid: null, name, schemaName: null, range: [], cardinality: 'many', comment: null, url: null, source: 'schema.org' });
const TREE = {
  ok: true,
  revision: 'taxonomy@0.1.0',
  root: { uuid: THING, name: 'Thing' },
  complete: true,
  nodes: [
    { uuid: THING, name: 'Thing', depth: 0, parents: [], children: [PERSON, ORG], properties: [prop('name'), prop('url'), prop('description')] },
    { uuid: PERSON, name: 'Person', depth: 1, parents: [THING], children: [], properties: [{ ...prop('birth_date'), schemaName: 'birthDate' }, { ...prop('works_for'), schemaName: 'worksFor' }, prop('nationality')] },
    { uuid: ORG, name: 'Organization', depth: 1, parents: [THING], children: [], properties: [prop('founding_date'), prop('employee'), prop('legal_name')] }
  ]
};

function router(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ method: init.method, path: u.pathname, search: u.search, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    const key = `${init.method} ${u.pathname}`;
    const r = routes[key];
    if (!r) return jsonResponse({ error: `no route ${key}` }, 404);
    const out = typeof r === 'function' ? r(calls[calls.length - 1]) : r;
    return Array.isArray(out) ? jsonResponse(out[0], out[1]) : jsonResponse(out);
  };
  return { calls, fetchImpl };
}

const MATCHES = {
  matches: [
    // The centroid ranks Organization a hair above Person for this text…
    { uuid: ORG, name: 'Organization', score: 0.61, centroidScore: 0.62, definitionScore: 0.55, exemplarCount: 30 },
    { uuid: PERSON, name: 'Person', score: 0.60, centroidScore: 0.59, definitionScore: 0.66, exemplarCount: 56 },
    // …and a prototype outside the schema.org tree has no property schema.
    { uuid: LEGACY, name: 'ProcedureRun', score: 0.40, centroidScore: 0.40, definitionScore: null, exemplarCount: 0 },
    // A per-property value prototype never classifies an object.
    { uuid: U(8), name: 'PropertyValue:city', score: 0.9, centroidScore: 0.9, propertyName: 'city', exemplarCount: 50 }
  ]
};

test('match_prototypes(object) embeds the object as text and returns typicality with property evidence', async () => {
  const { KnowShowGoClient } = await loadModule();
  const { calls, fetchImpl } = router({ 'POST /api2.0/prototypes/match': MATCHES, 'GET /api2.0/taxonomy': TREE });
  const client = new KnowShowGoClient({ baseUrl: 'https://ksg.example.test', fetchImpl });

  const object = { label: 'Avery Example', properties: { birthDate: '1990-04-02', works_for: 'Contoso', nationality: 'Utopia', favorite_color: 'teal' } };
  const ranked = await client.match_prototypes({ object, top_k: 3 });

  const match = calls.find((c) => c.path === '/api2.0/prototypes/match');
  assert.match(match.body.text, /Avery Example/);
  assert.match(match.body.text, /works for: Contoso/);
  // Evidence re-ranks a wider window than asked for, then cuts back to top_k.
  assert.equal(match.body.topK, 25);
  assert.equal(ranked.length, 3);

  // …but the object's properties are Person's, so Person ranks first.
  assert.deepEqual(ranked.map((r) => r.name), ['Person', 'Organization', 'ProcedureRun']);
  const person = ranked[0];
  assert.equal(person.typicality, 0.59);
  assert.equal(person.score, 0.60);
  assert.deepEqual(person.evidence.matched.sort(), ['birth_date', 'nationality', 'works_for']);
  assert.deepEqual(person.evidence.extra, ['favorite_color']);
  assert.equal(person.evidence.schema, true);
  assert.equal(person.evidence.overlap, 0.75);
  assert.ok(person.rankScore > ranked[1].rankScore);
  // Inherited properties count: Thing's `name` would match an object `name` key.
  assert.ok(person.evidence.known.includes('url'));
  assert.deepEqual(person.evidence.isA, ['Person', 'Thing']);

  const legacy = ranked[2];
  assert.equal(legacy.evidence.schema, false);
  assert.equal(legacy.evidence.overlap, null);
  // No schema to compare against counts as no overlap, not as a free pass.
  assert.equal(legacy.rankScore, 0.28);
  assert.ok(!ranked.some((r) => r.name.startsWith('PropertyValue:')));
});

test('match_prototypes caches the taxonomy so a second object costs one request', async () => {
  const { KnowShowGoClient } = await loadModule();
  const { calls, fetchImpl } = router({ 'POST /api2.0/prototypes/match': MATCHES, 'GET /api2.0/taxonomy': TREE });
  const client = new KnowShowGoClient({ baseUrl: 'https://ksg.example.test', fetchImpl });
  await client.match_prototypes({ object: { label: 'Avery Example', properties: { nationality: 'Utopia' } } });
  await client.match_prototypes({ object: { label: 'Contoso', properties: { legal_name: 'Contoso Ltd' } } });
  assert.equal(calls.filter((c) => c.path === '/api2.0/taxonomy').length, 1);
});

test('match_prototypes keeps working when the taxonomy is unavailable (scores only)', async () => {
  const { KnowShowGoClient } = await loadModule();
  const { fetchImpl } = router({ 'POST /api2.0/prototypes/match': MATCHES, 'GET /api2.0/taxonomy': [{ error: 'boom' }, 500] });
  const client = new KnowShowGoClient({ baseUrl: 'https://ksg.example.test', fetchImpl });
  const ranked = await client.match_prototypes({ object: { label: 'Avery Example', properties: { nationality: 'Utopia' } } });
  assert.deepEqual(ranked.map((r) => r.name), ['Organization', 'Person', 'ProcedureRun']);
  assert.deepEqual(ranked[0].evidence.isA, []);
  assert.equal(ranked[0].rankScore, 0.427);
  assert.equal(ranked[0].evidence.schema, false);
});

test('match_prototypes with text only is unchanged: no taxonomy call, no evidence', async () => {
  const { KnowShowGoClient } = await loadModule();
  const { calls, fetchImpl } = router({ 'POST /api2.0/prototypes/match': MATCHES });
  const client = new KnowShowGoClient({ baseUrl: 'https://ksg.example.test', fetchImpl });
  const out = await client.match_prototypes({ text: 'a person', top_k: 2 });
  assert.equal(calls[0].body.topK, 2);
  assert.equal(out[0].name, 'Organization');
  assert.equal(out[0].evidence, undefined);
  assert.equal(calls.length, 1);
});

test('objectToMatchText flattens plain-key objects and nested values', async () => {
  const { objectToMatchText } = await loadModule();
  const text = objectToMatchText({ name: 'Contoso', founding_date: '2001', employee: [{ label: 'Avery Example' }, 'Dana Example'], uuid: U(5) });
  assert.match(text, /^Contoso\./);
  assert.match(text, /founding date: 2001/);
  assert.match(text, /employee: Avery Example, Dana Example/);
  assert.doesNotMatch(text, /00000000/);
});

test('lookup_concept posts {term, context} to /api2.0/concepts/lookup', async () => {
  const { KnowShowGoClient } = await loadModule();
  const { calls, fetchImpl } = router({ 'POST /api2.0/concepts/lookup': { ok: true, concept: { uuid: U(7) } } });
  const client = new KnowShowGoClient({ baseUrl: 'https://ksg.example.test', fetchImpl, authToken: 'tok' });
  const out = await client.lookup_concept({ term: 'Contoso', context: 'company' });
  assert.equal(out.concept.uuid, U(7));
  assert.equal(calls[0].body.term, 'Contoso');
  assert.equal(calls[0].body.context, 'company');
  assert.equal(calls[0].headers.authorization, 'Bearer tok');
});

test('get_inferred_proposition_stats reads the CE3d counters', async () => {
  const { KnowShowGoClient } = await loadModule();
  const { calls, fetchImpl } = router({ 'GET /api2.0/propositions/inferred/stats': { proposed: 0, confirmed: 0 } });
  const client = new KnowShowGoClient({ baseUrl: 'https://ksg.example.test', fetchImpl });
  const out = await client.get_inferred_proposition_stats();
  assert.equal(out.proposed, 0);
  assert.equal(calls[0].method, 'GET');
});

test('taxonomy methods hit the TX1 routes', async () => {
  const { KnowShowGoClient } = await loadModule();
  const { calls, fetchImpl } = router({
    'GET /api2.0/taxonomy': TREE,
    [`GET /api2.0/taxonomy/prototypes/${PERSON}`]: { ok: true, prototype: { uuid: PERSON, name: 'Person' } },
    [`GET /api2.0/taxonomy/nodes/${U(5)}`]: { ok: true, node: { uuid: U(5) } }
  });
  const client = new KnowShowGoClient({ baseUrl: 'https://ksg.example.test', fetchImpl });
  assert.equal((await client.get_taxonomy({ root: 'Thing' })).root.name, 'Thing');
  assert.equal(calls[0].search, '?root=Thing');
  assert.equal((await client.get_taxonomy_prototype(PERSON)).prototype.name, 'Person');
  await client.get_taxonomy_node(U(5), { history: true });
  assert.equal(calls[2].search, '?history=1');
});
