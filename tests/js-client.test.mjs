import test from 'node:test';
import assert from 'node:assert/strict';
import { KSGObject, KnowShowGoClient } from '../src/index.js';

function jsonResponse(payload, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

function createMockFetch() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    calls.push({
      url,
      method: init.method,
      body: init.body ? JSON.parse(init.body) : undefined
    });

    if (path === '/api/objects/resolve') {
      return jsonResponse({
        ok: true,
        selectedObjectUuid: 'object-1',
        object: { uuid: 'object-1', title: 'David Bowie' },
        snapshot: { name: 'David Bowie', status: 'draft' }
      });
    }
    if (path.includes('/snapshot')) return jsonResponse({ snapshot: { label: 'current', status: 'verified' } });
    if (path.includes('/evidence')) return jsonResponse({ evidence: [{ predicate: 'label' }] });
    if (path.includes('/explain')) return jsonResponse({ entityId: 'object-1', predicate: parsed.searchParams.get('predicate') });
    if (path === '/api/assertions' && init.method === 'GET') return jsonResponse({ assertions: [{ predicate: 'status' }] });
    if (path === '/api/assertions' && init.method === 'POST') return jsonResponse({ id: 'assert-1', ...JSON.parse(init.body) });
    if (path === '/api/associations') return jsonResponse({ success: true });
    if (path.includes('/procedures/search')) return jsonResponse({ results: [{ uuid: 'proc-1' }] });
    if (path === '/api/concept-objects/suggest') return jsonResponse({ candidates: [{ uuid: 'object-1' }] });
    if (path === '/api/concept-objects/search') return jsonResponse({ results: [{ uuid: 'object-2' }] });
    return jsonResponse({ ok: true, uuid: 'uuid-1' });
  };
  return { calls, fetchImpl };
}

test('new JS client methods map to current KSG dev API routes', async () => {
  const { calls, fetchImpl } = createMockFetch();
  const client = new KnowShowGoClient({ baseUrl: 'http://ksg.test/', fetchImpl });

  await client.resolveTag({ phrase: '#[Machine Learning]', topK: 3, createIfMissing: true });
  await client.suggest({ text: 'machin learn', context: { app: 'test' }, createTagIfMissing: true });
  await client.createTopic({ label: 'Machine Learning', aliases: ['ML'] });
  await client.getTopic('topic/1');
  await client.createCategory({ name: 'Person', properties: [{ name: 'birthDate', type: 'date' }] });
  await client.getCategory('cat/1');
  await client.upsertObject({
    categoryName: 'Person',
    title: 'David Bowie',
    tags: ['#[david bowie]'],
    properties: [{ name: 'sameAs', type: 'url', value: 'https://example.test/bowie' }]
  });
  await client.getObject('object/1');
  await client.resolveObject({ title: 'David Bowie', categoryPrototypeUuid: 'cat-1' });
  assert.deepEqual(await client.snapshot('object/1'), { label: 'current', status: 'verified' });
  assert.deepEqual(await client.evidence('object/1', { predicate: 'label' }), [{ predicate: 'label' }]);
  await client.createProcedure({ title: 'Login', steps: [{ title: 'Open site' }] });
  await client.getProcedure('proc/1');
  await client.insertProcedureStep('proc/1', { title: 'Submit', afterStepUuid: 'step-1' });
  await client.generalizeProcedure('proc/1', { title: 'Generic login', mode: 'schema_only' });
  assert.deepEqual(await client.searchProcedures('login', { topK: 2 }), [{ uuid: 'proc-1' }]);
  await client.searchConceptObjects('david bowie', { topK: 4 });

  assert.deepEqual(
    calls.map((call) => [call.method, new URL(call.url).pathname]),
    [
      ['POST', '/api/topics/resolve-tag'],
      ['POST', '/api/concept-objects/suggest'],
      ['POST', '/api/topics'],
      ['GET', '/api/topics/topic%2F1'],
      ['POST', '/api/object-categories'],
      ['GET', '/api/object-categories/cat%2F1'],
      ['POST', '/api/objects/upsert'],
      ['GET', '/api/objects/object%2F1'],
      ['POST', '/api/objects/resolve'],
      ['GET', '/api/entities/object%2F1/snapshot'],
      ['GET', '/api/entities/object%2F1/evidence'],
      ['POST', '/api/procedures'],
      ['GET', '/api/procedures/proc%2F1'],
      ['POST', '/api/procedures/proc%2F1/steps'],
      ['POST', '/api/procedures/proc%2F1/generalize'],
      ['POST', '/api/procedures/search'],
      ['POST', '/api/concept-objects/search']
    ]
  );

  assert.equal(calls[0].body.phrase, '#[Machine Learning]');
  assert.equal(calls[0].body.topK, 3);
  assert.equal(calls[1].body.createTagIfMissing, true);
  assert.equal(calls[6].body.properties[0].name, 'sameAs');
  assert.equal(calls[8].body.title, 'David Bowie');
  assert.equal(new URL(calls[10].url).searchParams.get('predicate'), 'label');
  assert.equal(calls[13].body.afterStepUuid, 'step-1');
  assert.equal(calls[15].body.topK, 2);
  assert.equal(calls[16].body.query, 'david bowie');
});

