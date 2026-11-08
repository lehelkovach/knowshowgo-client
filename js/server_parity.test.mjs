// Contract tests for the SDK catch-up to knowshowgo `dev` (server 0.2.42 + K1/K2,
// origin/dev 58d1f3b2): events and episodes, Logic IR rules, procedure runs,
// procedure versions and verified facts.
//
// The transport is mocked, so these pin the request each method sends and that
// the server's response shape comes back untouched. Every request and response
// shape below is copied from the server source; the file:line next to each test
// is where to look when the server changes. Paths are relative to the
// knowshowgo repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadClientClass() {
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return mod.KnowShowGoClient;
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

/** A client whose fetch records each call and answers with `reply(call)`. */
async function recordingClient(reply, options = {}) {
  const KnowShowGoClient = await loadClientClass();
  const calls = [];
  const fetchImpl = async (url, init) => {
    const call = {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : undefined
    };
    calls.push(call);
    const out = reply(call);
    return Array.isArray(out) ? jsonResponse(out[0], out[1]) : jsonResponse(out);
  };
  const client = new KnowShowGoClient({ baseUrl: 'https://ksg.example.test', fetchImpl, ...options });
  return { client, calls };
}

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BASE = 'https://ksg.example.test';

// ===== Events & episodes (KG10 / KG13) =====

// src/server/rest-api.js:6497 POST /events -> recordEvent (src/semantic_event/events.js:129);
// body keys action, roles, title, observedAt, episode, provenance, private (rest-api.js:6504-6510);
// 201 when created, else 200; response is loadEvent's shape (events.js:285) + created, reused, lineageKey.
test('record_event posts the KG10 body and returns the loaded event', async () => {
  const reply = {
    ok: true,
    eventsRevision: 'semantic-event@0.0.1',
    event: { uuid: U(9), title: 'protect(agent=Rex)', action: { uuid: U(1) }, roles: { agent: { uuid: U(2) } }, observedAt: '2026-11-01', episodes: [{ uuid: U(7) }] },
    consulted: { references: 2, roles: 2 },
    created: true,
    reused: false,
    lineageKey: 'event:abc',
    episode: { uuid: U(7), previousObjectUuid: null, events: [U(9)] }
  };
  const { client, calls } = await recordingClient(() => [reply, 201]);
  const out = await client.record_event({
    action: U(1),
    roles: { agent: U(2), beneficiary: U(3) },
    observed_at: '2026-11-01',
    episode: { title: 'Walk on 2026-11-01', source: 'note' },
    provenance: { source: 'test' },
    private: true
  });
  assert.deepEqual(out, reply);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `${BASE}/api2.0/events`);
  assert.deepEqual(calls[0].body, {
    action: U(1),
    roles: { agent: U(2), beneficiary: U(3) },
    observedAt: '2026-11-01',
    episode: { title: 'Walk on 2026-11-01', source: 'note' },
    provenance: { source: 'test' },
    private: true
  });
});

test('record_event sends only what was given and requires action', async () => {
  const { client, calls } = await recordingClient(() => ({ ok: true, event: { uuid: U(9) }, created: false, reused: true }));
  await client.record_event({ action: U(1), roles: { patient: U(4) } });
  assert.deepEqual(calls[0].body, { action: U(1), roles: { patient: U(4) } });
  assert.throws(() => client.record_event({ roles: { agent: U(2) } }), /action is required/);
});

// rest-api.js:6496 eventStatus: E002 UNRESOLVED_ROLE -> 422; refuse() shape at events.js:51.
test('record_event surfaces an unresolved role as a 422 error with the server body', async () => {
  const refusal = { ok: false, code: 'E002', eventsRevision: 'semantic-event@0.0.1', diagnostics: [{ code: 'E002', severity: 'error', message: 'agent: no concept with this uuid' }], unresolved: [{ role: 'agent', value: U(2), reason: 'no concept with this uuid' }] };
  const { client } = await recordingClient(() => [refusal, 422]);
  await assert.rejects(client.record_event({ action: U(1), roles: { agent: U(2) } }), (err) => {
    assert.equal(err.status, 422);
    assert.equal(err.body.code, 'E002');
    assert.equal(err.body.unresolved[0].role, 'agent');
    return true;
  });
});

