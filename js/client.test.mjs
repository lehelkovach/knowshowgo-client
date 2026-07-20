import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadClientClass() {
  const sourcePath = new URL('./client.js', import.meta.url);
  const source = await readFile(sourcePath, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const mod = await import(moduleUrl);
  return mod.KnowShowGoClient;
}

function makeJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'application/json' : null;
      }
    },
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test('create_assertion maps payload fields to assertion endpoint', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ id: 'assertion-1' });
  };

  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });
  const result = await client.create_assertion({
    subject: 's1',
    predicate: 'status',
    obj: 'approved',
    vote_score: 2.5,
    prev_assertion_id: 'prev-1'
  });

  assert.equal(result.id, 'assertion-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/api/assertions');
  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.object, 'approved');
  assert.equal(body.voteScore, 2.5);
  assert.equal(body.prevAssertionId, 'prev-1');
});

test('get_assertions encodes query filters and unwraps assertions array', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ assertions: [{ id: 'a1' }] });
  };

  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });
  const assertions = await client.get_assertions({ subject: 'entity-1', obj: 'approved' });

  assert.equal(assertions[0].id, 'a1');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/assertions\?/);
  assert.match(calls[0].url, /subject=entity-1/);
  assert.match(calls[0].url, /object=approved/);
  assert.equal(calls[0].options.method, 'GET');
});

test('vote_assertion returns nested assertion payload', async () => {
  const fetchMock = async () => makeJsonResponse({ assertion: { id: 'a1', voteScore: 4 } });
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const assertion = await client.vote_assertion('a1', { delta: 3 });
  assert.equal(assertion.id, 'a1');
  assert.equal(assertion.voteScore, 4);
});

test('store_facts_bulk normalizes tuple-style and object-style facts', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ stored: 2 });
  };

  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });
  await client.store_facts_bulk([
    ['Bell', 'invented', 'telephone'],
    { subject: 'Curie', predicate: 'researched', obj: 'radioactivity' }
  ]);

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.facts.length, 2);
  assert.deepEqual(body.facts[0], { subject: 'Bell', predicate: 'invented', object: 'telephone' });
  assert.deepEqual(body.facts[1], {
    subject: 'Curie',
    predicate: 'researched',
    object: 'radioactivity'
  });
});

// ===== Topics =====
test('create_topic posts label/phrase to topics endpoint', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, created: true, topic: { uuid: 'topic-1' } });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const result = await client.create_topic({ label: 'Invoices', summary: 'Money docs', aliases: ['#[invoice]'] });
  assert.equal(result.created, true);
  assert.equal(calls[0].url, 'https://example.test/api/topics');
  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.label, 'Invoices');
  assert.equal(body.summary, 'Money docs');
  assert.deepEqual(body.aliases, ['#[invoice]']);
  assert.equal('language' in body, false);
});

test('get_topic unwraps nested topic payload', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, topic: { uuid: 'topic-1', name: 'Invoices' } });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const topic = await client.get_topic('topic-1');
  assert.equal(topic.uuid, 'topic-1');
  assert.equal(calls[0].url, 'https://example.test/api/topics/topic-1');
  assert.equal(calls[0].options.method, 'GET');
});

test('resolve_topic_tag maps top_k and create_if_missing to camelCase', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, topics: [] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.resolve_topic_tag({ tag: '#[invoice]', top_k: 3, create_if_missing: true });
  assert.equal(calls[0].url, 'https://example.test/api/topics/resolve-tag');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.tag, '#[invoice]');
  assert.equal(body.topK, 3);
  assert.equal(body.createIfMissing, true);
});

// ===== Object Categories =====
test('create_object_category maps parent fields to camelCase', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, categoryPrototypeUuid: 'cat-1' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const result = await client.create_object_category({
    name: 'Person',
    parent_category_name: 'Thing',
    source: 'schema.org'
  });
  assert.equal(result.categoryPrototypeUuid, 'cat-1');
  assert.equal(calls[0].url, 'https://example.test/api/object-categories');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.name, 'Person');
  assert.equal(body.context, 'object-category');
  assert.equal(body.parentCategoryName, 'Thing');
  assert.equal(body.source, 'schema.org');
});

