/**
 * LIFECYCLE1 against a real KSG service (no mocked transport): a retired or
 * candidate procedure never comes back as trusted through the SDK.
 *
 * Six procedures, one per evidence shape (promoted: three independent runs on
 * two sites; validated: one tool run; a candidate verified only by the page on
 * its origin run; a legacy candidate (a page verification without the IR-S3
 * origin key); a draft; a retired one). Then the SDK's default searches, both
 * routes, and `get_procedure_lifecycle` on each.
 *
 * Skips when no service is reachable, so the offline gate stays runnable:
 *   KSG_LIVE_URL=http://127.0.0.1:3000 node --test js/lifecycle1_live.test.mjs
 * Needs a server with LIFECYCLE1 (knowshowgo #510). Fake data only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { KnowShowGoClient } from './client.js';

// Measured n=5 against a local in-memory KSG (see the PR): budget = max(2000 ms floor, 3 × median).
const LIVE_BUDGET_MS = 2000;
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
const owner = `lifecycle1-live-${suffix}`;
const client = new KnowShowGoClient({ baseUrl: BASE_URL, defaultOwnerUserId: owner });
const QUERY = `register contoso supplier portal ${suffix}`;
const EXPECTED = { promoted: 'promoted', validated: 'validated', bornCandidate: 'candidate', legacyCandidate: 'candidate', draft: 'candidate', retired: 'retired' };
const ids = {};

async function rest(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, { method, headers: { 'content-type': 'application/json', 'x-ksg-owner': owner }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  assert.ok(res.status < 300, `${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

const nameOf = (uuid) => Object.keys(ids).find((k) => ids[k] === uuid);
const ours = (results) => results.filter((r) => nameOf(r.uuid || r.id));

test('setup: six procedures, one per evidence shape', { skip }, async () => {
  for (const label of Object.keys(EXPECTED)) {
    const made = await rest('POST', '/api/procedures', {
      goal: `${QUERY} ${label}`,
      site: 'https://portal.contoso.example.test/register',
      steps: [{ id: 'open', title: 'Open the registration form', tool: 'web.nav', payload: { url: 'https://portal.contoso.example.test/register' } }]
    });
    ids[label] = made.id;
  }
  await client.record_procedure_run(ids.promoted, { ok: true, verified_by: 'tool', site: 'https://a.example.test' });
  await client.record_procedure_run(ids.promoted, { ok: true, verified_by: 'email', evidence: 'confirmation CNF-1001', site: 'https://b.example.test' });
  await client.record_procedure_run(ids.promoted, { ok: true, verified_by: 'api', evidence: 'record REC-2002', site: 'https://a.example.test' });
  await client.record_procedure_run(ids.validated, { ok: true, verified_by: 'tool' });
  await rest('POST', `/api/procedures/${ids.bornCandidate}/runs`, { ok: true, verifiedBy: 'page', origin: true });
  await rest('POST', '/api/assertions', { subject: ids.legacyCandidate, predicate: 'verification', object: JSON.stringify({ at: new Date().toISOString(), seq: Date.now() * 1000 + 1, status: 'verified', by: 'the page confirmed it' }), source: 'agent' });
  await client.record_procedure_run(ids.retired, { ok: true, verified_by: 'page' });
  await client.record_procedure_run(ids.retired, { ok: false, failure: 'the submit button moved' });
  const last = await client.record_procedure_run(ids.retired, { ok: false, failure: 'the submit button moved' });
  assert.equal(last.status, 'retired');
});

test('get_procedure_lifecycle returns KSG\'s state for each, trusted only when validated or promoted', { skip }, async () => {
  const t0 = performance.now();
  for (const [label, state] of Object.entries(EXPECTED)) {
    const lc = await client.get_procedure_lifecycle(ids[label]);
    assert.deepEqual({ label, state: lc.state, trusted: lc.trusted }, { label, state, trusted: ['validated', 'promoted'].includes(state) });
  }
  assert.equal((await client.get_procedure_lifecycle(ids.legacyCandidate)).legacy, true);
  assert.ok(performance.now() - t0 < LIVE_BUDGET_MS, `run-time budget ${LIVE_BUDGET_MS} ms`);
});

test('search_procedures (default) returns the trusted ones and never a candidate or retired one', { skip }, async () => {
  const t0 = performance.now();
  const results = await client.search_procedures(QUERY, { top_k: 20 });
  assert.ok(results.every((r) => r.trusted === true && ['validated', 'promoted'].includes(r.state)), 'every hit trusted');
  assert.deepEqual(ours(results).map((r) => nameOf(r.uuid)).sort(), ['promoted', 'validated']);
  assert.ok(performance.now() - t0 < LIVE_BUDGET_MS, `run-time budget ${LIVE_BUDGET_MS} ms`);
});

test('search_verified_procedures (default) does the same; include all returns every state, labelled', { skip }, async () => {
  const t0 = performance.now();
  const out = await client.search_verified_procedures({ goal: QUERY, limit: 20 });
  assert.deepEqual(ours(out.results).map((r) => nameOf(r.id)).sort(), ['promoted', 'validated']);
  assert.ok(out.results.every((r) => r.trusted === true));
  const all = await client.search_procedures(QUERY, { top_k: 20, include: 'all' });
  assert.deepEqual(ours(all).map((r) => nameOf(r.uuid)).sort(), Object.keys(EXPECTED).sort());
  for (const r of ours(all)) assert.equal(r.trusted, ['validated', 'promoted'].includes(EXPECTED[nameOf(r.uuid)]), nameOf(r.uuid));
  assert.ok(performance.now() - t0 < LIVE_BUDGET_MS, `run-time budget ${LIVE_BUDGET_MS} ms`);
});
