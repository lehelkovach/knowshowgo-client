// CS1 — the client against the server's capability manifest.
//
// `js/capabilities.json` is a vendored copy of knowshowgo `src/capabilities.json`
// (refresh with `npm run sync:capabilities`). It puts every public server route
// in one capability and names the client method that calls it. These tests fail
// when the client drifts from it: a method the manifest names is missing, a
// method does not call the route the manifest says, an agent route has neither
// a method nor a stated reason, a method has no line in docs/API.md, or the
// README's capability section skips a capability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('./capabilities.json'));
const source = await read('./client.js');
const apiDoc = await read('../docs/API.md');
const readme = await read('../README.md');
const pySource = await read('../python/knowshowgo_client/client.py');

const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { KnowShowGoClient } = mod;

const agentCaps = manifest.capabilities.filter((c) => c.audience === 'agent');
const norm = (key) => key.replace(/:[A-Za-z_]+/g, ':p');

/** route key ("POST /logic-ir/bind", params as :p) → the class methods whose body calls it. */
function clientRouteMap(src) {
  const map = new Map();
  let current = null;
  for (const line of src.split('\n')) {
    const def = line.match(/^ {2}(?:async )?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    if (def && !['if', 'for', 'while', 'switch', 'catch', 'constructor', 'return'].includes(def[1])) current = def[1];
    const re = /_request\(\s*["']([A-Z]+)["'],\s*[`"']([^`"']+)[`"']/g;
    let m;
    while ((m = re.exec(line))) {
      const path = m[2]
        .replace(/^\$\{[^}]+\}/, '')
        .replace(/^\/api(2\.0)?/, '')
        .replace(/\$\{[^}]+\}/g, ':p')
        .split('?')[0];
      const key = `${m[1]} ${path}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(current);
    }
  }
  return map;
}
const routeMap = clientRouteMap(source);

test('the vendored manifest is the server schema this client understands', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.ok(manifest.capabilities.length >= 20);
  assert.ok(manifest.features.length >= 15);
});

test('every client method an agent capability names exists on KnowShowGoClient', () => {
  const missing = [];
  for (const cap of agentCaps) {
    for (const m of cap.client || []) {
      if (typeof KnowShowGoClient.prototype[m] !== 'function') missing.push(`${cap.id}: ${m}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('each method calls the route the manifest says it calls', () => {
  const wrong = [];
  for (const cap of agentCaps) {
    for (const [method, keys] of Object.entries(cap.clientRoutes || {})) {
      for (const key of keys) {
        const callers = routeMap.get(norm(key));
        if (!callers || !callers.has(method)) wrong.push(`${cap.id}: ${method} → ${key}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('every agent route has a client method or a stated reason it has none', () => {
  const gaps = [];
  for (const cap of agentCaps) {
    const covered = new Set(Object.values(cap.clientRoutes || {}).flat());
    for (const key of cap.routes) {
      if (!covered.has(key) && !cap.noClient?.[key]) gaps.push(`${cap.id}: ${key}`);
    }
  }
  assert.deepEqual(gaps, []);
});

test('every agent capability method is documented in docs/API.md', () => {
  const undocumented = agentCaps.flatMap((c) => (c.client || []).filter((m) => !new RegExp(`\`${m}[\`(]`).test(apiDoc)));
  assert.deepEqual(undocumented, []);
});

test('every agent capability method exists in the Python client too', () => {
  // JS keeps a few camelCase names (evaluateLogicIr); Python spells them snake_case.
  const snake = (m) => m.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  const missing = agentCaps.flatMap((c) => (c.client || []).filter((m) => !new RegExp(`def ${snake(m)}\\(`).test(pySource)));
  assert.deepEqual(missing, []);
});

test('the README capability section names every agent capability and feature', () => {
  const section = readme.split('## What KnowShowGo can do')[1]?.split('\n## ')[0] || '';
  assert.ok(section, 'README has a "What KnowShowGo can do" section');
  for (const cap of agentCaps) assert.ok(section.includes(`\`${cap.id}\``), `README capability section names ${cap.id}`);
  for (const f of manifest.features) assert.ok(section.includes(`\`${f.id}\``), `README capability section names feature ${f.id}`);
});