test('upsert_object_category maps category_lineage_key', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, categoryPrototypeUuid: 'cat-2' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.upsert_object_category({ name: 'Person', category_lineage_key: 'category:person' });
  assert.equal(calls[0].url, 'https://example.test/api/object-categories/upsert');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.categoryLineageKey, 'category:person');
});

test('get_object_category targets the category uuid endpoint', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, categoryPrototypeUuid: 'cat-3' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.get_object_category('cat-3');
  assert.equal(calls[0].url, 'https://example.test/api/object-categories/cat-3');
  assert.equal(calls[0].options.method, 'GET');
});

// ===== Objects =====
test('upsert_object maps snake_case fields to camelCase body', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, objectUuid: 'obj-1' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const result = await client.upsert_object({
    title: 'David Bowie',
    category_prototype_uuid: 'cat-1',
    knowledge_kind: 'fact',
    owner_user_id: 'user-1',
    private: true
  });
  assert.equal(result.objectUuid, 'obj-1');
  assert.equal(calls[0].url, 'https://example.test/api/objects/upsert');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.title, 'David Bowie');
  assert.equal(body.categoryPrototypeUuid, 'cat-1');
  assert.equal(body.knowledgeKind, 'fact');
  assert.equal(body.ownerUserId, 'user-1');
  assert.equal(body.private, true);
});

test('get_object encodes scope query params', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, objectUuid: 'obj-1' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.get_object('obj-1', { owner_user_id: 'user-1' });
  assert.match(calls[0].url, /\/api\/objects\/obj-1\?/);
  assert.match(calls[0].url, /ownerUserId=user-1/);
  assert.equal(calls[0].options.method, 'GET');
});

test('resolve_object maps lineage key and private flag', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, selectedObjectUuid: 'obj-1' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.resolve_object({ object_lineage_key: 'obj:person:bowie', private: true, owner_user_id: 'user-1' });
  assert.equal(calls[0].url, 'https://example.test/api/objects/resolve');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.objectLineageKey, 'obj:person:bowie');
  assert.equal(body.private, true);
  assert.equal(body.ownerUserId, 'user-1');
});

test('generalize_object maps source and target fields', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.generalize_object({
    source_object_uuid: 'obj-1',
    target_category_name: 'Person',
    mode: 'schema_only',
    publish_assertion: true
  });
  assert.equal(calls[0].url, 'https://example.test/api/objects/generalize');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.sourceObjectUuid, 'obj-1');
  assert.equal(body.targetCategoryName, 'Person');
  assert.equal(body.mode, 'schema_only');
  assert.equal(body.publishAssertion, true);
  assert.equal(body.assertionPredicate, 'generalized_fact');
});

// ===== Procedures =====
test('create_procedure maps extra_props to extraProps', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ procedure_uuid: 'proc-1', step_uuids: ['s1'] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const result = await client.create_procedure({
    title: 'Apply to job',
    steps: [{ title: 'Open form' }],
    dependencies: [[0, 0]],
    extra_props: { source: 'agent' }
  });
  assert.equal(result.procedure_uuid, 'proc-1');
  assert.equal(calls[0].url, 'https://example.test/api/procedures');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.title, 'Apply to job');
  assert.deepEqual(body.steps, [{ title: 'Open form' }]);
  assert.deepEqual(body.extraProps, { source: 'agent' });
});

test('get_procedure targets the procedure uuid endpoint', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, steps: [] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.get_procedure('proc-1');
  assert.equal(calls[0].url, 'https://example.test/api/procedures/proc-1');
  assert.equal(calls[0].options.method, 'GET');
});

