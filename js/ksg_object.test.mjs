/**
 * KSGObject — the duck-typed projection.
 *
 * The contract: member access is synchronous and total. Plain property reads,
 * `in`, `Object.keys`, spread and destructuring all work off one hydration
 * payload, strongest match owns a name, and a weaker match stays reachable so a
 * bad ranking is recoverable without another request.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { KnowShowGoClient, KSGObject } from './client.js';

const HYDRATION = {
  ok: true,
  uuid: 'entity-1',
  hydratedAt: '2026-09-07T21:00:00.000Z',
  types: [
    { uuid: 'proto-person', name: 'Person', score: 0.91 },
    { uuid: 'proto-employee', name: 'Employee', score: 0.62 },
  ],
  members: {
    middle_name: {
      name: 'middle_name',
      valueType: 'string',
      required: false,
      definedBy: { prototypeUuid: 'proto-person', prototypeName: 'Person', score: 0.91 },
      alsoDefinedBy: [],
      hasValue: true,
    },
    city: {
      name: 'city',
      valueType: 'string',
      required: false,
      definedBy: { prototypeUuid: 'proto-person', prototypeName: 'Person', score: 0.91 },
      alsoDefinedBy: [{ prototypeUuid: 'proto-employee', prototypeName: 'Employee', score: 0.62 }],
      hasValue: true,
    },
    role: {
      name: 'role',
      valueType: 'string',
      required: false,
      definedBy: { prototypeUuid: 'proto-employee', prototypeName: 'Employee', score: 0.62 },
      alsoDefinedBy: [],
      hasValue: true,
    },
    nickname: {
      name: 'nickname',
      valueType: 'string',
      required: false,
      definedBy: { prototypeUuid: 'proto-person', prototypeName: 'Person', score: 0.91 },
      alsoDefinedBy: [],
      hasValue: false,
    },
    favourite_colour: {
      name: 'favourite_colour',
      valueType: null,
      required: false,
      definedBy: null,
      alsoDefinedBy: [],
      hasValue: true,
    },
  },
  properties: {
    middle_name: { value: 'Byron', confidence: 0.9, contested: false, claims: [{ value: 'Byron' }] },
    city: {
      value: 'Denver',
      confidence: 0.6,
      contested: true,
      claims: [{ value: 'Denver' }, { value: 'Boulder' }],
    },
    role: { value: 'engineer', confidence: 0.8, contested: false, claims: [] },
    favourite_colour: { value: 'green', confidence: 0.5, contested: false, claims: [] },
  },
  byPrototype: {
    Person: { uuid: 'proto-person', score: 0.91, members: ['middle_name', 'city', 'nickname'] },
    Employee: { uuid: 'proto-employee', score: 0.62, members: ['role', 'city'] },
  },
  policy: null,
};

const obj = () => new KSGObject(HYDRATION);

test('members are readable synchronously, in snake_case or camelCase', () => {
  const person = obj();
  assert.equal(person.middle_name, 'Byron');
  assert.equal(person.middleName, 'Byron');
  assert.equal(person.city, 'Denver');
});

test('in, Object.keys, spread and destructuring all see members', () => {
  const person = obj();
  assert.ok('middle_name' in person);
  assert.ok('middleName' in person);
  assert.ok(!('not_a_field' in person));

  const keys = Object.keys(person);
  for (const name of ['middle_name', 'city', 'role', 'nickname', 'favourite_colour']) {
    assert.ok(keys.includes(name), `Object.keys missing ${name}`);
  }

  const { city, role } = person;
  assert.equal(city, 'Denver');
  assert.equal(role, 'engineer');

  assert.equal({ ...person }.middle_name, 'Byron');
});

test('the strongest match is the default type', () => {
  const person = obj();
  assert.equal(person.type().name, 'Person');
  assert.equal(person.typesNow().length, 2);
});

test('a declared member with no value differs from an unknown name', () => {
  const person = obj();

  assert.equal(person.nickname, undefined);
  assert.equal(person.typo_field, undefined);

  assert.ok(person.hasMember('nickname'));
  assert.ok(!person.hasValue('nickname'));

  assert.ok(!person.hasMember('typo_field'));
  assert.ok(!person.hasValue('typo_field'));
});

test('explain names the owning prototype and the rivals', () => {
  const person = obj();

  const city = person.explain('city');
  assert.equal(city.definedBy.prototypeName, 'Person');
  assert.equal(city.definedBy.score, 0.91);
  assert.equal(city.alsoDefinedBy.length, 1);
  assert.equal(city.alsoDefinedBy[0].prototypeName, 'Employee');

  assert.equal(person.explain('unknown_name'), null);
});

test('a value no prototype declares is still exposed, with definedBy null', () => {
  const person = obj();
  assert.equal(person.favourite_colour, 'green');
  assert.equal(person.explain('favourite_colour').definedBy, null);
});

test('contested claims stay reachable behind the winner', () => {
  const person = obj();
  assert.equal(person.city, 'Denver');
  assert.ok(person.isContested('city'));
  assert.equal(person.claims('city').length, 2);
  assert.ok(!person.isContested('middle_name'));
});

test('cell exposes value, confidence and provenance together', () => {
  const cell = obj().cell('middleName');
  assert.equal(cell.name, 'middle_name');
  assert.equal(cell.value, 'Byron');
  assert.equal(cell.confidence, 0.9);
  assert.equal(cell.contested, false);
  assert.equal(cell.valueType, 'string');
  assert.equal(cell.definedBy.prototypeName, 'Person');
  assert.equal(obj().cell('nope'), undefined);
});

test('as() reads through a weaker match and hides foreign members', () => {
  const employee = obj().as('Employee');
  assert.equal(employee.role, 'engineer');
  assert.equal(employee.city, 'Denver');
  // middle_name belongs to Person only.
  assert.equal(employee.middle_name, undefined);
  assert.ok(!('middle_name' in employee));
  assert.equal(employee.type().name, 'Employee');
  assert.equal(employee.explain('city').definedBy.prototypeName, 'Employee');
});

test('as() accepts a prototype uuid and returns null for a non-match', () => {
  const byUuid = obj().as('proto-employee');
  assert.equal(byUuid.type().name, 'Employee');
  assert.equal(obj().as('NotAMatchedPrototype'), null);
});

test('real fields win over same-named members, which stay reachable', () => {
  const person = new KSGObject({
    ...HYDRATION,
    members: { ...HYDRATION.members, uuid: { name: 'uuid', definedBy: null, alsoDefinedBy: [], hasValue: true } },
    properties: { ...HYDRATION.properties, uuid: { value: 'a-member-called-uuid', claims: [] } },
  });

  assert.equal(person.uuid, 'entity-1');
  assert.equal(person.value('uuid'), 'a-member-called-uuid');
  assert.equal(person.cell('uuid').value, 'a-member-called-uuid');
});

test('the projection is a timestamped snapshot', () => {
  assert.equal(obj().hydratedAt, '2026-09-07T21:00:00.000Z');
});

test('an empty hydration is inert rather than throwing', () => {
  const empty = new KSGObject();
  assert.equal(empty.type(), null);
  assert.deepEqual(empty.typesNow(), []);
  assert.equal(empty.anything, undefined);
  assert.equal(empty.hasMember('anything'), false);
  assert.deepEqual(Object.keys(empty).filter((k) => k === 'members'), ['members']);
});

test('hydrate() issues one GET and returns a KSGObject', async () => {
  const calls = [];
  const client = new KnowShowGoClient({
    baseUrl: 'http://ksg.test',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init?.method || 'GET' });
      return {
        ok: true,
        status: 200,
        headers: {
          get(name) {
            return name.toLowerCase() === 'content-type' ? 'application/json' : null;
          },
        },
        json: async () => HYDRATION,
        text: async () => JSON.stringify(HYDRATION),
      };
    },
  });

  const person = await client.hydrate('entity-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.ok(calls[0].url.includes('/api2.0/entities/entity-1/hydrate'));
  assert.ok(person instanceof KSGObject);
  assert.equal(person.middleName, 'Byron');

  // No further requests: access is a local lookup.
  person.city;
  person.explain('city');
  person.as('Employee').role;
  assert.equal(calls.length, 1);
});

test('typesNow and resolveTypes each have exactly one return type', async () => {
  const { EntityProxy } = await import('./client.js');
  const proxy = new EntityProxy({ uuid: 'e1', properties: {}, types: [{ name: 'Person' }] });

  assert.ok(Array.isArray(proxy.typesNow()));
  const resolved = proxy.resolveTypes();
  assert.ok(resolved instanceof Promise);
  assert.ok(Array.isArray(await resolved));
});
