// NODE-SUPERSEDE1 — `supersede_node`: the owner retires its own private node by
// versioning (knowshowgo `POST /api/nodes/:uuid/supersede`, src/server/rest-api.js).
// Mocked transport. Fake data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadClientClass() {
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return mod.KnowShowGoClient;
}

test('supersede_node posts reason, order and successor to the node, as the owner', async () => {
  const KnowShowGoClient = await loadClientClass();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    return { ok: true, status: 200, headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => ({ ok: true }), text: async () => '{"ok":true}' };
  };
  const client = new KnowShowGoClient({ baseUrl: 'https://ksg.example.test', fetchImpl, defaultOwnerUserId: 'test_fake1' });
  const uuid = '00000000-0000-4000-8000-000000000001';
  await client.supersede_node(uuid, { reason: 'residue', order: '1 yes', superseded_by: '00000000-0000-4000-8000-000000000002' });
  const c = calls.at(-1);
  assert.equal(`${c.method} ${c.url.pathname}`, `POST /api/nodes/${uuid}/supersede`);
  const { ownerUserId, ...body } = c.body;
  assert.deepEqual(body, { reason: 'residue', order: '1 yes', supersededBy: '00000000-0000-4000-8000-000000000002' });
  assert.ok(ownerUserId === undefined || ownerUserId === 'test_fake1');
  const h = c.headers instanceof Headers ? Object.fromEntries(c.headers) : Object.fromEntries(Object.entries(c.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  assert.equal(h['x-ksg-owner'], 'test_fake1');
  await client.supersede_node(uuid);
  const { ownerUserId: _o, ...empty } = calls.at(-1).body || {};
  assert.deepEqual(empty, {});
});