// rest-api.js:6518 GET /events: each EVENT_ROLES name (events.js:36) is a query
// constraint, plus limit; findEvents (events.js:342) returns { ok, constraints, walked, events, count, complete, limit }.
test('find_events sends role constraints as query params', async () => {
  const reply = { ok: true, eventsRevision: 'semantic-event@0.0.1', constraints: { agent: U(2) }, walked: [{ role: 'agent', uuid: U(2), found: 1, complete: true }], events: [{ uuid: U(9) }], count: 1, complete: true, limit: 50 };
  const { client, calls } = await recordingClient(() => reply);
  const out = await client.find_events({ agent: U(2), action: U(1), limit: 50 });
  assert.deepEqual(out, reply);
  const url = new URL(calls[0].url);
  assert.equal(calls[0].method, 'GET');
  assert.equal(url.pathname, '/api2.0/events');
  assert.equal(url.searchParams.get('agent'), U(2));
  assert.equal(url.searchParams.get('action'), U(1));
  assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.get('patient'), null);
  // events.js:345 refuses an empty walk (E006); the SDK says so before the round trip.
  assert.throws(() => client.find_events({ limit: 5 }), /at least one role/);
});

// rest-api.js:6530 GET /events/:uuid and rest-api.js:6555 GET /episodes/:uuid
// (loadEvent events.js:263, loadEpisode events.js:306).
test('get_event and get_episode read by uuid', async () => {
  const { client, calls } = await recordingClient((call) =>
    call.url.includes('/episodes/')
      ? { ok: true, episode: { uuid: U(7), events: [{ uuid: U(9) }] } }
      : { ok: true, event: { uuid: U(9), episodes: [] } }
  );
  const ev = await client.get_event(U(9));
  const ep = await client.get_episode(U(7));
  assert.equal(ev.event.uuid, U(9));
  assert.equal(ep.episode.events[0].uuid, U(9));
  assert.equal(calls[0].url, `${BASE}/api2.0/events/${U(9)}`);
  assert.equal(calls[1].url, `${BASE}/api2.0/episodes/${U(7)}`);
  assert.throws(() => client.get_event(''), /uuid is required/);
  assert.throws(() => client.get_episode(null), /uuid is required/);
});

// rest-api.js:6543 POST /episodes/recall: body { pattern, eventVariable, limit };
// recallEpisodes (src/semantic_event/recall.js:74) returns { ok, pattern, query, eventVariable, episodes, events, count, complete, ... }.
test('recall_episodes posts the pattern and passes the recall back', async () => {
  const pattern = [
    { subject: '?dog', predicate: 'instance_of', object: U(11) },
    { subject: '?event', predicate: 'agent', object: '?dog' }
  ];
  const reply = { ok: true, recallRevision: 'episodic-recall@0.0.1', pattern, query: 'h1', eventVariable: 'event', episodes: [{ episode: { uuid: U(7) }, matches: [], ranking: { fuzzyBest: 1, matchCount: 1 } }], events: [], count: 1, complete: true, consulted: { text: false, edges: true } };
  const { client, calls } = await recordingClient(() => reply);
  const out = await client.recall_episodes({ pattern, event_variable: 'event', limit: 20 });
  assert.deepEqual(out, reply);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `${BASE}/api2.0/episodes/recall`);
  assert.deepEqual(calls[0].body, { pattern, eventVariable: 'event', limit: 20 });
  assert.throws(() => client.recall_episodes({}), /pattern is required/);
});

// ===== Logic IR rules (KG3 / KG5 / KG21) =====

// rest-api.js:6247 POST /logic-ir/rules: body name, ir, description, enabled, provenance;
// 201 with createRule's shape (src/logic_ir/rules.js:184): { ok, ruleUuid, version, reused, revision, enabled, rulesRevision, name, domain, variable }.
test('create_rule posts name and ir and returns the rule version', async () => {
  const ir = { kind: 'ForAll', variable: 'x', domain: U(20), body: { if: { kind: 'Atom' }, then: { kind: 'Atom' } } };
  const reply = { ok: true, ruleUuid: U(21), version: 1, reused: false, revision: 'r1', enabled: true, rulesRevision: 'logic-ir-rules@0.0.1', name: 'Northwind eligibility', domain: { uuid: U(20) }, variable: 'x' };
  const { client, calls } = await recordingClient(() => [reply, 201]);
  const out = await client.create_rule({ name: 'Northwind eligibility', ir, description: 'test rule', provenance: { source: 'mandate' } });
  assert.deepEqual(out, reply);
  assert.equal(calls[0].url, `${BASE}/api2.0/logic-ir/rules`);
  assert.deepEqual(calls[0].body, { name: 'Northwind eligibility', ir, description: 'test rule', provenance: { source: 'mandate' } });
  await client.create_rule({ name: 'off', ir, enabled: false });
  assert.equal(calls[1].body.enabled, false);
  assert.throws(() => client.create_rule({ ir }), /name is required/);
  assert.throws(() => client.create_rule({ name: 'x' }), /ir is required/);
});

