#!/usr/bin/env node
/**
 * Live smoke against KSG server dev contract using KnowShowGoClient.
 * Run: KSG_BASE_URL=http://127.0.0.1:3000 node scripts/live-contract-smoke.js
 */

import assert from 'node:assert/strict';
import { KnowShowGoClient } from '../js/client.js';

const baseUrl = (process.env.KSG_BASE_URL || '').replace(/\/+$/, '');
if (!baseUrl) {
  console.error('Set KSG_BASE_URL to a running KSG dev service');
  process.exit(1);
}

const client = new KnowShowGoClient({ baseUrl });
const runId = `client-smoke-${Date.now()}`;

async function main() {
  const manifest = await client.connect({ expected_channel: 'dev', expected_release: 'v0.2.3-dev' });
  assert.equal(manifest.channel, 'dev');
  assert.ok(manifest.surfaces.clientContract.length >= 60);
  console.log('ok release handshake');

  const topic = await client.create_topic({
    label: `Smoke ${runId}`,
    phrase: `#[${runId}]`,
    summary: 'client live smoke'
  });
  assert.ok(topic.uuid);
  console.log('ok create_topic');

  const category = await client.upsert_object_category({
    name: `SmokeCat${runId.replace(/[^a-zA-Z0-9]/g, '')}`,
    category_lineage_key: `cat:${runId}`,
    properties: [{ name: 'status', type: 'string', required: true }]
  });
  assert.ok(category.categoryPrototypeUuid);
  console.log('ok upsert_object_category');

  const object = await client.upsert_object({
    category_prototype_uuid: category.categoryPrototypeUuid,
    title: `Smoke object ${runId}`,
    object_lineage_key: `obj:${runId}`,
    properties: [{ name: 'status', type: 'string', value: 'ok' }]
  });
  assert.ok(object.objectUuid);
  console.log('ok upsert_object');

  const resolved = await client.resolve_object({
    object_lineage_key: `obj:${runId}`,
    category_prototype_uuid: category.categoryPrototypeUuid
  });
  assert.equal(resolved.objectUuid, object.objectUuid);
  console.log('ok resolve_object alias');

  const suggest = await client.suggest_concept_objects({ text: runId, top_k: 3 });
  assert.ok(Array.isArray(suggest.suggestions));
  console.log('ok suggest_concept_objects');

  await client.seed_osl_agent();
  console.log('ok seed_osl_agent');

  console.log(`\nclient live smoke passed (${runId})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
