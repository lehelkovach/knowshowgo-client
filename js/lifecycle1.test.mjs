/**
 * LIFECYCLE1 (2026-11-17): the SDK never hands over a candidate or a retired
 * procedure as trusted.
 *
 * KSG's one lifecycle is candidate → validated → promoted, and retired from
 * any of them (osl-oc-agent procedure-ir.md Part 2), computed from run marks.
 * A `verified` status is not trust: since IR-S3 a procedure verified only by
 * the page is a candidate. The server (knowshowgo LIFECYCLE1) labels every
 * search hit `trusted` (validated or promoted) and takes `include: 'trusted'`.
 *
 * - `search_procedures` and `search_verified_procedures` ask for `trusted` by
 *   default (was `verified`; the old values still work).
 * - Asking for `trusted` alone, a hit that is not trusted is dropped on the
 *   client too, so a server that does not know `trusted` yet (it reads it as
 *   `verified`) still never hands a candidate over as trusted. Every hit
 *   carries `trusted`, computed from `state` when the server sent none.
 * - `get_procedure_lifecycle(uuid)` reads one procedure's lifecycle from
 *   `GET /procedures/:uuid?source=dagjson` (no graph compile), falling back to
 *   the full read for a procedure stored without a dagJson.
 *
 * Node's built-in test runner. Transport mocked; no server. Run-time budget
 * asserted per test (LIFECYCLE1_BUDGET_MS). Fake data only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Measured n=5 runs of this file (see the PR): budget = max(250 ms floor, 3 × median).
const LIFECYCLE1_BUDGET_MS = 250;
const BASE = 'https://ksg.example.test';
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function loadClientClass() {
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).KnowShowGoClient;
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (String(n).toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

/** A client whose fetch records each call and answers `reply(call)` (a payload or [payload, status]). */
async function recordingClient(reply) {
  const KnowShowGoClient = await loadClientClass();
  const calls = [];
  const fetchImpl = async (url, init) => {
    const call = { url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const out = reply(call);
    return Array.isArray(out) ? jsonResponse(out[0], out[1]) : jsonResponse(out);
  };
  return { client: new KnowShowGoClient({ baseUrl: BASE, fetchImpl }), calls };
}

const timed = (fn) => async () => {
  const t0 = performance.now();
  await fn();
  const ms = performance.now() - t0;
  assert.ok(ms < LIFECYCLE1_BUDGET_MS, `run-time budget: took ${Math.round(ms)} ms, budget ${LIFECYCLE1_BUDGET_MS} ms`);
};

// A server older than LIFECYCLE1 reads `trusted` as `verified`: every hit is
// verified-status, with `state` (IR-S1) but no `trusted` label.
const OLD_SERVER_HITS = [
  { uuid: U(1), status: 'verified', state: 'promoted' },
  { uuid: U(2), status: 'verified', state: 'validated' },
  { uuid: U(3), status: 'verified', state: 'candidate', legacy: true },
  { uuid: U(4), status: 'verified', state: 'candidate' },
  { uuid: U(5), status: 'verified' }
];

test('search_procedures asks for trusted by default', timed(async () => {
  const { client, calls } = await recordingClient(() => ({ results: [], scanned: 0, include: ['trusted'], excluded: {} }));
  await client.search_procedures('register a supplier');
  assert.equal(calls[0].url, `${BASE}/api/procedures/search`);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { query: 'register a supplier', topK: 5, include: 'trusted' });
}));

test('search_procedures: an explicit include is still sent as given (KSG-L1 values unchanged)', timed(async () => {
  const { client, calls } = await recordingClient(() => ({ results: [] }));
  await client.search_procedures('x', { include: 'verified' });
  await client.search_procedures('x', { include: ['trusted', 'retired'] });
  await client.search_procedures('x', { include: 'all' });
  assert.deepEqual(calls.map((c) => c.body.include), ['verified', 'trusted,retired', 'all']);
}));

test('search_procedures (trusted) never returns a candidate, even from a server that ignores trusted', timed(async () => {
  const { client } = await recordingClient(() => ({ results: OLD_SERVER_HITS, scanned: 5, include: ['verified'], excluded: {} }));
  const results = await client.search_procedures('register a supplier');
  assert.deepEqual(results.map((r) => [r.uuid, r.state, r.trusted]), [[U(1), 'promoted', true], [U(2), 'validated', true]]);
}));

test('search_procedures keeps the server\'s trusted label and labels opt-in hits that lack one', timed(async () => {
  const hits = [
    { uuid: U(1), status: 'verified', state: 'validated', trusted: true },
    { uuid: U(6), status: 'retired', state: 'retired' },
    { uuid: U(7), status: 'draft', state: 'candidate', trusted: false }
  ];
  const { client } = await recordingClient(() => ({ results: hits }));
  const results = await client.search_procedures('x', { include: ['trusted', 'retired', 'drafts'] });
  assert.deepEqual(results.map((r) => [r.uuid, r.trusted]), [[U(1), true], [U(6), false], [U(7), false]]);
  const all = await client.search_procedures('x', { include: 'all' });
  assert.equal(all.find((r) => r.uuid === U(6)).trusted, false);
}));

