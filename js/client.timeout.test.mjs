/**
 * Request timeouts.
 *
 * These exist because of a real outage. On 2026-09-07 ArangoDB behind the KSG
 * API degraded to ~19s per query. Nothing failed — every request simply waited,
 * so agent turns ran past their stall timeout and the product presented as
 * "memory is down" rather than "memory is slow". An unbounded fetch converts a
 * slow dependency into a hung caller and destroys the diagnostic signal.
 *
 * Node's built-in test runner (not jest) — see AGENTS.md.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// client.js is a .js file in a non-module package, so a direct import evaluates
// it as CommonJS. The rest of the suite loads it through a data: URL to force
// ESM evaluation; this file does the same rather than inventing a second way.
async function loadClientClass() {
  const source = await readFile(new URL("./client.js", import.meta.url), "utf8");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const mod = await import(moduleUrl);
  return mod.KnowShowGoClient;
}

/** A fetch that never settles, i.e. the degraded-server case. */
const hangingFetch = () => new Promise(() => {});

/** A fetch that resolves immediately, for the healthy case. */
function okFetch(payload = { ok: true }) {
  return async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => payload,
  });
}

test("a request that outlives the budget rejects instead of hanging", async () => {
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({
    baseUrl: "http://127.0.0.1:9",
    fetchImpl: hangingFetch,
    timeoutMs: 40,
  });

  const err = await client.get_release_manifest().then(
    () => null,
    (e) => e,
  );

  assert.ok(err, "a hanging request resolved, so nothing bounded it");
  assert.equal(err.code, "KSG_TIMEOUT");
  assert.match(err.message, /timed out after 40ms/);
  // The message must point at the diagnosis, since this is what a user sees.
  assert.match(err.message, /arango\.ok/);
});

test("the timeout names the request that failed", async () => {
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({
    baseUrl: "http://127.0.0.1:9",
    fetchImpl: hangingFetch,
    timeoutMs: 30,
  });

  const err = await client.get_release_manifest().then(
    () => null,
    (e) => e,
  );

  assert.match(err.message, /GET \/api\/release/, "an opaque timeout cannot be triaged");
});

test("a fast request is unaffected", async () => {
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({
    baseUrl: "http://127.0.0.1:9",
    fetchImpl: okFetch({ release: "v0.2.10" }),
    timeoutMs: 5_000,
  });

  const out = await client.get_release_manifest();
  assert.equal(out.release, "v0.2.10");
});

test("timeoutMs 0 restores unbounded behaviour for deliberate long waits", async () => {
  let sawSignal = false;
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({
    baseUrl: "http://127.0.0.1:9",
    timeoutMs: 0,
    fetchImpl: async (_url, init) => {
      sawSignal = Boolean(init?.signal);
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ ok: true }),
      };
    },
  });

  await client.get_release_manifest();
  assert.equal(sawSignal, false, "an opted-out client must not be handed an abort signal");
});

test("a bounded client is the default", async () => {
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({ baseUrl: "http://127.0.0.1:9" });
  assert.ok(
    client.timeoutMs > 0,
    "the default must be bounded; an unbounded default is what turned a slow server into a hung agent",
  );
});

test("an aborted request does not mask a genuine transport error", async () => {
  const KnowShowGoClient = await loadClientClass();
  const client = new KnowShowGoClient({
    baseUrl: "http://127.0.0.1:9",
    timeoutMs: 5_000,
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });

  const err = await client.get_release_manifest().then(
    () => null,
    (e) => e,
  );

  assert.match(err.message, /ECONNREFUSED/);
  assert.notEqual(err.code, "KSG_TIMEOUT");
});
