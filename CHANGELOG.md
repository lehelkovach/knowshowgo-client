# Changelog — knowshowgo-client

Client changes, newest first. Each client release is paired with the knowshowgo
server release of the same `X.Y.Z` (the server's `docs/CHANGELOG.md` is the
running record of both; the pairing law is its `docs/VERSION-MATRIX.md`).

## Unreleased (`dev`, for 0.2.40, paired with KSG 0.2.69)

- **LIFECYCLE1: recall never hands over a candidate or a retired procedure as trusted.** KSG's one lifecycle is candidate → validated → promoted, and retired from any of them, computed from run marks. Only validated or promoted procedures are trusted; since IR-S3 a `verified` status can still be a candidate (the page alone verified it).
  - **JS (npm):** `search_procedures(query, { include = 'trusted' })` and `search_verified_procedures({ include = 'trusted' })` (were `'verified'`). Every hit carries `trusted`. With `include: 'trusted'` alone the client also drops untrusted hits, so a server older than KSG 0.2.69 cannot hand one over; `search_verified_procedures` counts them in `excluded.candidate`. New `get_procedure_lifecycle(uuid)` → `{ procedureId, status, state, trusted, legacy, legacyReason, promotion, validation, currentVersion, runCount, lifecycle }`; new export `TRUSTED_PROCEDURE_STATES`. Tests: `js/lifecycle1.test.mjs` (11), `js/lifecycle1_live.test.mjs` (4, needs `KSG_LIVE_URL`).
  - **Python (PyPI):** the same: `search_procedures(query, include="trusted")`, `search_verified_procedures(include="trusted")`, `get_procedure_lifecycle(uuid)`, `TRUSTED_PROCEDURE_STATES`. Tests: `python/tests/test_lifecycle1.py` (11), `python/tests/test_lifecycle1_live.py` (3, needs `KSG_LIVE_URL`).
  - **Migration:** a caller that wants the old set passes `include: 'verified'` (JS) / `include="verified"` (Python); every candidate in it now carries `trusted: false`. Other `include` values are sent as before.
