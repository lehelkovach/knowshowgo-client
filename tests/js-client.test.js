import test from 'node:test';
import assert from 'node:assert/strict';
import { KnowShowGoClient } from '../js/client.js';

function makeFetch(calls) {
  return async (url, options) => {
    calls.push({ url: new URL(url), options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
      text: async () => ''
    };
  };
}

test('current KSG semantic API methods issue expected REST requests', async () => {
  const calls = [];
  const client = new KnowShowGoClient({
    baseUrl: 'https://ksg.example/',
    fetchImpl: makeFetch(calls)
  });

  const cases = [
    [() => client.create_topic({ label: 'Topic' }), 'POST', '/api/topics', { label: 'Topic' }],
    [() => client.get_topic('topic/id'), 'GET', '/api/topics/topic%2Fid'],
    [() => client.resolve_topic_tag({ phrase: '#[topic]' }), 'POST', '/api/topics/resolve-tag', { phrase: '#[topic]' }],
    [() => client.create_category({ name: 'Person' }), 'POST', '/api/object-categories', { name: 'Person' }],
    [() => client.upsert_category({ name: 'Person' }), 'POST', '/api/object-categories/upsert', { name: 'Person' }],
    [() => client.get_category('cat/id'), 'GET', '/api/object-categories/cat%2Fid'],
    [() => client.upsert_object({ title: 'Object' }), 'POST', '/api/objects/upsert', { title: 'Object' }],
    [() => client.get_object('obj/id', { ownerUserId: 'user-1' }), 'GET', '/api/objects/obj%2Fid', undefined, { ownerUserId: 'user-1' }],
    [() => client.resolve_object({ title: 'Object' }), 'POST', '/api/objects/resolve', { title: 'Object' }],
    [() => client.generalize_object({ sourceObjectUuid: 'obj-1' }), 'POST', '/api/objects/generalize', { sourceObjectUuid: 'obj-1' }],
    [() => client.suggest_concept_objects({ text: 'bike' }), 'POST', '/api/concept-objects/suggest', { text: 'bike' }],
    [() => client.search_concept_objects({ query: 'bike' }), 'POST', '/api/concept-objects/search', { query: 'bike' }],
    [() => client.suggest_prototypes({ properties: [{ name: 'color' }] }), 'POST', '/api/concept-objects/suggest-prototypes', { properties: [{ name: 'color' }] }],
    [() => client.create_composite({ title: 'Budget' }), 'POST', '/api/composites', { title: 'Budget' }],
    [() => client.get_composite('comp/id'), 'GET', '/api/composites/comp%2Fid'],
    [() => client.update_composite_component('comp/id', 'part/id', { title: 'Part' }), 'POST', '/api/composites/comp%2Fid/components/part%2Fid/update', { title: 'Part' }],
    [() => client.create_assertion({ subject: 's', predicate: 'p', object: 'o' }), 'POST', '/api/assertions', { subject: 's', predicate: 'p', object: 'o' }],
    [() => client.get_assertions({ subject: 's' }), 'GET', '/api/assertions', undefined, { subject: 's' }],
    [() => client.vote_assertion('assert/id', -1), 'POST', '/api/assertions/assert%2Fid/vote', { delta: -1 }],
    [() => client.get_snapshot('entity/id'), 'GET', '/api/entities/entity%2Fid/snapshot'],
    [() => client.get_evidence('entity/id', { predicate: 'definition' }), 'GET', '/api/entities/entity%2Fid/evidence', undefined, { predicate: 'definition' }],
    [() => client.explain_entity('entity/id', { predicate: 'definition' }), 'GET', '/api/entities/entity%2Fid/explain', undefined, { predicate: 'definition' }],
    [() => client.create_procedure({ title: 'Proc', steps: [] }), 'POST', '/api/procedures', { title: 'Proc', steps: [] }],
    [() => client.get_procedure('proc/id'), 'GET', '/api/procedures/proc%2Fid'],
    [() => client.insert_procedure_step('proc/id', { title: 'Step' }), 'POST', '/api/procedures/proc%2Fid/steps', { title: 'Step' }],
    [() => client.generalize_procedure('proc/id', { title: 'General Proc' }), 'POST', '/api/procedures/proc%2Fid/generalize', { title: 'General Proc' }],
    [() => client.import_procedure_json({ procedure: { steps: [{}] } }), 'POST', '/api/procedures/import-json', { procedure: { steps: [{}] } }],
    [() => client.repair_procedure_selector('proc/id', { stepUuid: 'step-1' }), 'POST', '/api/procedures/proc%2Fid/repair-selector', { stepUuid: 'step-1' }],
    [() => client.search_procedures('invoice', { topK: 3 }), 'POST', '/api/procedures/search', { query: 'invoice', topK: 3 }],
    [() => client.create_syllogism({ title: 'Syllogism' }), 'POST', '/api/logic/syllogisms', { title: 'Syllogism' }],
    [() => client.get_syllogism('logic/id'), 'GET', '/api/logic/syllogisms/logic%2Fid'],
    [() => client.register_market_match({ kind: 'offer' }), 'POST', '/api/market/matches/register', { kind: 'offer' }],
    [() => client.search_market_matches({ kind: 'want' }), 'POST', '/api/market/matches/search', { kind: 'want' }],
    [() => client.subscribe_channel({ channelTag: '#[x]' }), 'POST', '/api/channels/subscribe', { channelTag: '#[x]' }],
    [() => client.post_channel_message({ channelTag: '#[x]', message: 'hello' }), 'POST', '/api/channels/messages', { channelTag: '#[x]', message: 'hello' }],
    [() => client.get_channel_feed('actor-1'), 'GET', '/api/channels/feed', undefined, { actorId: 'actor-1' }],
    [() => client.create_repeating_event({ title: 'Standup' }), 'POST', '/api/events/repeating', { title: 'Standup' }],
    [() => client.rate_entity('obj/id', { actorId: 'a', value: 5 }), 'POST', '/api/ratings/obj%2Fid', { actorId: 'a', value: 5 }],
    [() => client.get_ratings('obj/id'), 'GET', '/api/ratings/obj%2Fid']
  ];

  for (const [invoke, method, path, body, query] of cases) {
    const before = calls.length;
    await invoke();
    const call = calls[before];
    assert.equal(call.options.method, method);
    assert.equal(call.url.pathname, path);
    assert.deepEqual(Object.fromEntries(call.url.searchParams), query || {});
    assert.equal(call.options.body, body === undefined ? undefined : JSON.stringify(body));
  }
});

test('non-2xx JSON responses throw with status and body', async () => {
  const client = new KnowShowGoClient({
    baseUrl: 'https://ksg.example',
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'bad request' }),
      text: async () => ''
    })
  });

  await assert.rejects(
    () => client.create_topic({}),
    (error) => {
      assert.equal(error.message, 'bad request');
      assert.equal(error.status, 400);
      assert.deepEqual(error.body, { error: 'bad request' });
      return true;
    }
  );
});

