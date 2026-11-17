/**
 * KSG-RATE1 (2026-11-17): the server answers 429 with Retry-After and the
 * IETF RateLimit-* headers. The client reads them: a short wait is retried
 * (a refused request was never processed, so a retried write is not a
 * duplicate), a long one is thrown as a typed error carrying the wait, and the
 * last limit headers are kept for pacing.
 *
 * Node's built-in test runner (not jest). Transport mocked; no server.
 * Run-time budget asserted per test (sleeps are injected, never real).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const BUDGET_MS = 250;

async function loadClientClass() {
  const source = await readFile(new URL("./client.js", import.meta.url), "utf8");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return (await import(moduleUrl)).KnowShowGoClient;
}

function response(status, body, headers = {}) {
  const h = Object.fromEntries(Object.entries({ "content-type": "application/json", ...headers }).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return { ok: status >= 200 && status < 300, status, headers: { get: (n) => h[String(n).toLowerCase()] ?? null }, json: async () => body, text: async () => JSON.stringify(body) };
}

const limited = (retryAfter) => response(429, { error: "rate limit exceeded", scope: "write", limit: 120, retryAfterSeconds: Number(retryAfter) || null }, {
  "retry-after": retryAfter, "ratelimit-limit": 120, "ratelimit-remaining": 0, "ratelimit-reset": retryAfter, "ratelimit-policy": "120;w=60",
});

function scripted(...responses) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return responses.shift(); };
  return { fetchImpl, calls };
}

async function timed(fn) {
  const t0 = Date.now();
  await fn();
  assert.ok(Date.now() - t0 < BUDGET_MS, `took ${Date.now() - t0} ms, budget ${BUDGET_MS}`);
}

test("a short Retry-After is waited out once and the request is sent again", () => timed(async () => {
  const KnowShowGoClient = await loadClientClass();
  const { fetchImpl, calls } = scripted(limited("2"), response(200, { ok: true, id: "a1" }));
  const slept = [];
  const client = new KnowShowGoClient({ baseUrl: "http://ksg.example.test", fetchImpl, sleepImpl: async (ms) => { slept.push(ms); } });
  const out = await client._request("POST", "/api/assertions", { json: { subject: "Avery Example" }, skip_ready: true });
  assert.deepEqual(out, { ok: true, id: "a1" });
  assert.equal(calls.length, 2);
  assert.deepEqual(slept, [2000]);
  assert.equal(calls[1].init.body, calls[0].init.body);
}));

test("a long Retry-After is not slept on: a typed error carries the wait and the limits", () => timed(async () => {
  const KnowShowGoClient = await loadClientClass();
  const { fetchImpl, calls } = scripted(limited("42"));
  const client = new KnowShowGoClient({ baseUrl: "http://ksg.example.test", fetchImpl, sleepImpl: async () => { throw new Error("must not sleep"); } });
  const err = await client._request("GET", "/api/concepts", { skip_ready: true }).then(() => null, (e) => e);
  assert.ok(err);
  assert.equal(calls.length, 1);
  assert.equal(err.status, 429);
  assert.equal(err.code, "KSG_RATE_LIMITED");
  assert.equal(err.retryAfterMs, 42_000);
  assert.equal(err.retryAfterSeconds, 42);
  assert.deepEqual(err.rateLimit, { limit: 120, remaining: 0, resetSeconds: 42, policy: "120;w=60" });
  assert.equal(err.body.scope, "write");
  assert.match(err.message, /rate limit/i);
}));

test("retries are bounded: still limited after the retry, the error is thrown", () => timed(async () => {
  const KnowShowGoClient = await loadClientClass();
  const { fetchImpl, calls } = scripted(limited("1"), limited("1"), response(200, { ok: true }));
  const client = new KnowShowGoClient({ baseUrl: "http://ksg.example.test", fetchImpl, sleepImpl: async () => {} });
  const err = await client._request("GET", "/api/concepts", { skip_ready: true }).then(() => null, (e) => e);
  assert.equal(err?.code, "KSG_RATE_LIMITED");
  assert.equal(calls.length, 2);
}));

test("rateLimitRetries: 0 never retries; maxRetryAfterMs widens what is waited out", () => timed(async () => {
  const KnowShowGoClient = await loadClientClass();
  const a = scripted(limited("1"));
  const none = new KnowShowGoClient({ baseUrl: "http://ksg.example.test", fetchImpl: a.fetchImpl, rateLimitRetries: 0, sleepImpl: async () => {} });
  assert.equal((await none._request("GET", "/x", { skip_ready: true }).then(() => null, (e) => e))?.code, "KSG_RATE_LIMITED");
  assert.equal(a.calls.length, 1);
  const b = scripted(limited("30"), response(200, { ok: true }));
  const slept = [];
  const patient = new KnowShowGoClient({ baseUrl: "http://ksg.example.test", fetchImpl: b.fetchImpl, maxRetryAfterMs: 60_000, sleepImpl: async (ms) => { slept.push(ms); } });
  assert.deepEqual(await patient._request("GET", "/x", { skip_ready: true }), { ok: true });
  assert.deepEqual(slept, [30_000]);
}));

test("Retry-After as an HTTP date is read too", () => timed(async () => {
  const KnowShowGoClient = await loadClientClass();
  const when = new Date(Date.now() + 3_000).toUTCString();
  const { fetchImpl } = scripted(limited(when), response(200, { ok: true }));
  const slept = [];
  const client = new KnowShowGoClient({ baseUrl: "http://ksg.example.test", fetchImpl, sleepImpl: async (ms) => { slept.push(ms); } });
  await client._request("GET", "/x", { skip_ready: true });
  assert.equal(slept.length, 1);
  assert.ok(slept[0] >= 1_000 && slept[0] <= 4_000, `slept ${slept[0]}`);
}));

test("the last RateLimit-* headers seen are kept on the client", () => timed(async () => {
  const KnowShowGoClient = await loadClientClass();
  const { fetchImpl } = scripted(response(200, { ok: true }, { "ratelimit-limit": 600, "ratelimit-remaining": 599, "ratelimit-reset": 37, "ratelimit-policy": "600;w=60" }));
  const client = new KnowShowGoClient({ baseUrl: "http://ksg.example.test", fetchImpl });
  assert.equal(client.lastRateLimit, null);
  await client._request("GET", "/x", { skip_ready: true });
  assert.deepEqual(client.lastRateLimit, { limit: 600, remaining: 599, resetSeconds: 37, policy: "600;w=60" });
}));

test("a 429 without Retry-After is not retried and has no invented wait", () => timed(async () => {
  const KnowShowGoClient = await loadClientClass();
  const { fetchImpl, calls } = scripted(response(429, { error: "too many requests" }));
  const client = new KnowShowGoClient({ baseUrl: "http://ksg.example.test", fetchImpl, sleepImpl: async () => { throw new Error("must not sleep"); } });
  const err = await client._request("GET", "/x", { skip_ready: true }).then(() => null, (e) => e);
  assert.equal(err?.code, "KSG_RATE_LIMITED");
  assert.equal(err.retryAfterMs, null);
  assert.equal(calls.length, 1);
}));
