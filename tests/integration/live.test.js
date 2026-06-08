import assert from "node:assert/strict";
import test from "node:test";
import { KnowShowGoClient } from "../../src/index.js"; // pragma: allowlist secret

const baseUrl = process.env.KSG_DEV_BASE_URL || process.env.KSG_BASE_URL;

test("live KSG service health check", { skip: !baseUrl }, async () => {
  const client = new KnowShowGoClient({ // pragma: allowlist secret
    baseUrl,
    apiToken: process.env.KSG_API_TOKEN
  });

  const health = await client.healthCheck();
  assert.ok(health);
});