// rest-api.js:6268 GET /logic-ir/rules -> listRules (rules.js:252) { ok, rulesRevision, rules };
// rest-api.js:6279 GET /logic-ir/rules/:uuid -> getRule (rules.js:198) + versions[] (rest-api.js:6285).
test('list_rules and get_rule read rules', async () => {
  const { client, calls } = await recordingClient((call) =>
    call.url.endsWith('/rules')
      ? { ok: true, rulesRevision: 'logic-ir-rules@0.0.1', rules: [{ uuid: U(21), name: 'a', enabled: true }] }
      : { ok: true, rule: { uuid: U(21), name: 'a', version: 2 }, versions: [{ uuid: U(22), version: 1 }, { uuid: U(21), version: 2 }] }
  );
  const listed = await client.list_rules();
  const one = await client.get_rule(U(21));
  assert.equal(listed.rules[0].uuid, U(21));
  assert.equal(one.versions.length, 2);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, `${BASE}/api2.0/logic-ir/rules`);
  assert.equal(calls[1].url, `${BASE}/api2.0/logic-ir/rules/${U(21)}`);
  assert.throws(() => client.get_rule(''), /rule_uuid is required/);
});

// rest-api.js:6291 POST /logic-ir/rules/:uuid/enabled: { enabled: boolean } or 400 (rest-api.js:6295).
test('set_rule_enabled posts a boolean and refuses anything else', async () => {
  const reply = { ok: true, ruleUuid: U(23), version: 3, enabled: false, revision: 'r1', previousUuid: U(21), name: 'a' };
  const { client, calls } = await recordingClient(() => reply);
  assert.deepEqual(await client.set_rule_enabled(U(21), false), reply);
  assert.equal(calls[0].url, `${BASE}/api2.0/logic-ir/rules/${U(21)}/enabled`);
  assert.deepEqual(calls[0].body, { enabled: false });
  assert.throws(() => client.set_rule_enabled(U(21), 'false'), /enabled must be a boolean/);
});

// rest-api.js:6313 POST /logic-ir/rules/check: body ruleUuids, members (subject
// string or { subject, facts }), record, provenance; checkRules (rules.js:478)
// result + factsWritten (rest-api.js:6371).
test('check_rules posts rule uuids and members', async () => {
  const members = ['Contoso Labs', { subject: 'Northwind Robotics', facts: [{ predicate: 'employees', object: 40 }] }];
  const reply = { ok: true, ruleCheckRevision: 'logic-ir-rule-check@0.0.1', rules: [{ ruleUuid: U(21) }], disabled: [], members: [{ member: 'Contoso Labs', truth: 'unknown', missing: [] }], factsWritten: 1 };
  const { client, calls } = await recordingClient(() => reply);
  const out = await client.check_rules({ rule_uuids: [U(21)], members, record: true });
  assert.deepEqual(out, reply);
  assert.equal(calls[0].url, `${BASE}/api2.0/logic-ir/rules/check`);
  assert.deepEqual(calls[0].body, { ruleUuids: [U(21)], members, record: true });
  assert.throws(() => client.check_rules({ members }), /rule_uuids is required/);
  assert.throws(() => client.check_rules({ rule_uuids: [U(21)] }), /members is required/);
});