test('add_procedure_step maps insertion anchors and omits undefined fields', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, step_uuid: 'step-2' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.add_procedure_step('proc-1', {
    title: 'Accept terms',
    tool: 'browser.click',
    payload: { selector: '#accept' },
    after_step_uuid: 'step-open',
    before_step_uuid: 'step-submit'
  });
  assert.equal(calls[0].url, 'https://example.test/api/procedures/proc-1/steps');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.title, 'Accept terms');
  assert.equal(body.tool, 'browser.click');
  assert.deepEqual(body.payload, { selector: '#accept' });
  assert.equal(body.afterStepUuid, 'step-open');
  assert.equal(body.beforeStepUuid, 'step-submit');
  assert.equal('guard' in body, false);
  assert.equal('order' in body, false);
});

test('generalize_procedure posts title and mode', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, generalized_procedure_uuid: 'proc-2' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const result = await client.generalize_procedure('proc-1', { title: 'Generic apply', mode: 'safe' });
  assert.equal(result.generalized_procedure_uuid, 'proc-2');
  assert.equal(calls[0].url, 'https://example.test/api/procedures/proc-1/generalize');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.title, 'Generic apply');
  assert.equal(body.mode, 'safe');
});

test('repair_procedure_selector maps selector fields to camelCase', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, form_element_uuid: 'fe-2' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.repair_procedure_selector('proc-1', {
    step_uuid: 'step-1',
    form_element_uuid: 'fe-1',
    failed_selector: '#old',
    repaired_selector: '#new'
  });
  assert.equal(calls[0].url, 'https://example.test/api/procedures/proc-1/repair-selector');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.stepUuid, 'step-1');
  assert.equal(body.formElementUuid, 'fe-1');
  assert.equal(body.failedSelector, '#old');
  assert.equal(body.repairedSelector, '#new');
});

test('search_procedures unwraps results and maps top_k', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ results: [{ uuid: 'proc-1' }] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const results = await client.search_procedures('apply to job', { top_k: 3 });
  assert.equal(results[0].uuid, 'proc-1');
  assert.equal(calls[0].url, 'https://example.test/api/procedures/search');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.query, 'apply to job');
  assert.equal(body.topK, 3);
});

test('import_procedure_json maps form element category field', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, procedure_uuid: 'proc-1' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.import_procedure_json({
    procedure: { title: 'Apply', steps: [{ id: 'a', title: 'Open' }] },
    form_element_category_prototype_uuid: 'fe-cat-1'
  });
  assert.equal(calls[0].url, 'https://example.test/api/procedures/import-json');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.procedure.title, 'Apply');
  assert.equal(body.formElementCategoryPrototypeUuid, 'fe-cat-1');
});

// ===== Concept Objects =====
test('suggest_concept_objects maps text/top_k/create flag', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, candidates: [] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.suggest_concept_objects({ text: 'Bowie', top_k: 5, create_tag_if_missing: true });
  assert.equal(calls[0].url, 'https://example.test/api/concept-objects/suggest');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.text, 'Bowie');
  assert.equal(body.query, 'Bowie');
  assert.equal(body.topK, 5);
  assert.equal(body.createTagIfMissing, true);
});

test('search_concept_objects unwraps results and maps top_k', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, results: [{ uuid: 'o1' }] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const results = await client.search_concept_objects({ query: 'Bowie', top_k: 3 });
  assert.equal(results[0].uuid, 'o1');
  assert.equal(calls[0].url, 'https://example.test/api/concept-objects/search');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.query, 'Bowie');
  assert.equal(body.topK, 3);
});

test('suggest_concept_object_prototypes maps category uuids and top_k', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, selected: null, candidates: [] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.suggest_concept_object_prototypes({
    label: 'Person',
    properties: [{ name: 'name', type: 'string' }],
    category_prototype_uuids: ['cat-1'],
    top_k: 4
  });
  assert.equal(calls[0].url, 'https://example.test/api/concept-objects/suggest-prototypes');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.label, 'Person');
  assert.deepEqual(body.categoryPrototypeUuids, ['cat-1']);
  assert.equal(body.topK, 4);
});

