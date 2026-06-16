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