// rest-api.js:6565 POST /logic-ir/rules/:uuid/apply: body domainLimit; applyRule (rules.js:323)
// returns { ok, rulesRevision, rule, domain, fired, skipped, conflicts, complete }; disabled -> 409 R002 (rest-api.js:6232).
test('apply_rule posts domainLimit and surfaces a disabled rule as 409', async () => {
  const reply = { ok: true, rulesRevision: 'logic-ir-rules@0.0.1', rule: { uuid: U(21) }, domain: { uuid: U(20), members: 2, complete: true }, fired: [], skipped: [], conflicts: [], complete: true };
  let disabled = false;
  const { client, calls } = await recordingClient(() =>
    disabled ? [{ ok: false, code: 'R002', diagnostics: [{ code: 'R002', message: 'rule a is disabled' }] }, 409] : reply
  );
  assert.deepEqual(await client.apply_rule(U(21), { domain_limit: 100 }), reply);
  assert.equal(calls[0].url, `${BASE}/api2.0/logic-ir/rules/${U(21)}/apply`);
  assert.deepEqual(calls[0].body, { domainLimit: 100 });
  await client.apply_rule(U(21));
  assert.deepEqual(calls[1].body, {});
  disabled = true;
  await assert.rejects(client.apply_rule(U(21)), (err) => err.status === 409 && err.body.code === 'R002');
});

// rest-api.js:6380 POST /logic-ir/fixpoint: body ruleUuids, maxRounds, maxFacts, domainLimit; 422 when not stratifiable.
test('saturate_rules posts the fixpoint bounds', async () => {
  const { client, calls } = await recordingClient(() => ({ ok: true, rounds: 2, derived: [] }));
  await client.saturate_rules({ rule_uuids: [U(21)], max_rounds: 4, max_facts: 100, domain_limit: 50 });
  assert.equal(calls[0].url, `${BASE}/api2.0/logic-ir/fixpoint`);
  assert.deepEqual(calls[0].body, { ruleUuids: [U(21)], maxRounds: 4, maxFacts: 100, domainLimit: 50 });
  await client.saturate_rules();
  assert.deepEqual(calls[1].body, {});
});

// ===== Procedure runs (verified memory, IR-S1 state) =====

// rest-api.js:11256 POST /procedures/:uuid/runs (+ /api2.0, rest-api.js:11285): body
// { ok, verifiedBy?: page|person|tool, failure?, site?, evidence? }; planRun
// (src/verified_memory/status.js:198) requires ok boolean; 201 with recordRun's shape
// (src/verified_memory/service.js:311): { ok, run, status, state, previousStatus, retired, revived, procedure }.
test('record_procedure_run posts the run and returns status and state', async () => {
  const reply = { ok: true, run: { id: 'run-1', ok: true, verified: true, verifiedBy: 'tool', failure: null, site: 'portal.example.test', evidence: 'confirmation 555', at: '2026-11-08T00:00:00Z' }, status: 'verified', state: 'validated', previousStatus: 'draft', retired: false, revived: false, procedure: { id: U(30), state: 'validated' } };
  const { client, calls } = await recordingClient(() => [reply, 201]);
  const out = await client.record_procedure_run(U(30), { ok: true, verified_by: 'tool', site: 'portal.example.test', evidence: 'confirmation 555' });
  assert.deepEqual(out, reply);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `${BASE}/api2.0/procedures/${U(30)}/runs`);
  assert.deepEqual(calls[0].body, { ok: true, verifiedBy: 'tool', site: 'portal.example.test', evidence: 'confirmation 555' });
  await client.record_procedure_run(U(30), { ok: false, failure: 'submit button missing' });
  assert.deepEqual(calls[1].body, { ok: false, failure: 'submit button missing' });
  assert.throws(() => client.record_procedure_run(U(30), {}), /ok \(boolean\) is required/);
  assert.throws(() => client.record_procedure_run('', { ok: true }), /procedure_uuid is required/);
});

// There is no GET .../runs route on the server; the runs, the lifecycle and the
// IR-S1 state come back on GET /procedures/:uuid (handleGetProcedure, rest-api.js:11218,
// response keys at rest-api.js:11231-11243; state from status.js:316).
test('list_procedure_runs reads runs and state from GET /procedures/:uuid', async () => {
  // K1: the current version's state rides inside `lifecycle` (service.js:206-212, _currentVersionState service.js:220).
  const currentVersion = { uuid: U(31), version: 2, state: 'validated', stateBasis: 'runs' };
  const lifecycle = { status: 'verified', state: 'promoted', promotion: { eligible: true, independentVerifiedRuns: 3, sites: 2 }, currentVersion };
  const runs = [{ id: 'run-1', ok: true, verified: true, verifiedBy: 'tool', site: 'a.example.test', versionUuid: U(31), version: 2 }];
  const { client, calls } = await recordingClient(() => ({ procedure_uuid: U(30), steps: [], id: U(30), goal: 'Register supplier', site: 'a.example.test', status: 'verified', state: 'promoted', lifecycle, runs }));
  const out = await client.list_procedure_runs(U(30));
  assert.deepEqual(out, { procedureId: U(30), status: 'verified', state: 'promoted', currentVersion, lifecycle, runs });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, `${BASE}/api2.0/procedures/${U(30)}`);
});

