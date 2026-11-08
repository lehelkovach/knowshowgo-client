/**
 * The server-parity methods against a real KSG service — no mocked transport.
 *
 * `server_parity.test.mjs` pins each request and response shape as read from
 * the server source. This suite sends them to a running server and checks the
 * round trip: facts confirmed and corrected, procedure runs attributed to a
 * version and evaluated, rules created and checked, events recorded and
 * recalled.
 *
 * Skips when no service is reachable, so the offline gate stays runnable:
 *   KSG_LIVE_URL=http://127.0.0.1:3000 node --test js/server_parity_live.test.mjs
 * All names and values are fictional.
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
const skip = !live && `no KSG service at ${BASE_URL}`;
const suffix = Date.now().toString(36);
const owner = `live-parity-owner-${suffix}`;
const client = new KnowShowGoClient({ baseUrl: BASE_URL, defaultOwnerUserId: owner });

async function concept(title) {
  const out = await client.upsert_object({
    title,
    category_name: 'Concept',
    object_lineage_key: `live-parity:${suffix}:${title}`,
    summary: 'live parity fixture',
    private: true
  });
  assert.ok(out.objectUuid, `upsert_object returned no uuid: ${JSON.stringify(out).slice(0, 200)}`);
  return out.objectUuid;
}

test('facts: add a candidate, confirm it, correct it; the corrected one refuses confirm', { skip }, async () => {
  const subject = `Northwind Robotics ${suffix}`;
  const added = await client.add_fact({ subject, predicate: 'supplier_id', obj: 'NW-0001', provenance: { source: 'live-test' } });
  assert.equal(added.fact.status, 'candidate');
  const confirmed = await client.confirm_fact(added.fact.id, { by: 'person' });
  assert.equal(confirmed.fact.status, 'confirmed');
  assert.equal((await client.get_fact(added.fact.id)).fact.status, 'confirmed');
  const corrected = await client.correct_fact(added.fact.id, { obj: 'NW-0002' });
  assert.equal(corrected.fact.object, 'NW-0002');
  assert.equal(corrected.corrected.status, 'corrected');
  await assert.rejects(client.confirm_fact(added.fact.id), (err) => err.status === 409);
  const listed = await client.list_facts({ subject, include: 'all' });
  assert.equal(listed.total, 2);
});

test('procedure runs and versions: a run lands on the version that ran, versions carry state, evaluation per version', { skip }, async () => {
  const proc = await client.create_procedure({
    title: `Register supplier ${suffix}`,
    steps: [{ title: 'open portal', tool: 'navigate', payload: { url: 'https://portal.example.test' } }]
  });
  const procedureUuid = proc.procedure_uuid || proc.uuid || proc.procedureUuid;
  assert.ok(procedureUuid, `create_procedure returned no uuid: ${JSON.stringify(proc).slice(0, 200)}`);

  // create_procedure already writes a first version, so this one's number is read, not assumed.
  const v1 = await client.create_procedure_version(procedureUuid, { status: 'draft' });
  const n = v1.procedureVersion.version;
  assert.equal(v1.procedureVersion.status, 'draft');
  assert.equal(v1.procedureVersion.state, 'candidate');
  assert.equal(v1.procedureVersion.statusDeprecated, true);

  const run = await client.record_procedure_run(procedureUuid, { ok: true, verified_by: 'oracle', site: 'portal.example.test', version: n, held_out: true });
  assert.equal(run.run.versionUuid, v1.procedureVersion.uuid);
  assert.equal(run.run.heldOut, true);
  assert.equal(run.status, 'verified');
  await assert.rejects(client.record_procedure_run(procedureUuid, { ok: true, version: 99 }), (err) => err.status === 400);

  const runs = await client.list_procedure_runs(procedureUuid);
  assert.equal(runs.currentVersion.uuid, v1.procedureVersion.uuid);
  assert.equal(runs.currentVersion.state, 'validated');
  assert.equal(runs.runs.length, 1);

  const v2 = await client.create_procedure_version(procedureUuid, {});
  const listed = await client.list_procedure_versions(procedureUuid);
  assert.equal(listed.count, n + 1);
  const byNumber = await client.get_procedure_version_by_number(procedureUuid, n);
  assert.equal(byNumber.procedureVersion.state, 'retired');
  assert.equal(byNumber.procedureVersion.stateBasis, 'superseded');
  assert.equal(byNumber.procedureVersion.status, 'draft');
  assert.equal((await client.get_procedure_version(v2.procedureVersion.uuid)).procedureVersion.version, n + 1);

  const evaluation = await client.get_procedure_evaluation(procedureUuid);
  const newest = evaluation.versions[0];
  const older = evaluation.versions.find((v) => v.uuid === v1.procedureVersion.uuid);
  assert.equal(newest.uuid, v2.procedureVersion.uuid);
  assert.equal(newest.regression.tested, false);
  assert.equal(older.stats.runs, 1);
  assert.equal(older.stats.verifiedSuccesses, 1);
  assert.equal(older.stats.interval.method, 'wilson');

  const moved = await client.transition_procedure_version(v2.procedureVersion.uuid, { status: 'dogfood', reason: 'live test' });
  assert.equal(moved.procedureVersion.status, 'dogfood');
  await assert.rejects(client.transition_procedure_version(v2.procedureVersion.uuid, { status: 'dogfood' }), (err) => err.status === 409);
});

test('rules: create, list, read, check a member, disable, apply refuses', { skip }, async () => {
  const posting = `LivePosting${suffix}`;
  const scam = `LiveScam${suffix}`;
  const vocab = { [posting]: await concept(posting), [scam]: await concept(scam) };
  const P = { kind: 'Variable', name: 'p' };
  const one = (label) => ({ kind: 'Predicate', predicate: { kind: 'ConceptRef', uuid: vocab[label] }, args: [P] });
  const ir = { logicIrVersion: '0.0.1', kind: 'ForAll', variable: P, body: { kind: 'Implies', if: one(posting), then: { kind: 'Not', of: one(scam) } } };

  const created = await client.create_rule({ name: `No scams ${suffix}`, ir, description: 'live test', provenance: { source: 'live-test' } });
  assert.ok(created.ruleUuid);
  assert.ok((await client.list_rules()).rules.some((r) => r.uuid === created.ruleUuid));
  assert.equal((await client.get_rule(created.ruleUuid)).rule.enabled, true);

  const checked = await client.check_rules({
    rule_uuids: [created.ruleUuid],
    members: [{ subject: `Contoso Labs posting ${suffix}`, facts: [{ predicate: 'is_a', object: posting }, { predicate: 'is_a', object: scam, negated: true }] }]
  });
  assert.equal(checked.members[0].truth, 'true');
  assert.equal(checked.factsWritten, 2);

  const off = await client.set_rule_enabled(created.ruleUuid, false);
  assert.equal(off.enabled, false);
  await assert.rejects(client.apply_rule(off.ruleUuid), (err) => err.status === 409);
});

test('events: record into an episode, read back, find by role, recall by pattern', { skip }, async () => {
  const action = await concept(`deliver ${suffix}`);
  const agent = await concept(`Avery Example ${suffix}`);
  const recorded = await client.record_event({ action, roles: { agent }, observed_at: '2026-11-08', episode: { title: `Delivery day ${suffix}` } });
  assert.equal(recorded.created, true);
  const eventUuid = recorded.event.uuid;
  const episodeUuid = recorded.episode.uuid;

  assert.equal((await client.get_event(eventUuid)).event.roles.agent.uuid, agent);
  assert.ok((await client.get_episode(episodeUuid)).episode.events.some((e) => e.uuid === eventUuid));
  assert.ok((await client.find_events({ agent })).events.some((e) => e.uuid === eventUuid));

  const recalled = await client.recall_episodes({ pattern: [{ subject: '?e', predicate: 'agent', object: agent }], event_variable: '?e' });
  assert.ok(recalled.episodes.some((e) => e.episode.uuid === episodeUuid));

  await assert.rejects(client.record_event({ action, roles: { agent: '00000000-0000-4000-8000-00000000dead' } }), (err) => err.status === 422);
});