test('KSGObject exposes snapshot-backed properties and blocks destructive mutation', async () => {
  const { calls, fetchImpl } = createMockFetch();
  const client = new KnowShowGoClient({ baseUrl: 'http://ksg.test/', fetchImpl });
  const object = client.object('object/1');

  assert.ok(object instanceof KSGObject);
  assert.equal(object.$id, 'object/1');
  assert.equal(await object.label, 'current');
  assert.equal(await object.status, 'verified');
  assert.equal(await object.$get('status'), 'verified');

  assert.throws(() => {
    object.status = 'deleted';
  }, /snapshot-backed and read-only/);
  assert.throws(() => {
    delete object.status;
  }, /snapshot-backed and read-only/);
  assert.throws(() => {
    Object.defineProperty(object, 'status', { value: 'deleted' });
  }, /snapshot-backed and read-only/);

  assert.deepEqual(
    calls.map((call) => [call.method, new URL(call.url).pathname]),
    [['GET', '/api/entities/object%2F1/snapshot']]
  );
});

test('KSGObject explicit async methods use append-only server endpoints', async () => {
  const { calls, fetchImpl } = createMockFetch();
  const client = new KnowShowGoClient({ baseUrl: 'http://ksg.test/', fetchImpl });
  const object = client.object({ title: 'David Bowie', categoryPrototypeUuid: 'cat-1' });

  const resolved = await object.$resolve();
  assert.equal(resolved, object);
  assert.equal(object.$id, 'object-1');
  assert.equal(await object.name, 'David Bowie');

  await object.$assert('status', 'verified', { source: 'unit-test', truth: 0.9 });
  await object.$associate({ uuid: 'object-2' }, 'influenced_by', { strength: 0.5 });
  assert.deepEqual(await object.$query({ predicate: 'status' }), [{ predicate: 'status' }]);
  assert.deepEqual(await object.$explain('status'), { entityId: 'object-1', predicate: 'status' });
  assert.deepEqual(await object.$match('bowie', { topK: 2 }), { candidates: [{ uuid: 'object-1' }] });
  assert.deepEqual(await object.$similar('glam rock', { topK: 2 }), { results: [{ uuid: 'object-2' }] });

  assert.deepEqual(
    calls.map((call) => [call.method, new URL(call.url).pathname]),
    [
      ['POST', '/api/objects/resolve'],
      ['POST', '/api/assertions'],
      ['POST', '/api/associations'],
      ['GET', '/api/assertions'],
      ['GET', '/api/entities/object-1/explain'],
      ['POST', '/api/concept-objects/suggest'],
      ['POST', '/api/concept-objects/search']
    ]
  );

  assert.deepEqual(calls[0].body, {
    objectLineageKey: null,
    categoryPrototypeUuid: 'cat-1',
    title: 'David Bowie',
    private: false,
    ownerUserId: null,
    agentSessionId: null
  });
  assert.deepEqual(calls[1].body, {
    subject: 'object-1',
    predicate: 'status',
    object: 'verified',
    truth: 0.9,
    source: 'unit-test'
  });
  assert.deepEqual(calls[2].body, {
    fromConceptUuid: 'object-1',
    toConceptUuid: 'object-2',
    relationType: 'influenced_by',
    strength: 0.5
  });
  assert.equal(new URL(calls[3].url).searchParams.get('subject'), 'object-1');
  assert.equal(new URL(calls[3].url).searchParams.get('predicate'), 'status');
  assert.equal(new URL(calls[4].url).searchParams.get('predicate'), 'status');
  assert.deepEqual(calls[5].body.context, { subject: 'object-1' });
  assert.deepEqual(calls[6].body.context, { subject: 'object-1' });
});

test('client-level semantic helpers expose query and object resolution shortcuts', async () => {
  const { calls, fetchImpl } = createMockFetch();
  const client = new KnowShowGoClient({ baseUrl: 'http://ksg.test/', fetchImpl });

  const object = await client.$resolve({ title: 'David Bowie' });
  assert.equal(object.$id, 'object-1');
  assert.deepEqual(await client.$query('bowie', { topK: 1 }), { results: [{ uuid: 'object-2' }] });
  assert.deepEqual(await client.$query({ subject: 'object-1', predicate: 'status' }), [{ predicate: 'status' }]);
  assert.deepEqual(await client.$match('bowie'), { candidates: [{ uuid: 'object-1' }] });

  assert.deepEqual(
    calls.map((call) => [call.method, new URL(call.url).pathname]),
    [
      ['POST', '/api/objects/resolve'],
      ['POST', '/api/concept-objects/search'],
      ['GET', '/api/assertions'],
      ['POST', '/api/concept-objects/suggest']
    ]
  );
});

