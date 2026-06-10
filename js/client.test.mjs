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
