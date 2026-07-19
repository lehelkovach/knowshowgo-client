// The layered abstraction stack, end to end:
//   Layer 0  the client            generic graph: concepts/categories/objects/assertions
//   Layer 1  materializeObject     a generic node "becomes objective": typed props + graph methods
//   Layer 2  specialize            hand-written domain functions on top, using the client beneath
//
// Run a KSG service first:  PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start
// Then:                     node scripts/layered_demo.mjs
import { KnowShowGoClient, materializeObject, defineSpecialization } from '../js/index.js'; // pragma: allowlist secret

const baseUrl = process.env.KSG_API_URL || 'http://localhost:3000'; // pragma: allowlist secret
const client = new KnowShowGoClient({ baseUrl }); // pragma: allowlist secret  (Layer 0)
const pick = (...v) => v.find((x) => typeof x === 'string' && x);

async function main() {
  // --- Layer 0: generic graph primitives -----------------------------------
  const cat = await client.create_object_category({
    name: `Scientist-${Date.now()}`,
    properties: [{ name: 'Full Name', valueType: 'string' }, { name: 'Age', valueType: 'number' }],
  });
  const prototypeUuid = pick(cat.categoryPrototypeUuid, cat.prototypeUuid, cat.uuid);
  const proc = await client.create_procedure({ title: 'Send Welcome Email', steps: [{ title: 'greet', tool: 'noop' }] });
  const procUuid = pick(proc.procedure_uuid, proc.uuid);
  await client.create_assertion({ subject: prototypeUuid, predicate: 'has_procedure', obj: procUuid });
  const obj = await client.upsert_object({
    title: 'Marie Curie',
    category_prototype_uuid: prototypeUuid,
    properties: [{ name: 'Full Name', value: 'Marie Curie', valueType: 'string' }, { name: 'Age', value: '56', valueType: 'number' }],
  });
  const objUuid = pick(obj.object && obj.object.uuid, obj.uuid);
  console.log('Layer 0 (client): seeded prototype + procedure + object', objUuid.slice(0, 8));

  // --- Layer 2: register a specialization for this type ---------------------
  // These are ordinary domain functions. `this` is the live object; the second
  // argument is the generic client beneath — specialization never forks it.
  defineSpecialization('Scientist', {
    displayName() {
      return `Dr. ${this['Full Name']} (${this.Age})`;
    },
    async linkedProcedures(client) {
      const links = await client.get_assertions({ subject: this.__ksg.prototypeUuid, predicate: 'has_procedure' });
      return links.map((a) => a.object);
    },
  });

  // --- Layer 1: materialize (becomes objective) -----------------------------
  const scientist = await materializeObject(client, objUuid, { typeName: 'Scientist' });

  console.log('\nLayer 1 (materialize): live object');
  console.log('  properties :', JSON.stringify({ 'Full Name': scientist['Full Name'], Age: scientist.Age }), '  (Age is a', typeof scientist.Age + ')');
  console.log('  graph methods:', Object.keys(scientist.__methods));

  console.log('\nLayer 2 (specialized functions using the client beneath):');
  console.log('  scientist.displayName()      ->', scientist.displayName());
  console.log('  scientist.linkedProcedures() ->', await scientist.linkedProcedures(), '(fetched via the client)');

  console.log('\nOne stack: specialized fn -> materialized object -> client -> graph.');
}

main().catch((e) => {
  console.error('DEMO FAILED:', e);
  process.exit(1);
});