test('list_procedure_runs gives currentVersion null for a procedure with no versions', async () => {
  const { client } = await recordingClient(() => ({ id: U(30), status: 'draft', state: 'candidate', lifecycle: { status: 'draft', state: 'candidate' }, runs: [] }));
  const out = await client.list_procedure_runs(U(30));
  assert.equal(out.currentVersion, null);
  assert.deepEqual(out.runs, []);
});

// K1 (knowshowgo #385): a run names the version that ran (versionUuid or version) and
// whether it was a held-out case. planRun stamps both (status.js:211-215) and echoes them
// on `run` (status.js:253); a version not of this procedure is a 400 (service.js:292).
// K2 widened verifiedBy to page|person|tool|oracle|email|api (status.js:39).
test('record_procedure_run sends the version that ran and heldOut', async () => {
  const reply = { ok: true, run: { id: 'run-2', ok: true, verified: true, verifiedBy: 'oracle', failure: null, site: 'b.example.test', evidence: null, heldOut: true, versionUuid: U(31), version: 2, at: '2026-11-08T00:00:00Z' }, status: 'verified', state: 'validated', previousStatus: 'verified', retired: false, revived: false, procedure: { id: U(30) } };
  const { client, calls } = await recordingClient(() => [reply, 201]);
  const out = await client.record_procedure_run(U(30), { ok: true, verified_by: 'oracle', site: 'b.example.test', version_uuid: U(31), held_out: true });
  assert.deepEqual(out, reply);
  assert.deepEqual(calls[0].body, { ok: true, verifiedBy: 'oracle', site: 'b.example.test', versionUuid: U(31), heldOut: true });
  await client.record_procedure_run(U(30), { ok: true, verified_by: 'email', version: 2, held_out: false });
  assert.deepEqual(calls[1].body, { ok: true, verifiedBy: 'email', version: 2 });
  assert.throws(() => client.record_procedure_run(U(30), { ok: true, version: 0 }), /version must be a positive integer/);
});

// K2 (knowshowgo #386): GET /procedures/:uuid/evaluation (rest-api.js:11273, mounted on /api
// and /api2.0 at rest-api.js:11284) -> service.js:254 { ok, procedureId, procedure, versions,
// regression, unattributed, method }; per version stats from runStats (evaluation.js:78), the
// regression test (evaluation.js:107; `tested: false` without runs on both sides), state and
// stateBasis (service.js:260-263). Another owner's private procedure is a 404.
test('get_procedure_evaluation reads per-version records', async () => {
  const stats = (runs, ok) => ({ runs, verifiedSuccesses: ok, failures: runs - ok, unverified: 0, verifiedBy: { oracle: ok }, lastRunAt: runs ? '2026-11-08T00:00:00Z' : null, successRate: runs ? ok / runs : null, interval: runs ? { low: 0.2, high: 0.9, level: 0.95, method: 'wilson' } : null });
  const reply = {
    ok: true,
    procedureId: U(30),
    procedure: stats(5, 3),
    versions: [
      { uuid: U(32), version: 3, stats: stats(0, 0), regression: { against: { uuid: U(31), version: 2 }, tested: false, flagged: false, pValue: null, test: 'one-sided Fisher exact (newer rate lower)', alpha: 0.05, reason: 'both versions need at least one run' }, state: 'candidate', stateBasis: 'runs' },
      { uuid: U(31), version: 2, stats: stats(5, 3), regression: null, state: 'retired', stateBasis: 'superseded' }
    ],
    regression: { against: { uuid: U(31), version: 2 }, tested: false, flagged: false, pValue: null },
    unattributed: stats(0, 0),
    method: { success: 'verified by an independent source (oracle, email, api, person); not page or tool', interval: 'Wilson score, 95%' }
  };
  const { client, calls } = await recordingClient(() => reply);
  const out = await client.get_procedure_evaluation(U(30));
  assert.deepEqual(out, reply);
  assert.equal(out.versions[0].regression.tested, false);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, `${BASE}/api2.0/procedures/${U(30)}/evaluation`);
  assert.throws(() => client.get_procedure_evaluation(''), /procedure_uuid is required/);
});

