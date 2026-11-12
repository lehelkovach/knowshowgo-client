// CS1 — the methods added so every agent-facing server route has a client call,
// and the per-owner view (`for_owner`) that sends an owner's token on any call.
//
// Mocked transport. Each request shape is the one the server reads; the file
// next to each test is where to look in the knowshowgo repo. Fake data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadClientClass() {
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return mod.KnowShowGoClient;
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

async function recordingClient(options = {}) {
  const KnowShowGoClient = await loadClientClass();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    return jsonResponse({ ok: true });
  };
  const client = new KnowShowGoClient({ baseUrl: 'https://ksg.example.test', fetchImpl, ...options });
  return { client, calls };
}

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const last = (calls) => calls[calls.length - 1];
const route = (call) => `${call.method} ${call.url.pathname}`;

// src/server/articles-routes.js — TB2 articles, typed values, fields.
test('search_articles reads GET /articles with q, range and limit', async () => {
  const { client, calls } = await recordingClient();
  await client.search_articles({ query: 'Contoso', range: ['Organization', 'Place'], limit: 5 });
  assert.equal(route(last(calls)), 'GET /api2.0/articles');
  assert.equal(last(calls).url.searchParams.get('q'), 'Contoso');
  assert.equal(last(calls).url.searchParams.get('range'), 'Organization,Place');
  assert.equal(last(calls).url.searchParams.get('limit'), '5');
});

test('create_article posts prototype, title, fields and source', async () => {
  const { client, calls } = await recordingClient();
  await client.create_article({
    prototype_uuid: U(1), title: 'Contoso', description: 'A fictional company.',
    fields: [{ predicate: 'website', valueType: 'url', value: 'https://contoso.example.test' }],
    source_url: 'https://example.test/contoso'
  });
  assert.equal(route(last(calls)), 'POST /api2.0/articles');
  assert.deepEqual(last(calls).body, {
    prototypeUuid: U(1), title: 'Contoso', description: 'A fictional company.',
    fields: [{ predicate: 'website', valueType: 'url', value: 'https://contoso.example.test' }],
    sourceUrl: 'https://example.test/contoso'
  });
});

test('get_article reads one article by uuid', async () => {
  const { client, calls } = await recordingClient();
  await client.get_article(U(2));
  assert.equal(route(last(calls)), `GET /api2.0/articles/${U(2)}`);
});

test('amend_article posts a typed claim and the claim it replaces', async () => {
  const { client, calls } = await recordingClient();
  await client.amend_article(U(2), { predicate: 'founded', value_type: 'date', value: '2001-04-01', replaces_claim: U(3), source_url: 'https://example.test/history' });
  assert.equal(route(last(calls)), `POST /api2.0/articles/${U(2)}/claims`);
  assert.deepEqual(last(calls).body, { predicate: 'founded', valueType: 'date', value: '2001-04-01', replacesClaim: U(3), sourceUrl: 'https://example.test/history' });
});

test('list_value_types, search_predicates, declare_predicate, get_prototype_fields', async () => {
  const { client, calls } = await recordingClient();
  await client.list_value_types();
  assert.equal(route(last(calls)), 'GET /api2.0/value-types');
  await client.search_predicates({ query: 'web', limit: 3 });
  assert.equal(route(last(calls)), 'GET /api2.0/predicates');
  assert.equal(last(calls).url.searchParams.get('q'), 'web');
  await client.declare_predicate({ name: 'website', value_type: 'url', cardinality: 'many', attach_to: U(1) });
  assert.equal(route(last(calls)), 'POST /api2.0/predicates/declare');
  assert.deepEqual(last(calls).body, { name: 'website', valueType: 'url', cardinality: 'many', attachTo: U(1) });
  await client.get_prototype_fields(U(1));
  assert.equal(route(last(calls)), `GET /api2.0/prototypes/${U(1)}/fields`);
});

// src/server/taxonomy-routes.js — DH1.
test('get_taxonomy_duplicates reads GET /taxonomy/duplicates', async () => {
  const { client, calls } = await recordingClient();
  await client.get_taxonomy_duplicates();
  assert.equal(route(last(calls)), 'GET /api2.0/taxonomy/duplicates');
});

