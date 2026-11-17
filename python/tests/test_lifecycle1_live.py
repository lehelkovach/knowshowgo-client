"""LIFECYCLE1 against a real KSG service (no mocked transport). Parity with
``js/lifecycle1_live.test.mjs``: a retired or candidate procedure never comes
back as trusted through the Python SDK.

Skips when no service is reachable:
  KSG_LIVE_URL=http://127.0.0.1:3000 python3 -m unittest discover -s python/tests -p 'test_lifecycle1_live.py'
Needs a server with LIFECYCLE1 (knowshowgo #510). Fake data only.
"""

import json
import os
import sys
import time
import unittest

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from client import KnowShowGoClient  # noqa: E402

# Measured n=5 against a local in-memory KSG (see the PR): budget = max(2 s floor, 3 x median).
LIVE_BUDGET_S = 2.0
BASE_URL = os.environ.get("KSG_LIVE_URL") or os.environ.get("KSG_API_URL") or "http://127.0.0.1:3000"
EXPECTED = {"promoted": "promoted", "validated": "validated", "bornCandidate": "candidate", "legacyCandidate": "candidate", "draft": "candidate", "retired": "retired"}


def _reachable():
    try:
        return requests.get(f"{BASE_URL}/health", timeout=2.5).ok
    except requests.RequestException:
        return False


LIVE = _reachable()


@unittest.skipUnless(LIVE, f"no KSG service at {BASE_URL}")
class TestLifecycle1Live(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        suffix = format(int(time.time() * 1000), "x")
        cls.owner = f"lifecycle1-live-py-{suffix}"
        cls.query = f"register fabrikam vendor portal {suffix}"
        cls.client = KnowShowGoClient(BASE_URL, default_owner_user_id=cls.owner)
        cls.ids = {}

        def rest(method, path, body):
            r = requests.request(method, f"{BASE_URL}{path}", json=body, headers={"x-ksg-owner": cls.owner}, timeout=10)
            assert r.status_code < 300, f"{method} {path} -> {r.status_code} {r.text[:200]}"
            return r.json()

        for label in EXPECTED:
            made = rest("POST", "/api/procedures", {
                "goal": f"{cls.query} {label}",
                "site": "https://portal.fabrikam.example.test/vendors",
                "steps": [{"id": "open", "title": "Open the vendor form", "tool": "web.nav", "payload": {"url": "https://portal.fabrikam.example.test/vendors"}}],
            })
            cls.ids[label] = made["id"]
        c, ids = cls.client, cls.ids
        c.record_procedure_run(ids["promoted"], True, verified_by="tool", site="https://a.example.test")
        c.record_procedure_run(ids["promoted"], True, verified_by="email", evidence="confirmation CNF-1001", site="https://b.example.test")
        c.record_procedure_run(ids["promoted"], True, verified_by="api", evidence="record REC-2002", site="https://a.example.test")
        c.record_procedure_run(ids["validated"], True, verified_by="tool")
        rest("POST", f"/api/procedures/{ids['bornCandidate']}/runs", {"ok": True, "verifiedBy": "page", "origin": True})
        mark = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "seq": int(time.time() * 1e6) + 1, "status": "verified", "by": "the page confirmed it"}
        rest("POST", "/api/assertions", {"subject": ids["legacyCandidate"], "predicate": "verification", "object": json.dumps(mark), "source": "agent"})
        c.record_procedure_run(ids["retired"], True, verified_by="page")
        c.record_procedure_run(ids["retired"], False, failure="the submit button moved")
        assert c.record_procedure_run(ids["retired"], False, failure="the submit button moved")["status"] == "retired"

    def setUp(self):
        self.t0 = time.monotonic()

    def tearDown(self):
        self.assertLess(time.monotonic() - self.t0, LIVE_BUDGET_S)

    def name_of(self, uuid):
        return next((k for k, v in self.ids.items() if v == uuid), None)

    def test_lifecycle_read_matches_ksg_state(self):
        for label, state in EXPECTED.items():
            lc = self.client.get_procedure_lifecycle(self.ids[label])
            self.assertEqual((label, lc["state"], lc["trusted"]), (label, state, state in ("validated", "promoted")))
        self.assertTrue(self.client.get_procedure_lifecycle(self.ids["legacyCandidate"])["legacy"])

    def test_default_searches_return_only_trusted(self):
        hits = self.client.search_procedures(self.query, top_k=20)
        self.assertTrue(all(h["trusted"] is True and h["state"] in ("validated", "promoted") for h in hits))
        self.assertEqual(sorted(filter(None, (self.name_of(h["uuid"]) for h in hits))), ["promoted", "validated"])
        out = self.client.search_verified_procedures(goal=self.query, limit=20)
        self.assertEqual(sorted(filter(None, (self.name_of(h["id"]) for h in out["results"]))), ["promoted", "validated"])

    def test_include_all_labels_every_state(self):
        hits = [h for h in self.client.search_procedures(self.query, top_k=20, include="all") if self.name_of(h["uuid"])]
        self.assertEqual(sorted(self.name_of(h["uuid"]) for h in hits), sorted(EXPECTED))
        for h in hits:
            self.assertEqual(h["trusted"], EXPECTED[self.name_of(h["uuid"])] in ("validated", "promoted"))


if __name__ == "__main__":
    unittest.main()
