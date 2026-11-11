// KG-P1 contract: assert_proposition and the uuid terms on create_assertion.
// Mocked transport; shapes copied from knowshowgo src/server/rest-api.js
// (writePropositionFromRequest, POST /api2.0/propositions and the uuid branch
// of POST /api/assertions). Fake data only.
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

async function recordingClient(reply) {
  const KnowShowGoClient = await loadClientClass();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    const out = reply();
    return Array.isArray(out) ? jsonResponse(out[0], out[1]) : jsonResponse(out);
  };
  return { client: new KnowShowGoClient({ baseUrl: 'https://ksg.example.test', fetchImpl }), calls };
}

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('assert_proposition posts the proposition body to /api2.0/propositions', async () => {
  const reply = { ok: true, reused: false, claim: { uuid: U(9), subject: U(1), predicateUuid: U(2), object: U(3) }, subject: { uuid: U(1) }, predicate: { uuid: U(2), name: 'email' }, object: { uuid: U(3), value: 'avery@example.test', kind: 'value' }, superseded: [] };
  const { client, calls } = await recordingClient(() => reply);
  const out = await client.assert_proposition({
    subject: 'Avery Example', subject_prototype: 'Person', predicate: 'email',
    value: 'avery@example.test', scope: 'private', provenance: { statedBy: 'owner' }, replace: true
  });
  assert.deepEqual(out, reply);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'https://ksg.example.test/api2.0/propositions');
  assert.deepEqual(calls[0].body, {
    subject: 'Avery Example', subjectPrototype: 'Person', predicate: 'email',
    value: 'avery@example.test', provenance: { statedBy: 'owner' }, replace: true, securityClass: 'private'
  });
});

test('assert_proposition sends an entity object with its prototype, and uuids as given', async () => {
  const { client, calls } = await recordingClient(() => ({ ok: true }));
  await client.assert_proposition({ subject_uuid: U(1), predicate: 'works for', object: 'Contoso', object_prototype: 'Organization' });
  assert.deepEqual(calls[0].body, { subjectUuid: U(1), predicate: 'works for', object: 'Contoso', objectPrototype: 'Organization' });
});

test('a 409 ambiguity reaches the caller with its candidates', async () => {
  const body = { ok: false, code: 'P003', error: 'subject: 2 Person instances are called "Sam Example"', candidates: [{ uuid: U(1) }, { uuid: U(2) }] };
  const { client } = await recordingClient(() => [body, 409]);
  await assert.rejects(client.assert_proposition({ subject: 'Sam Example', subject_prototype: 'Person', predicate: 'email', value: 'sam@example.test' }), (err) => {
    assert.equal(err.status, 409);
    assert.equal(err.body.code, 'P003');
    assert.equal(err.body.candidates.length, 2);
    return true;
  });
});

test('create_assertion adds uuid terms only when given', async () => {
  const { client, calls } = await recordingClient(() => ({ uuid: U(9) }));
  await client.create_assertion({ subject: 'person:avery', predicate: 'likes', obj: 'tea' });
  assert.equal('subjectUuid' in calls[0].body, false);
  await client.create_assertion({ subject_uuid: U(1), predicate: 'nickname', obj: 'Ave' });
  assert.equal(calls[1].body.subjectUuid, U(1));
  assert.equal(calls[1].url, 'https://ksg.example.test/api/assertions');
});

test('KG-P2: bind_pattern, close_relation, evaluate_joins, ensure_predicate, check_membership send their bodies', async () => {
  const { client, calls } = await recordingClient(() => ({ ok: true }));
  const pattern = [{ subject: { label: 'Avery Example', prototype: 'Person' }, predicate: 'email', object: '?e' }];
  await client.bind_pattern({ pattern, describe: true });
  assert.deepEqual([calls[0].url, calls[0].body], ['https://ksg.example.test/api2.0/logic-ir/bind', { pattern, describe: true }]);
  await client.close_relation({ predicate: 'manager_of' });
  assert.deepEqual([calls[1].url, calls[1].body], ['https://ksg.example.test/api2.0/logic-ir/closure', { predicate: 'manager_of' }]);
  await client.evaluate_joins({ rules: [{ name: 'skip', ir: { kind: 'ForAll' } }] });
  assert.equal(calls[2].url, 'https://ksg.example.test/api2.0/logic-ir/joins');
  await client.ensure_predicate({ name: 'skip_manager_of' });
  assert.deepEqual([calls[3].url, calls[3].body], ['https://ksg.example.test/api2.0/predicates', { name: 'skip_manager_of' }]);
  await client.check_membership({ subject: U(1), category: U(2) });
  assert.deepEqual([calls[4].url, calls[4].body], ['https://ksg.example.test/api2.0/prototypes/membership', { subject: U(1), category: U(2) }]);
});