// ===== Composites =====
test('create_composite maps category and components', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, composite: { object: { uuid: 'comp-1' } } });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.create_composite({
    category_prototype_uuid: 'cat-1',
    title: 'Band',
    components: [{ categoryPrototypeUuid: 'cat-1', title: 'Member' }]
  });
  assert.equal(calls[0].url, 'https://example.test/api/composites');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.categoryPrototypeUuid, 'cat-1');
  assert.equal(body.title, 'Band');
  assert.equal(body.components.length, 1);
});

test('get_composite targets composite uuid endpoint', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, components: [] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.get_composite('comp-1');
  assert.equal(calls[0].url, 'https://example.test/api/composites/comp-1');
  assert.equal(calls[0].options.method, 'GET');
});

test('update_composite_component builds nested component update URL', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, previous_component_uuid: 'cmp-1' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.update_composite_component('comp-1', 'cmp-1', { title: 'Member v2' });
  assert.equal(calls[0].url, 'https://example.test/api/composites/comp-1/components/cmp-1/update');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.title, 'Member v2');
});

// ===== Logic / Syllogisms =====
test('create_syllogism posts premises and conclusion', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, syllogism_uuid: 'syl-1' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const result = await client.create_syllogism({
    title: 'Mortality',
    premises: [{ text: 'All men are mortal' }],
    conclusion: { text: 'Socrates is mortal' }
  });
  assert.equal(result.syllogism_uuid, 'syl-1');
  assert.equal(calls[0].url, 'https://example.test/api/logic/syllogisms');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.premises.length, 1);
  assert.deepEqual(body.conclusion, { text: 'Socrates is mortal' });
});

test('get_syllogism targets syllogism uuid endpoint', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, steps: [] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.get_syllogism('syl-1');
  assert.equal(calls[0].url, 'https://example.test/api/logic/syllogisms/syl-1');
  assert.equal(calls[0].options.method, 'GET');
});

// ===== Market =====
test('register_market_match maps actor_id and object_uuid', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, intent_uuid: 'intent-1' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.register_market_match({ kind: 'offer', actor_id: 'actor-1', object_uuid: 'obj-1', tags: ['#[guitar]'] });
  assert.equal(calls[0].url, 'https://example.test/api/market/matches/register');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.kind, 'offer');
  assert.equal(body.actorId, 'actor-1');
  assert.equal(body.objectUuid, 'obj-1');
});

test('search_market_matches unwraps matches array', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, matches: [{ score: 2 }] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const matches = await client.search_market_matches({ kind: 'offer', tags: ['#[guitar]'] });
  assert.equal(matches[0].score, 2);
  assert.equal(calls[0].url, 'https://example.test/api/market/matches/search');
});

// ===== Channels =====
test('subscribe_channel maps channel_tag and actor_id', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, subscription_uuid: 'sub-1' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.subscribe_channel({ channel_tag: '#[news]', actor_id: 'actor-1' });
  assert.equal(calls[0].url, 'https://example.test/api/channels/subscribe');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.channelTag, '#[news]');
  assert.equal(body.actorId, 'actor-1');
});

test('post_channel_message maps message fields', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, message_uuid: 'msg-1' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.post_channel_message({ channel_tag: '#[news]', actor_id: 'actor-2', message: 'hi', tags: ['#[t]'] });
  assert.equal(calls[0].url, 'https://example.test/api/channels/messages');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.channelTag, '#[news]');
  assert.equal(body.actorId, 'actor-2');
  assert.equal(body.message, 'hi');
});

