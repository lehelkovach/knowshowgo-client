import test from 'node:test';
import assert from 'node:assert/strict';
import { KnowShowGoClient } from '../src/index.js';

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
    calls.push({
      url,
      method: init.method,
      body: init.body ? JSON.parse(init.body) : undefined
    });

    if (url.includes('/snapshot')) return jsonResponse({ snapshot: { label: 'current' } });
    if (url.includes('/evidence')) return jsonResponse({ evidence: [{ predicate: 'label' }] });
    if (url.includes('/procedures/search')) return jsonResponse({ results: [{ uuid: 'proc-1' }] });
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
  assert.deepEqual(await client.snapshot('object/1'), { label: 'current' });
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

