# AGENTS.md

Canonical instructions for coding agents working in the KnowShowGo client SDK.

This repo ships the JavaScript (`js/client.js`) and Python (`python/client.py`)
client SDKs for the KnowShowGo (KSG) REST API. The `osl-oc-agent` OpenClaw agent
consumes this SDK to reach the KSG service.

## Commands

```bash
npm install --legacy-peer-deps        # see cloud note below
node --test js/client.test.mjs        # JS unit tests
python3 -m unittest discover -s python -p 'test_*.py'   # Python unit tests
npm run build                         # esbuild bundle -> dist/index.cjs
```

## Cursor Cloud specific instructions

- Install with `npm install --legacy-peer-deps`. The `peerDependencies` entry
  `knowshowgo@^0.2.1` is the sibling service package and is **not published to
  npm**, so a plain `npm install` fails with an E404. The SDK's own runtime dep
  is just `node-fetch`; the peer is only relevant when co-locating the service
  package.
- The JS tests use the **Node built-in test runner**, not jest. `npm test`
  (jest) reports "No tests found" because the test file is `js/client.test.mjs`.
  Run `node --test js/client.test.mjs` instead. All JS + Python tests are unit
  tests with mocked transport (no live server needed).
- For live integration against a running KSG service, construct the client with
  an explicit base URL, e.g. `new KnowShowGoClient({ baseUrl: 'http://localhost:3000' })`
  (Python: `KnowShowGoClient("http://localhost:3000")`). Start the service from
  the sibling `knowshowgo` repo with `PORT=3000 KSG_MEMORY_BACKEND=in-memory npm start`
  (no Docker needed). The Python client requires the `requests` package.