test('get_channel_feed passes actorId param and unwraps items', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, items: [{ uuid: 'm1' }] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const items = await client.get_channel_feed('actor-1');
  assert.equal(items[0].uuid, 'm1');
  assert.match(calls[0].url, /\/api\/channels\/feed\?/);
  assert.match(calls[0].url, /actorId=actor-1/);
  assert.equal(calls[0].options.method, 'GET');
});

// ===== Events =====
test('create_repeating_event maps category and title', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, event_uuid: 'evt-1' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const result = await client.create_repeating_event({ category_prototype_uuid: 'cat-1', title: 'Standup', tags: ['#[standup]'] });
  assert.equal(result.event_uuid, 'evt-1');
  assert.equal(calls[0].url, 'https://example.test/api/events/repeating');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.categoryPrototypeUuid, 'cat-1');
  assert.equal(body.title, 'Standup');
});

// ===== Ratings =====
test('rate_entity maps actor_id/value/metric to rating endpoint', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, rating: { id: 'a1' } });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.rate_entity('obj-1', { actor_id: 'actor-1', value: 4, metric: 'quality' });
  assert.equal(calls[0].url, 'https://example.test/api/ratings/obj-1');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.actorId, 'actor-1');
  assert.equal(body.value, 4);
  assert.equal(body.metric, 'quality');
  assert.equal(body.scale, 5);
});

test('get_ratings targets ratings uuid endpoint', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ ok: true, summary: {}, evidence: [] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.get_ratings('obj-1');
  assert.equal(calls[0].url, 'https://example.test/api/ratings/obj-1');
  assert.equal(calls[0].options.method, 'GET');
});

test('generalize_from_exemplar maps snake_case to camelCase payload', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ prototypeUuid: 'p1', created: true, exemplarCount: 1, typicality: 1 });
  };
  const ClientClass = await loadClientClass(); // pragma: allowlist secret
  const client = new ClientClass({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const out = await client.generalize_from_exemplar({
    text: 'login username password submit',
    label: 'Login Form',
    threshold: 0.8,
    create_if_no_match: true
  });
  assert.equal(out.prototypeUuid, 'p1');
  assert.equal(calls[0].url, 'https://example.test/api2.0/prototypes/generalize');
  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.text, 'login username password submit');
  assert.equal(body.label, 'Login Form');
  assert.equal(body.threshold, 0.8);
  assert.equal(body.createIfNoMatch, true);
});

test('match_prototypes posts query and unwraps matches array', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ matches: [{ uuid: 'p1', name: 'Login Form', score: 0.92 }] });
  };
  const ClientClass = await loadClientClass(); // pragma: allowlist secret
  const client = new ClientClass({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const matches = await client.match_prototypes({ text: 'email password submit', top_k: 3 });
  assert.equal(matches[0].name, 'Login Form');
  assert.equal(calls[0].url, 'https://example.test/api2.0/prototypes/match');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.topK, 3);
});

test('prototypeApiPrefix falls back to the legacy /api alias when requested', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ matches: [] });
  };
  const ClientClass = await loadClientClass(); // pragma: allowlist secret
  const client = new ClientClass({ baseUrl: 'https://example.test', fetchImpl: fetchMock, prototypeApiPrefix: '/api' });

  await client.match_prototypes({ text: 'username password submit' });
  assert.equal(calls[0].url, 'https://example.test/api/prototypes/match');
});

test('search_prototypes posts label query and unwraps prototypes array', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ prototypes: [{ uuid: 'p1', name: 'Person' }] });
  };
  const ClientClass = await loadClientClass(); // pragma: allowlist secret
  const client = new ClientClass({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  const protos = await client.search_prototypes({ query: 'Pers', top_k: 5 });
  assert.equal(protos[0].name, 'Person');
  assert.equal(calls[0].url, 'https://example.test/api2.0/prototypes/search');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.query, 'Pers');
  assert.equal(body.topK, 5);
});

