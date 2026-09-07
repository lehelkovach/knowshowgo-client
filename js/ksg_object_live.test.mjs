/**
 * KSGObject against a real KSG service — no mocked transport.
 *
 * The unit tests pin the projection's behaviour against a fixed payload, which
 * proves the client is self-consistent and nothing about whether the server
 * actually emits that shape. This suite writes real objects through
 * `upsert_object` and reads them back through `hydrate`, so a change to either
 * side that breaks the contract fails here.
 *
 * Skips when no service is reachable, rather than failing, so the offline unit
 * gate stays runnable. Point it at one with:
 *   KSG_LIVE_URL=http://127.0.0.1:3000 node --test js/ksg_object_live.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { KnowShowGoClient, KSGObject } from './client.js';

const BASE_URL = process.env.KSG_LIVE_URL || process.env.KSG_API_URL || 'http://127.0.0.1:3000';

async function serviceReachable() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${BASE_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

const live = await serviceReachable();
const client = new KnowShowGoClient({ baseUrl: BASE_URL });
const suffix = Date.now().toString(36);

async function seedPerson(overrides = {}) {
  const out = await client.upsert_object({
    category_name: `LiveOrmPerson_${suffix}`,
    title: 'Ada Live',
    summary: 'seeded by the live duck-typing suite',
    properties: [
      { propertyName: 'middle_name', type: 'string', value: 'Byron' },
      { propertyName: 'city', type: 'string', value: 'Denver' },
      { propertyName: 'nickname', type: 'string', value: 'Ada' },
    ],
    ...overrides,
  });
  const uuid = out.objectUuid || out.uuid || out.object?.uuid;
  assert.ok(uuid, `upsert_object returned no uuid: ${JSON.stringify(out)}`);
  return uuid;
}

test('hydrate() against a real service yields a working projection', { skip: !live && `no KSG service at ${BASE_URL}` }, async () => {
  const uuid = await seedPerson();
  const person = await client.hydrate(uuid);

  assert.ok(person instanceof KSGObject);
  assert.equal(person.uuid, uuid);
  assert.ok(person.hydratedAt, 'server must stamp hydratedAt');

  // Members must exist for what we wrote, under either spelling.
  assert.ok(person.hasMember('middle_name'), 'middle_name missing from members');
  assert.ok(person.hasMember('middleName'), 'camelCase alias not indexed');
  assert.ok(person.hasMember('city'));

  assert.ok('middle_name' in person);
  assert.ok(Object.keys(person).includes('city'));
});

test('the real match ranking is ordered and each member names its source', { skip: !live && `no KSG service at ${BASE_URL}` }, async () => {
  const uuid = await seedPerson();
  const person = await client.hydrate(uuid, { topK: 5 });

  const scores = person.typesNow().map((t) => Number(t.score));
  assert.deepEqual(scores, scores.slice().sort((a, b) => b - a), 'types not strongest-first');

  for (const name of Object.keys(person.members)) {
    const explained = person.explain(name);
    assert.ok(explained, `explain(${name}) returned null for a real member`);
    assert.ok(Array.isArray(explained.alsoDefinedBy));
  }
});

test('as() re-projects through a prototype the real server reported', { skip: !live && `no KSG service at ${BASE_URL}` }, async () => {
  const uuid = await seedPerson();
  const person = await client.hydrate(uuid);

  const prototypeName = Object.keys(person.byPrototype)[0];
  if (!prototypeName) {
    // Nothing matched: as() must refuse rather than invent a view.
    assert.equal(person.as('Anything'), null);
    return;
  }

  const viewed = person.as(prototypeName);
  assert.ok(viewed instanceof KSGObject);
  assert.equal(viewed.type().name, prototypeName);
  for (const name of Object.keys(viewed.members)) {
    assert.ok(
      person.byPrototype[prototypeName].members.includes(name),
      `as(${prototypeName}) exposed ${name}, which that prototype does not declare`,
    );
  }
});

test('hydrating does not stamp membership on the real graph', { skip: !live && `no KSG service at ${BASE_URL}` }, async () => {
  const uuid = await seedPerson();

  const before = await client.get_object(uuid);
  const beforeIds = [...(before.object?.prototypeIds || before.prototypeIds || [])].sort();

  await client.hydrate(uuid);
  await client.hydrate(uuid, { topK: 5 });

  const after = await client.get_object(uuid);
  const afterIds = [...(after.object?.prototypeIds || after.prototypeIds || [])].sort();

  assert.deepEqual(afterIds, beforeIds, 'hydrate mutated prototype membership');
});

test('one hydrate costs one request where the old path cost two', { skip: !live && `no KSG service at ${BASE_URL}` }, async () => {
  const uuid = await seedPerson();

  const counted = [];
  const countingClient = new KnowShowGoClient({
    baseUrl: BASE_URL,
    fetchImpl: async (url, init) => {
      counted.push(String(url));
      return fetch(url, init);
    },
  });

  const person = await countingClient.hydrate(uuid);
  const hydrateCalls = counted.filter((u) => u.includes('/hydrate')).length;
  assert.equal(hydrateCalls, 1);

  // Reading members, provenance and an alternate projection stays local.
  const requestsAfterHydrate = counted.length;
  person.middleName;
  person.cell('city');
  person.explain('city');
  const first = Object.keys(person.byPrototype)[0];
  if (first) person.as(first).city;
  assert.equal(counted.length, requestsAfterHydrate, 'member access hit the network');
});