// GET /procedures/search (rest-api.js:11197, mounted at rest-api.js:11282) -> searchProcedures
// (service.js:359): goal semantic, site exact, verified only unless include; each result is
// procedureView with the lifecycle spread in, so K1's currentVersion rides along.
test('search_verified_procedures sends goal, site, include and passes currentVersion through', async () => {
  const hit = { id: U(30), goal: 'Register supplier', site: 'portal.example.test', status: 'verified', state: 'validated', currentVersion: { uuid: U(31), version: 2, state: 'validated', stateBasis: 'runs' }, score: 0.82, runCount: 2 };
  const reply = { ok: true, query: { goal: 'register supplier', site: 'portal.example.test', include: ['verified', 'draft'] }, results: [hit], excluded: { draft: 0, retired: 0, otherSite: 0 }, scanned: 4 };
  const { client, calls } = await recordingClient(() => reply);
  const out = await client.search_verified_procedures({ goal: 'register supplier', site: 'portal.example.test', include: ['drafts'], limit: 3 });
  assert.deepEqual(out, reply);
  const url = new URL(calls[0].url);
  assert.equal(calls[0].method, 'GET');
  assert.equal(url.pathname, '/api2.0/procedures/search');
  assert.equal(url.searchParams.get('goal'), 'register supplier');
  assert.equal(url.searchParams.get('site'), 'portal.example.test');
  assert.equal(url.searchParams.get('include'), 'drafts');
  assert.equal(url.searchParams.get('limit'), '3');
  assert.throws(() => client.search_verified_procedures({}), /goal or site is required/);
});

// POST /api/procedures/search results carry currentVersion when the procedure has one (rest-api.js:11584).
test('search_procedures passes currentVersion through on each hit', async () => {
  const currentVersion = { uuid: U(31), version: 2, state: 'validated', stateBasis: 'runs' };
  const { client } = await recordingClient(() => ({ results: [{ uuid: U(30), status: 'verified', state: 'validated', currentVersion }], scanned: 1, include: ['verified'], excluded: {} }));
  const results = await client.search_procedures('register supplier');
  assert.deepEqual(results[0].currentVersion, currentVersion);
});

// ===== Procedure versions (capability model) =====

// rest-api.js:9456 POST /procedures/:uuid/versions: body status (default draft; one of
// LIFECYCLE_STATUSES, src/seed/capability_model.js:20), implementation, requires, provides,
// provenance; 201 { ok, procedureVersion, capabilityResolution } (rest-api.js:9528).
test('create_procedure_version posts lifecycle status and capabilities', async () => {
  const reply = { ok: true, procedureVersion: { uuid: U(31), procedureId: U(30), version: 2, status: 'dogfood', statusHistory: [] }, capabilityResolution: { provides: [], requires: [] } };
  const { client, calls } = await recordingClient(() => [reply, 201]);
  const out = await client.create_procedure_version(U(30), { status: 'dogfood', provides: ['forms.supplier_registration'], requires: [] });
  assert.deepEqual(out, reply);
  assert.equal(calls[0].url, `${BASE}/api2.0/procedures/${U(30)}/versions`);
  assert.deepEqual(calls[0].body, { status: 'dogfood', provides: ['forms.supplier_registration'], requires: [] });
});