test('search_verified_procedures asks for trusted by default and drops untrusted hits an old server sends', timed(async () => {
  const { client, calls } = await recordingClient(() => ({ ok: true, query: { goal: 'register a supplier', include: ['verified'] }, results: OLD_SERVER_HITS.map((h) => ({ ...h, id: h.uuid })), excluded: { draft: 0, retired: 0, otherSite: 0 }, scanned: 5 }));
  const out = await client.search_verified_procedures({ goal: 'register a supplier' });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api2.0/procedures/search');
  assert.equal(url.searchParams.get('include'), 'trusted');
  assert.deepEqual(out.results.map((r) => [r.id, r.trusted]), [[U(1), true], [U(2), true]]);
  // What the client left out is counted where the server counts it.
  assert.equal(out.excluded.candidate, 3);
}));

test('search_verified_procedures: include verified / all are sent as given and every hit is labelled', timed(async () => {
  const { client, calls } = await recordingClient(() => ({ ok: true, results: OLD_SERVER_HITS.map((h) => ({ ...h, id: h.uuid })), excluded: {} }));
  const out = await client.search_verified_procedures({ goal: 'x', include: 'verified' });
  assert.equal(new URL(calls[0].url).searchParams.get('include'), 'verified');
  assert.equal(out.results.length, 5);
  assert.deepEqual(out.results.map((r) => r.trusted), [true, true, false, false, false]);
}));

test('get_procedure_lifecycle reads GET /procedures/:uuid?source=dagjson and returns the one-set state', timed(async () => {
  const currentVersion = { uuid: U(31), version: 2, state: 'validated', stateBasis: 'runs' };
  const promotion = { eligible: false, independentVerifiedRuns: 1, sites: 1, recentFailures: 0, needsPerson: false, personVerified: false };
  const lifecycle = { status: 'verified', active: true, draftReason: null, verifiedBy: 'tool', verifiedAt: '2026-11-17T00:00:00Z', retiredAt: null, retiredReason: null, failures: [], state: 'validated', promotion, currentVersion };
  const { client, calls } = await recordingClient(() => ({ id: U(30), steps: [], status: 'verified', state: 'validated', lifecycle, runs: [{ id: 'r1' }] }));
  const out = await client.get_procedure_lifecycle(U(30));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, `${BASE}/api2.0/procedures/${U(30)}?source=dagjson`);
  assert.deepEqual(out, {
    procedureId: U(30), status: 'verified', state: 'validated', trusted: true, legacy: false, legacyReason: null,
    promotion, validation: null, currentVersion, runCount: 1, lifecycle
  });
}));

test('get_procedure_lifecycle: a candidate or retired procedure is never trusted', timed(async () => {
  for (const [state, status, extra] of [['candidate', 'verified', { legacy: true, legacyReason: 'saved with no verdict and verified since only by the page' }], ['candidate', 'draft', {}], ['retired', 'retired', {}]]) {
    const { client } = await recordingClient(() => ({ id: U(30), status, state, lifecycle: { status, state, ...extra }, runs: [] }));
    const out = await client.get_procedure_lifecycle(U(30));
    assert.equal(out.trusted, false, `${status}/${state}`);
    assert.equal(out.state, state);
    assert.equal(out.legacy, Boolean(extra.legacy));
  }
}));

test('get_procedure_lifecycle falls back to the full read when the procedure has no dagJson', timed(async () => {
  const { client, calls } = await recordingClient((call) => (call.url.includes('source=dagjson')
    ? [{ error: 'Procedure not found' }, 404]
    : { id: U(30), status: 'verified', state: 'promoted', lifecycle: { status: 'verified', state: 'promoted' }, runs: [] }));
  const out = await client.get_procedure_lifecycle(U(30));
  assert.deepEqual(calls.map((c) => c.url), [`${BASE}/api2.0/procedures/${U(30)}?source=dagjson`, `${BASE}/api2.0/procedures/${U(30)}`]);
  assert.equal(out.state, 'promoted');
  assert.equal(out.trusted, true);
}));

test('get_procedure_lifecycle: a missing procedure still throws 404; no uuid throws before any request', timed(async () => {
  const { client, calls } = await recordingClient(() => [{ error: 'Procedure not found' }, 404]);
  await assert.rejects(client.get_procedure_lifecycle(U(99)), (e) => e.status === 404);
  assert.equal(calls.length, 2);
  assert.throws(() => client.get_procedure_lifecycle(''), /procedure_uuid is required/);
}));

test('the package entry exports TRUSTED_PROCEDURE_STATES', timed(async () => {
  const pkg = await import('./index.js');
  assert.deepEqual([...pkg.TRUSTED_PROCEDURE_STATES], ['validated', 'promoted']);
  assert.ok(Object.isFrozen(pkg.TRUSTED_PROCEDURE_STATES));
}));
