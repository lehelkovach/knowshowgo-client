// End-to-end demo: build a prototype + procedure + object in a live KSG service,
// then dynamically materialize the object into a live JS object whose method
// name comes from the linked procedure (no hardcoded function names).
//
// Run a KSG service first:  PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start
// Then:                     node scripts/materialize_demo.mjs
import { KnowShowGoClient, materializeObject } from '../js/index.js'; // pragma: allowlist secret

const baseUrl = process.env.KSG_API_URL || 'http://localhost:3000'; // pragma: allowlist secret
const client = new KnowShowGoClient({ baseUrl }); // pragma: allowlist secret
const pick = (...vals) => vals.find((v) => typeof v === 'string' && v);

async function main() {
  // 1. Prototype (object category) with typed properties.
  const catRes = await client.create_object_category({
    name: `Scientist-${Date.now()}`,
    description: 'A researcher',
    properties: [
      { name: 'Full Name', valueType: 'string' },
      { name: 'Age', valueType: 'number' },
    ],
  });
  const prototypeUuid = pick(catRes.categoryPrototypeUuid, catRes.prototypeUuid, catRes?.category?.uuid, catRes.uuid);
  console.log('prototype:', prototypeUuid);

  // 2. A procedure — its TITLE is the only source of the future method name.
  const procRes = await client.create_procedure({
    title: 'Send Welcome Email',
    description: 'Greets the scientist',
    steps: [{ title: 'greet', tool: 'noop' }],
  });
  const procUuid = pick(procRes.procedure_uuid, procRes?.procedure?.uuid, procRes.uuid, procRes.procedureUuid);
  console.log('procedure:', procUuid, '"Send Welcome Email"');

  // 3. Link prototype -> procedure in KSG (has_procedure).
  await client.create_assertion({ subject: prototypeUuid, predicate: 'has_procedure', obj: procUuid });

  // 4. An object typed by the prototype, with real data.
  const objRes = await client.upsert_object({
    title: 'Marie Curie',
    category_prototype_uuid: prototypeUuid,
    properties: [
      { name: 'Full Name', value: 'Marie Curie', valueType: 'string' },
      { name: 'Age', value: '56', valueType: 'number' },
    ],
  });
  const objUuid = pick(objRes?.object?.uuid, objRes.uuid, objRes.objectUuid);
  console.log('object:', objUuid);

  // 5. Dynamically materialize — nothing about "Scientist" or "sendWelcomeEmail"
  //    is hardcoded here; it all comes from KSG.
  const obj = await materializeObject(client, objUuid);

  console.log('\n--- materialized live JS object ---');
  console.log('properties:', JSON.stringify(obj));
  console.log('Age is a', typeof obj.Age, '=', obj.Age);
  console.log('methods from prototype:', Object.keys(obj.__methods));

  const method = Object.keys(obj.__methods)[0];
  console.log(`\ncalling obj.${method}() ...`);
  const result = await obj[method]({ tone: 'warm' });
  console.log('result:', JSON.stringify({ procedure: result.procedure, boundTo: result.boundTo, args: result.args }));
}

main().catch((e) => {
  console.error('DEMO FAILED:', e);
  process.exit(1);
});