// rest-api.js:9536 GET /procedures/:uuid/versions -> { ok, procedureId, count, latest, versions };
// rest-api.js:9559 GET /procedures/:uuid/versions/:version -> { ok, procedureVersion };
// rest-api.js:9585 GET /procedure-versions/:uuid -> { ok, procedureVersion }.
// K1 (knowshowgo #385): each version view also carries state, stateBasis, statusAsState,
// statusDeprecated: true and lifecycle (versionView, service.js:273); `status` stays. The list
// adds unattributedRuns (rest-api.js:9545-9553).
test('list and get procedure versions by number and by uuid', async () => {
  const v = {
    uuid: U(31), version: 2, status: 'tested', statusHistory: [{ status: 'draft' }, { status: 'tested' }],
    state: 'validated', stateBasis: 'runs', statusAsState: 'validated', statusDeprecated: true,
    lifecycle: { status: 'verified', runCount: 2, heldOutVerifiedRuns: 1, promotion: { eligible: false } }
  };
  const { client, calls } = await recordingClient((call) =>
    call.url.endsWith('/versions') ? { ok: true, procedureId: U(30), count: 1, latest: v, versions: [v], unattributedRuns: 0 } : { ok: true, procedureVersion: v }
  );
  const listed = await client.list_procedure_versions(U(30));
  const byNumber = await client.get_procedure_version_by_number(U(30), 2);
  const byUuid = await client.get_procedure_version(U(31));
  assert.equal(listed.latest.uuid, U(31));
  assert.equal(byNumber.procedureVersion.version, 2);
  assert.equal(byUuid.procedureVersion.status, 'tested');
  assert.equal(listed.unattributedRuns, 0);
  for (const view of [listed.versions[0], byNumber.procedureVersion, byUuid.procedureVersion]) {
    assert.equal(view.state, 'validated');
    assert.equal(view.stateBasis, 'runs');
    assert.equal(view.statusAsState, 'validated');
    assert.equal(view.statusDeprecated, true);
    assert.equal(view.lifecycle.heldOutVerifiedRuns, 1);
  }
  assert.equal(calls[0].url, `${BASE}/api2.0/procedures/${U(30)}/versions`);
  assert.equal(calls[1].url, `${BASE}/api2.0/procedures/${U(30)}/versions/2`);
  assert.equal(calls[2].url, `${BASE}/api2.0/procedure-versions/${U(31)}`);
  // rest-api.js:9563 rejects anything but a positive integer.
  assert.throws(() => client.get_procedure_version_by_number(U(30), 0), /version must be a positive integer/);
});

// rest-api.js:9598 POST /procedure-versions/:uuid/status: body status, reason, provenance;
// { ok, procedureVersion, transition }; 409 status_terminal / status_unchanged (rest-api.js:9624-9633).
test('transition_procedure_version posts the next status and surfaces 409', async () => {
  let terminal = false;
  const reply = { ok: true, procedureVersion: { uuid: U(31), status: 'validated' }, transition: { from: 'tested', to: 'validated', reason: 'held-out pass' } };
  const { client, calls } = await recordingClient(() =>
    terminal ? [{ error: 'status_terminal', status: 'deprecated', hint: 'deprecated is terminal; no transitions out' }, 409] : reply
  );
  assert.deepEqual(await client.transition_procedure_version(U(31), { status: 'validated', reason: 'held-out pass' }), reply);
  assert.equal(calls[0].url, `${BASE}/api2.0/procedure-versions/${U(31)}/status`);
  assert.deepEqual(calls[0].body, { status: 'validated', reason: 'held-out pass' });
  assert.throws(() => client.transition_procedure_version(U(31), {}), /status is required/);
  terminal = true;
  await assert.rejects(client.transition_procedure_version(U(31), { status: 'draft' }), (err) => err.status === 409 && err.message === 'status_terminal');
});

// ===== Verified facts =====

// rest-api.js:12187 / 12337 POST /api2.0/facts -> addFact (src/verified_memory/service.js:428):
// body subject, predicate, object, status (candidate|confirmed, service.js:45), provenance,
// visibility, confidence; 201 { ok, fact } where fact is factView (service.js:401).
test('add_fact posts a candidate fact with provenance', async () => {
  const fact = { id: U(40), subject: 'Northwind Robotics', predicate: 'duns', object: '000000000', status: 'candidate', provenance: { source: 'portal' }, history: [], corrects: null, replacedBy: null, visibility: 'private' };
  const { client, calls } = await recordingClient(() => [{ ok: true, fact }, 201]);
  const out = await client.add_fact({ subject: 'Northwind Robotics', predicate: 'duns', obj: '000000000', provenance: { source: 'portal' }, visibility: 'private' });
  assert.deepEqual(out, { ok: true, fact });
  assert.equal(calls[0].url, `${BASE}/api2.0/facts`);
  assert.deepEqual(calls[0].body, { subject: 'Northwind Robotics', predicate: 'duns', object: '000000000', status: 'candidate', provenance: { source: 'portal' }, visibility: 'private' });
  assert.throws(() => client.add_fact({ subject: 's', predicate: 'p' }), /obj is required/);
});

