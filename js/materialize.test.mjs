import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materializeObject, toMethodName, coerceValue } from './materialize.js';

function makeFakeClient(state) {
  return {
    async get_object() {
      return {
        object: { uuid: 'obj-1', title: 'Marie Curie', categoryPrototypeUuid: 'proto-1' },
        propertiesByName: {
          'Full Name': { value: 'Marie Curie', valueType: 'string' },
          Age: { value: '56', valueType: 'number' },
          Active: { value: 'true', valueType: 'boolean' },
        },
      };
    },
    async get_assertions({ subject, predicate }) {
      if (subject === 'proto-1' && predicate === 'has_procedure') {
        return state.links.map((uuid) => ({ subject, predicate, object: uuid }));
      }
      return [];
    },
    async get_procedure(uuid) {
      return { procedure: { uuid, props: { title: state.titles[uuid] } }, steps: [] };
    },
  };
}

test('toMethodName camel-cases titles', () => {
  assert.equal(toMethodName('Send Welcome Email'), 'sendWelcomeEmail');
  assert.equal(toMethodName('archive-record'), 'archiveRecord');
  assert.equal(toMethodName(''), '');
});

test('coerceValue coerces by declared prototype type', () => {
  assert.equal(coerceValue('56', 'number'), 56);
  assert.equal(coerceValue('true', 'boolean'), true);
  assert.deepEqual(coerceValue('[1,2]', 'json'), [1, 2]);
  assert.equal(coerceValue('hi', 'string'), 'hi');
});

test('materializes typed properties from the object data', async () => {
  const client = makeFakeClient({ links: [], titles: {} });
  const obj = await materializeObject(client, 'obj-1');
  assert.equal(obj['Full Name'], 'Marie Curie');
  assert.equal(obj.Age, 56); // coerced to number, not "56"
  assert.equal(obj.Active, true); // coerced to boolean
  assert.equal(obj.__ksg.uuid, 'obj-1');
  assert.equal(obj.__ksg.prototypeUuid, 'proto-1');
});

test('method names come from KSG procedures, not hardcoded', async () => {
  const state = { links: ['proc-1'], titles: { 'proc-1': 'Send Welcome Email' } };
  const client = makeFakeClient(state);

  const a = await materializeObject(client, 'obj-1');
  assert.equal(typeof a.sendWelcomeEmail, 'function');
  assert.deepEqual(a.__methods.sendWelcomeEmail, { uuid: 'proc-1', title: 'Send Welcome Email' });

  // Rename the procedure in KSG -> the materialized method name follows.
  state.titles['proc-1'] = 'Archive Record';
  const b = await materializeObject(client, 'obj-1');
  assert.equal(typeof b.archiveRecord, 'function');
  assert.ok(!('sendWelcomeEmail' in b));
});

test('default method call returns the compiled procedure bound to the object', async () => {
  const state = { links: ['proc-1'], titles: { 'proc-1': 'Send Welcome Email' } };
  const obj = await materializeObject(makeFakeClient(state), 'obj-1');
  const res = await obj.sendWelcomeEmail({ to: 'lab@example.com' });
  assert.equal(res.ok, true);
  assert.equal(res.procedureUuid, 'proc-1');
  assert.equal(res.boundTo, 'obj-1');
  assert.deepEqual(res.args, { to: 'lab@example.com' });
  assert.ok(res.compiled);
});

test('runProcedure hook executes the linked procedure bound to the instance', async () => {
  const state = { links: ['proc-9'], titles: { 'proc-9': 'Recalculate Score' } };
  const calls = [];
  const obj = await materializeObject(makeFakeClient(state), 'obj-1', {
    runProcedure: async (ctx) => {
      calls.push(ctx);
      return { executed: ctx.procedureUuid, on: ctx.object.__ksg.uuid };
    },
  });
  const res = await obj.recalculateScore({ weight: 2 });
  assert.equal(res.executed, 'proc-9');
  assert.equal(res.on, 'obj-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, 'Recalculate Score');
  assert.deepEqual(calls[0].args, { weight: 2 });
});

test('custom discoverProcedures override is honored', async () => {
  const obj = await materializeObject(makeFakeClient({ links: [], titles: {} }), 'obj-1', {
    discoverProcedures: async () => [{ uuid: 'p-x', title: 'Do The Thing' }],
  });
  assert.equal(typeof obj.doTheThing, 'function');
});
