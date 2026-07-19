import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  materializeObject,
  defineSpecialization,
  clearSpecializations,
  toMethodName,
  coerceValue,
} from './materialize.js';

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

// ---- Semantic discovery fallback (no has_procedure edges) -------------------

test('falls back to semantic search_procedures when no edges exist', async () => {
  const calls = { queries: [] };
  const client = {
    async get_object() {
      return {
        object: { uuid: 'obj-1', title: 'Marie Curie', categoryPrototypeUuid: 'proto-1' },
        propertiesByName: { 'Full Name': { value: 'Marie Curie', valueType: 'string' } },
      };
    },
    async get_assertions() {
      return []; // no precise edges
    },
    async get_prototype(uuid) {
      return { prototype: { uuid, name: 'Scientist', subprocedureQuery: 'scientist onboarding steps' } };
    },
    async search_procedures(query) {
      calls.queries.push(query);
      return [
        { uuid: 'p-1', title: 'Send Welcome Email' },
        { procedure: { uuid: 'p-2', title: 'Archive Record' } },
        { uuid: 'p-1', title: 'Send Welcome Email' }, // dup, should be deduped
      ];
    },
  };
  const obj = await materializeObject(client, 'obj-1');
  // used the prototype's stored subprocedureQuery
  assert.deepEqual(calls.queries, ['scientist onboarding steps']);
  assert.equal(typeof obj.sendWelcomeEmail, 'function');
  assert.equal(typeof obj.archiveRecord, 'function');
  assert.equal(Object.keys(obj.__methods).length, 2); // deduped
});

test('semanticDiscovery:false disables the fallback', async () => {
  let searched = false;
  const client = {
    async get_object() {
      return { object: { uuid: 'o', categoryPrototypeUuid: 'proto-1' }, propertiesByName: {} };
    },
    async get_assertions() {
      return [];
    },
    async search_procedures() {
      searched = true;
      return [{ uuid: 'x', title: 'Nope' }];
    },
  };
  const obj = await materializeObject(client, 'o', { semanticDiscovery: false });
  assert.equal(searched, false);
  assert.equal(Object.keys(obj.__methods).length, 0);
});

test('explicit discoveryQuery overrides the resolved query', async () => {
  const seen = [];
  const client = {
    async get_object() {
      return { object: { uuid: 'o', categoryPrototypeUuid: 'proto-1' }, propertiesByName: {} };
    },
    async get_assertions() {
      return [];
    },
    async search_procedures(q) {
      seen.push(q);
      return [{ uuid: 'p-9', title: 'Do It' }];
    },
  };
  const obj = await materializeObject(client, 'o', { discoveryQuery: 'my custom query' });
  assert.deepEqual(seen, ['my custom query']);
  assert.equal(typeof obj.doIt, 'function');
});

test('precise edges take priority over semantic search', async () => {
  let searched = false;
  const client = {
    async get_object() {
      return { object: { uuid: 'o', categoryPrototypeUuid: 'proto-1' }, propertiesByName: {} };
    },
    async get_assertions() {
      return [{ subject: 'proto-1', predicate: 'has_procedure', object: 'p-edge' }];
    },
    async get_procedure(uuid) {
      return { procedure: { uuid, title: 'From Edge' } };
    },
    async search_procedures() {
      searched = true;
      return [{ uuid: 'p-sem', title: 'From Search' }];
    },
  };
  const obj = await materializeObject(client, 'o');
  assert.equal(typeof obj.fromEdge, 'function');
  assert.equal(searched, false); // never fell through to semantic search
});

// ---- Layer 2: specialized functions on top of the client -------------------

test('inline opts.specialize attaches domain functions that use the client beneath', async () => {
  const client = makeFakeClient({ links: [], titles: {} });
  const obj = await materializeObject(client, 'obj-1', {
    specialize: {
      // `this` is the live object; `client` is the generic client beneath.
      shout(_client) {
        return this['Full Name'].toUpperCase();
      },
      async citations(client) {
        // delegates DOWN to the generic client
        return client.get_assertions({ subject: this.__ksg.prototypeUuid, predicate: 'has_procedure' });
      },
    },
  });
  assert.equal(typeof obj.shout, 'function');
  assert.equal(obj.shout(), 'MARIE CURIE');
  assert.deepEqual(obj.__specialized.sort(), ['citations', 'shout']);
  // it really reaches the client layer beneath
  const cites = await obj.citations({});
  assert.ok(Array.isArray(cites));
});

test('registered specialization attaches by type name (resolved from prototype)', async () => {
  clearSpecializations();
  const client = makeFakeClient({ links: [], titles: {} });
  client.get_prototype = async (uuid) => ({ prototype: { uuid, name: 'Scientist' } });

  defineSpecialization('Scientist', {
    greeting() {
      return `Dr. ${this['Full Name']}`;
    },
  });

  const obj = await materializeObject(client, 'obj-1');
  assert.equal(obj.__type, 'Scientist');
  assert.equal(typeof obj.greeting, 'function');
  assert.equal(obj.greeting(), 'Dr. Marie Curie');
  clearSpecializations();
});

test('a specialization overrides a graph-derived method (top layer wins)', async () => {
  const state = { links: ['proc-1'], titles: { 'proc-1': 'Send Welcome Email' } };
  const obj = await materializeObject(makeFakeClient(state), 'obj-1', {
    specialize: {
      sendWelcomeEmail() {
        return 'overridden by specialization';
      },
    },
  });
  assert.equal(await obj.sendWelcomeEmail(), 'overridden by specialization');
});