// rest-api.js:12291 GET /facts?subject=&predicate=&include=&limit= -> listFacts (service.js:457)
// { ok, facts, total, truncated, include }; rest-api.js:12305 GET /facts/:id -> { ok, fact }.
test('list_facts and get_fact read facts', async () => {
  const { client, calls } = await recordingClient((call) =>
    call.url.includes('/facts?') ? { ok: true, facts: [{ id: U(40) }], total: 1, truncated: false, include: ['confirmed', 'candidate'] } : { ok: true, fact: { id: U(40), status: 'confirmed' } }
  );
  const listed = await client.list_facts({ subject: 'Northwind Robotics', include: ['candidates', 'corrected'], limit: 10 });
  const one = await client.get_fact(U(40));
  assert.equal(listed.total, 1);
  assert.equal(one.fact.status, 'confirmed');
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api2.0/facts');
  assert.equal(url.searchParams.get('subject'), 'Northwind Robotics');
  assert.equal(url.searchParams.get('include'), 'candidates,corrected');
  assert.equal(url.searchParams.get('limit'), '10');
  assert.equal(url.searchParams.get('predicate'), null);
  assert.equal(calls[1].url, `${BASE}/api2.0/facts/${U(40)}`);
});

// rest-api.js:12314 POST /facts/:id/confirm: body { by?, provenance? } -> { ok, fact }
// (confirmFact service.js:504); 409 when the fact was corrected (service.js:507), 403 when not the owner (service.js:500).
test('confirm_fact posts who confirmed and surfaces 409 for a corrected fact', async () => {
  let corrected = false;
  const { client, calls } = await recordingClient(() =>
    corrected
      ? [{ error: `fact ${U(40)} was corrected; confirm its replacement instead`, replacedBy: U(41) }, 409]
      : { ok: true, fact: { id: U(40), status: 'confirmed', provenance: { confirmedBy: 'person' } } }
  );
  const out = await client.confirm_fact(U(40), { by: 'person', provenance: { source: 'review' } });
  assert.equal(out.fact.status, 'confirmed');
  assert.equal(calls[0].url, `${BASE}/api2.0/facts/${U(40)}/confirm`);
  assert.deepEqual(calls[0].body, { by: 'person', provenance: { source: 'review' } });
  await client.confirm_fact(U(40));
  assert.deepEqual(calls[1].body, {});
  corrected = true;
  await assert.rejects(client.confirm_fact(U(40)), (err) => err.status === 409 && err.body.replacedBy === U(41));
  assert.throws(() => client.confirm_fact(''), /fact_id is required/);
});

// rest-api.js:12328 POST /facts/:id/correct: body { object, provenance? } -> 201 { ok, fact, corrected } (service.js:523).
test('correct_fact posts the corrected value', async () => {
  const reply = { ok: true, fact: { id: U(41), object: '111111111', corrects: U(40), status: 'confirmed' }, corrected: { id: U(40), status: 'corrected', replacedBy: U(41) } };
  const { client, calls } = await recordingClient(() => [reply, 201]);
  assert.deepEqual(await client.correct_fact(U(40), { obj: '111111111', provenance: { source: 'review' } }), reply);
  assert.equal(calls[0].url, `${BASE}/api2.0/facts/${U(40)}/correct`);
  assert.deepEqual(calls[0].body, { object: '111111111', provenance: { source: 'review' } });
  assert.throws(() => client.correct_fact(U(40), {}), /obj is required/);
});

// ===== Shared conventions =====

test('new methods follow prototypeApiPrefix and send identity like every other call', async () => {
  const { client, calls } = await recordingClient(() => ({ ok: true }), {
    prototypeApiPrefix: '/api',
    authToken: 'test-token-not-real',
    defaultOwnerUserId: 'owner-avery-example'
  });
  await client.list_rules();
  await client.record_procedure_run(U(30), { ok: true });
  await client.confirm_fact(U(40));
  assert.equal(calls[0].url, `${BASE}/api/logic-ir/rules`);
  assert.equal(calls[1].url, `${BASE}/api/procedures/${U(30)}/runs`);
  assert.equal(calls[2].url, `${BASE}/api/facts/${U(40)}/confirm`);
  for (const call of calls) {
    assert.equal(call.headers.authorization, 'Bearer test-token-not-real');
    assert.equal(call.headers['x-ksg-owner'], 'owner-avery-example');
  }
});
