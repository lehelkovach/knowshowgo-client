/**
 * `search_concepts` against a real KSG service — no mocked transport.
 *
 * This suite exists because of a bug the mocked unit tests structurally cannot
 * see. The SDK defaulted `similarity_threshold` to 0.7, which was harmless for
 * as long as the server accepted the parameter and dropped it. Once the server
 * began applying it, the default filtered out every text-path hit — both
 * backends score those a constant 0.5 — so `search_concepts` returned an empty
 * array for an ordinary query against a corpus that plainly contained the
 * answer. 114 green unit tests reported nothing, because they assert the
 * request the client builds rather than what comes back.
 *
 * It also pins the type-intersect-value claim, which drifted the other way: the
 * client's own notes said `prototype_filter` was "accepted by the server, not
 * enforced". It is enforced.
 *
 * Skips when no service is reachable, rather than failing, so the offline gate
 * stays runnable. Point it at one with:
 *   KSG_LIVE_URL=http://127.0.0.1:3000 node --test js/search_concepts_live.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { KnowShowGoClient } from './client.js';

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

const TOOL = `LiveTool_${suffix}`;
const ANIMAL = `LiveAnimal_${suffix}`;

const names = (rows) => (rows || [])
  .map((r) => r.props?.name || r.props?.label || r.name)
  .filter(Boolean);

let seeded = false;
async function seed() {
  if (seeded) return;
  await client.create_object_category({ name: TOOL, description: 'hand tools' });
  await client.create_object_category({ name: ANIMAL, description: 'sea animals' });
  await client.upsert_object({
    title: `hammer ${suffix}`,
    category_name: TOOL,
    properties: [{ propertyName: 'use', type: 'string', value: 'driving nails' }],
  });
  await client.upsert_object({
    title: `hammerhead shark ${suffix}`,
    category_name: ANIMAL,
    properties: [{ propertyName: 'habitat', type: 'string', value: 'coastal water' }],
  });
  seeded = true;
}

test('the default threshold finds a concept that is present', { skip: !live }, async () => {
  await seed();
  // No options at all — the shape every caller reaches for first. With the old
  // 0.7 default this came back empty against a corpus containing the answer.
  const hits = await client.search_concepts(`hammer ${suffix}`);
  assert.ok(hits.length > 0, 'default search_concepts returned nothing for a stored concept');
  assert.ok(
    names(hits).some((n) => n.includes('hammer')),
    `expected a hammer among ${JSON.stringify(names(hits))}`
  );
});

test('an explicit floor still filters, so the default is not just ignored', { skip: !live }, async () => {
  await seed();
  const unfiltered = await client.search_concepts(`hammer ${suffix}`, { top_k: 20 });
  assert.ok(unfiltered.length > 0);
  // Cosine cannot exceed 1, so this floor is unreachable by construction rather
  // than by guessing at the corpus.
  const floored = await client.search_concepts(`hammer ${suffix}`, {
    top_k: 20,
    similarity_threshold: 2,
  });
  assert.equal(floored.length, 0, 'an unreachable floor should return nothing');
});

test('prototype_filter constrains by type: type-intersect-value is one call', { skip: !live }, async () => {
  await seed();
  const tools = names(await client.search_concepts('hammer', { top_k: 20, prototype_filter: TOOL }));
  const animals = names(await client.search_concepts('hammer', { top_k: 20, prototype_filter: ANIMAL }));

  assert.ok(tools.some((n) => /^hammer/.test(n)), `expected the hammer in ${JSON.stringify(tools)}`);
  assert.ok(!tools.some((n) => /shark/i.test(n)), `shark leaked into the tool filter: ${JSON.stringify(tools)}`);
  assert.ok(animals.some((n) => /shark/i.test(n)), `expected the shark in ${JSON.stringify(animals)}`);
});

test('a prototype that does not exist returns nothing, not everything', { skip: !live }, async () => {
  await seed();
  const rows = await client.search_concepts('hammer', {
    top_k: 20,
    prototype_filter: `NoSuchType_${suffix}`,
  });
  assert.equal(rows.length, 0);
});