// src/server/rest-api.js — CE3d reconcile.
test('reconcile_inferred_propositions posts the label', async () => {
  const { client, calls } = await recordingClient();
  await client.reconcile_inferred_propositions({ label: 'Contoso' });
  assert.equal(route(last(calls)), 'POST /api2.0/propositions/reconcile');
  assert.deepEqual(last(calls).body, { label: 'Contoso' });
});

// src/server/rest-api.js — concept identity, merge, variants.
test('concept resolve, find-or-create, merge, unmerge, variants', async () => {
  const { client, calls } = await recordingClient();
  await client.resolve_concept({ label: 'Avery Example' });
  assert.equal(route(last(calls)), 'POST /api2.0/concepts/resolve');
  assert.equal(last(calls).body.label, 'Avery Example');
  await client.find_or_create_concept({ label: 'Avery Example', prototype_name: 'Person' });
  assert.equal(route(last(calls)), 'POST /api2.0/concepts/find-or-create');
  assert.equal(last(calls).body.prototypeName, 'Person');
  await client.merge_concepts({ survivor: U(1), members: [U(2)], reason: 'same person' });
  assert.equal(route(last(calls)), 'POST /api2.0/concepts/merge');
  assert.deepEqual(last(calls).body, { survivor: U(1), members: [U(2)], reason: 'same person' });
  await client.unmerge_concept(U(2), { reason: 'different people' });
  assert.equal(route(last(calls)), `POST /api2.0/concepts/${U(2)}/unmerge`);
  assert.deepEqual(last(calls).body, { reason: 'different people' });
  await client.get_concept_variants(U(1));
  assert.equal(route(last(calls)), `GET /api2.0/concepts/${U(1)}/variants`);
});

// src/server/rest-api.js — derivations, assimilation, hydration.
test('get_derivation and get_derivation_tree', async () => {
  const { client, calls } = await recordingClient();
  await client.get_derivation(U(4));
  assert.equal(route(last(calls)), `GET /api2.0/logic-ir/derivations/${U(4)}`);
  await client.get_derivation_tree(U(4), { max_depth: 3 });
  assert.equal(route(last(calls)), `GET /api2.0/logic-ir/derivations/${U(4)}/tree`);
  assert.equal(last(calls).url.searchParams.get('maxDepth'), '3');
});

test('assimilate_exemplar posts subject and category', async () => {
  const { client, calls } = await recordingClient();
  await client.assimilate_exemplar({ subject: U(5), category: 'Organization' });
  assert.equal(route(last(calls)), 'POST /api2.0/prototypes/assimilate');
  assert.deepEqual(last(calls).body, { subject: U(5), category: 'Organization' });
});

test('hydrate_entity reads the one-trip payload with topK and threshold', async () => {
  const { client, calls } = await recordingClient();
  await client.hydrate_entity(U(5), { top_k: 3, threshold: 0.4 });
  assert.equal(route(last(calls)), `GET /api2.0/entities/${U(5)}/hydrate`);
  assert.equal(last(calls).url.searchParams.get('topK'), '3');
  assert.equal(last(calls).url.searchParams.get('threshold'), '0.4');
});

// KT1 — one client, many owners: each owner's token on each call.
test('for_owner sends that owner token on any method and leaves the parent client alone', async () => {
  const { client, calls } = await recordingClient({ authToken: 'ksg_service_token_fake' });
  const avery = client.for_owner({ auth_token: 'ksg_avery_token_fake', owner_user_id: 'avery' });
  await avery.get_article(U(2));
  assert.equal(last(calls).headers.authorization, 'Bearer ksg_avery_token_fake');
  assert.equal(last(calls).headers['x-ksg-owner'], 'avery');
  await avery.search_procedures('order lunch');
  assert.equal(last(calls).headers.authorization, 'Bearer ksg_avery_token_fake');
  await client.get_article(U(2));
  assert.equal(last(calls).headers.authorization, 'Bearer ksg_service_token_fake');
  assert.equal(last(calls).headers['x-ksg-owner'], undefined);
});

test('a 401 from the token gate comes back as an error naming the status', async () => {
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({
    baseUrl: 'https://ksg.example.test',
    fetchImpl: async () => jsonResponse({ ok: false, error: 'token required' }, 401)
  });
  await assert.rejects(() => client.get_article(U(2)), (err) => /401/.test(String(err.message)) || err.status === 401);
});