test('attach_exemplar targets prototype exemplars endpoint', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ prototypeUuid: 'p1', exemplarCount: 2, typicality: 0.9 });
  };
  const ClientClass = await loadClientClass(); // pragma: allowlist secret
  const client = new ClientClass({ baseUrl: 'https://example.test', fetchImpl: fetchMock });

  await client.attach_exemplar('p1', 'c2');
  assert.equal(calls[0].url, 'https://example.test/api2.0/prototypes/p1/exemplars');
  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.conceptUuid, 'c2');
});

test('connect validates release manifest channel', async () => {
  const fetchMock = async (url) => {
    if (url.endsWith('/api/release')) {
      return makeJsonResponse({
        channel: 'dev',
        release: 'v0.2.4',
        surfaces: { clientContract: [{ method: 'GET', path: '/health' }] }
      });
    }
    return makeJsonResponse({ status: 'ok' });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });
  const manifest = await client.connect({ expected_channel: 'dev', expected_release: 'v0.2.4' });
  assert.equal(manifest.channel, 'dev');
});

test('suggest_concept_objects adds suggestions alias from candidates', async () => {
  const fetchMock = async () => makeJsonResponse({ ok: true, candidates: [{ uuid: 'c1' }] });
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });
  const result = await client.suggest_concept_objects({ text: 'bike' });
  assert.deepEqual(result.suggestions, [{ uuid: 'c1' }]);
});

test('resolve_object adds objectUuid alias', async () => {
  const fetchMock = async () => makeJsonResponse({ ok: true, selectedObjectUuid: 'obj-9' });
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });
  const result = await client.resolve_object({ object_lineage_key: 'line-1' });
  assert.equal(result.objectUuid, 'obj-9');
});

test('resolve_tag delegates to resolve_topic_tag', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return makeJsonResponse({ topics: [] });
  };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });
  await client.resolve_tag({ phrase: '#[test]' });
  assert.equal(calls[0].url, 'https://example.test/api/topics/resolve-tag');
});

test('list_objects requests /api/objects with category+limit and unwraps objects', async () => {
  const calls = [];
  const fetchMock = async (url, options) => { calls.push({ url, options }); return makeJsonResponse({ objects: [{ uuid: 'o1', title: 'Acme', category: 'Organization' }] }); };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });
  const objs = await client.list_objects({ category: 'Organization', limit: 50 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.match(calls[0].url, /\/api\/objects/);
  assert.ok(calls[0].url.includes('category=Organization'), 'category in query');
  assert.ok(calls[0].url.includes('limit=50'), 'limit in query');
  assert.equal(objs[0].title, 'Acme');
});

test('defaultOwnerUserId sends X-KSG-Owner and ownerUserId on list/search', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes('/concepts/search')) return makeJsonResponse({ results: [] });
    return makeJsonResponse({ objects: [] });
  };
  const ClientClass = await loadClientClass(); // pragma: allowlist secret
  const client = new ClientClass({
    baseUrl: 'https://example.test',
    fetchImpl: fetchMock,
    defaultOwnerUserId: 'alice',
  });
  await client.list_objects({ limit: 10 });
  assert.equal(calls[0].options.headers['x-ksg-owner'], 'alice');
  assert.ok(calls[0].url.includes('ownerUserId=alice'));
  await client.search_concepts('login', { top_k: 5 });
  assert.equal(calls[1].options.headers['x-ksg-owner'], 'alice');
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.ownerUserId, 'alice');
});

test('list_object_categories requests /api/object-categories and unwraps categories', async () => {
  const calls = [];
  const fetchMock = async (url, options) => { calls.push({ url, options }); return makeJsonResponse({ categories: [{ uuid: 'c1', name: 'Organization', objectCount: 3 }] }); };
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: 'https://example.test', fetchImpl: fetchMock });
  const cats = await client.list_object_categories();
  assert.equal(calls[0].options.method, 'GET');
  assert.match(calls[0].url, /\/api\/object-categories/);
  assert.equal(cats[0].name, 'Organization');
  assert.equal(cats[0].objectCount, 3);
});
