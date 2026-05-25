import { KnowShowGoClient } from '../src/index.js';

const ksg = new KnowShowGoClient({
  baseUrl: process.env.KSG_API_URL || 'http://localhost:3000'
});

const category = await ksg.create_category({
  name: 'ProcedureExample',
  properties: [{ name: 'purpose', type: 'string' }]
});

const object = await ksg.upsert_object({
  categoryPrototypeUuid: category.categoryPrototypeUuid,
  title: 'Invoice submission helper',
  tags: ['#[invoice submission helper]'],
  knowledgeKind: 'fact',
  properties: [{ name: 'purpose', type: 'string', value: 'Submit invoices' }]
});

const procedure = await ksg.create_procedure({
  title: 'Submit invoice',
  steps: [
    { title: 'Open portal', tool: 'browser.open', payload: { url: 'https://portal.example' } },
    { title: 'Click submit', tool: 'browser.click', payload: { selector: '#submit' } }
  ],
  dependencies: [[0, 1]]
});

console.log({
  objectUuid: object.objectUuid,
  procedureUuid: procedure.procedure_uuid
});

