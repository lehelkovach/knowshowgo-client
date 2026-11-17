"""LIFECYCLE1 (2026-11-17): the SDK never hands over a candidate or a retired
procedure as trusted. Parity with ``js/lifecycle1.test.mjs``.

KSG's one lifecycle is candidate -> validated -> promoted, and retired from any
of them, computed from run marks. A ``verified`` status is not trust (IR-S3):
the server labels every search hit ``trusted`` (validated or promoted) and
takes ``include="trusted"``.

- ``search_procedures`` and ``search_verified_procedures`` ask for ``trusted``
  by default; asking for ``trusted`` alone, an untrusted hit is dropped on the
  client too (a server that does not know ``trusted`` reads it as ``verified``),
  and every hit carries ``trusted``.
- ``get_procedure_lifecycle(uuid)`` reads ``GET /procedures/:uuid?source=dagjson``,
  falling back to the full read for a procedure stored without a dagJson.

Transport mocked; no server. Run-time budget asserted per test. Fake data only.
"""

import os
import sys
import time
import unittest
from unittest.mock import MagicMock

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from client import KnowShowGoClient  # noqa: E402

# Measured n=5 runs of this file (see the PR): budget = max(0.25 s floor, 3 x median).
LIFECYCLE1_BUDGET_S = 0.25
BASE = "https://ksg.example.test"


def U(n):
    return f"00000000-0000-4000-8000-{n:012d}"


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status
        self.headers = requests.structures.CaseInsensitiveDict({"content-type": "application/json"})

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code} error", response=self)

    def json(self):
        return self._payload


def make_client(reply):
    """``reply(method, url, kwargs)`` returns a payload or (payload, status)."""
    client = KnowShowGoClient(BASE)

    def request(method, url, **kwargs):
        out = reply(method, url, kwargs)
        return FakeResponse(*out) if isinstance(out, tuple) else FakeResponse(out)

    client.session.request = MagicMock(side_effect=request)
    return client


def calls(client):
    return [(c.args[0], c.args[1], c.kwargs) for c in client.session.request.call_args_list]


# A server older than LIFECYCLE1 reads `trusted` as `verified`: verified-status
# hits with `state` (IR-S1) and no `trusted` label.
OLD_SERVER_HITS = [
    {"uuid": U(1), "status": "verified", "state": "promoted"},
    {"uuid": U(2), "status": "verified", "state": "validated"},
    {"uuid": U(3), "status": "verified", "state": "candidate", "legacy": True},
    {"uuid": U(4), "status": "verified", "state": "candidate"},
    {"uuid": U(5), "status": "verified"},
]


class TestLifecycle1(unittest.TestCase):
    def setUp(self):
        self.t0 = time.monotonic()

    def tearDown(self):
        took = time.monotonic() - self.t0
        self.assertLess(took, LIFECYCLE1_BUDGET_S, f"run-time budget: took {took * 1000:.0f} ms")

    def test_search_procedures_asks_for_trusted_by_default(self):
        client = make_client(lambda m, u, k: {"results": [], "include": ["trusted"], "excluded": {}})
        client.search_procedures("register a supplier")
        method, url, kwargs = calls(client)[0]
        self.assertEqual((method, url), ("POST", f"{BASE}/api/procedures/search"))
        self.assertEqual(kwargs["json"], {"query": "register a supplier", "topK": 5, "include": "trusted"})

    def test_search_procedures_explicit_include_sent_as_given(self):
        client = make_client(lambda m, u, k: {"results": []})
        client.search_procedures("x", include="verified")
        client.search_procedures("x", include=["trusted", "retired"])
        client.search_procedures("x", include="all")
        self.assertEqual([c[2]["json"]["include"] for c in calls(client)], ["verified", "trusted,retired", "all"])

    def test_search_procedures_trusted_drops_candidates_from_an_old_server(self):
        client = make_client(lambda m, u, k: {"results": [dict(h) for h in OLD_SERVER_HITS], "include": ["verified"]})
        results = client.search_procedures("register a supplier")
        self.assertEqual([(r["uuid"], r["state"], r["trusted"]) for r in results], [(U(1), "promoted", True), (U(2), "validated", True)])

    def test_search_procedures_labels_opt_in_hits(self):
        hits = [
            {"uuid": U(1), "status": "verified", "state": "validated", "trusted": True},
            {"uuid": U(6), "status": "retired", "state": "retired"},
            {"uuid": U(7), "status": "draft", "state": "candidate", "trusted": False},
        ]
        client = make_client(lambda m, u, k: {"results": [dict(h) for h in hits]})
        results = client.search_procedures("x", include=["trusted", "retired", "drafts"])
        self.assertEqual([(r["uuid"], r["trusted"]) for r in results], [(U(1), True), (U(6), False), (U(7), False)])

    def test_search_verified_procedures_trusted_by_default(self):
        reply = {"ok": True, "results": [dict(h, id=h["uuid"]) for h in OLD_SERVER_HITS], "excluded": {"draft": 0, "retired": 0, "otherSite": 0}, "scanned": 5}
        client = make_client(lambda m, u, k: reply)
        out = client.search_verified_procedures(goal="register a supplier")
        method, url, kwargs = calls(client)[0]
        self.assertEqual((method, url), ("GET", f"{BASE}/api2.0/procedures/search"))
        self.assertEqual(kwargs["params"]["include"], "trusted")
        self.assertEqual([(r["id"], r["trusted"]) for r in out["results"]], [(U(1), True), (U(2), True)])
        self.assertEqual(out["excluded"]["candidate"], 3)

    def test_search_verified_procedures_verified_labels_every_hit(self):
        client = make_client(lambda m, u, k: {"ok": True, "results": [dict(h, id=h["uuid"]) for h in OLD_SERVER_HITS], "excluded": {}})
        out = client.search_verified_procedures(goal="x", include="verified")
        self.assertEqual(calls(client)[0][2]["params"]["include"], "verified")
        self.assertEqual([r["trusted"] for r in out["results"]], [True, True, False, False, False])

    def test_get_procedure_lifecycle(self):
        current = {"uuid": U(31), "version": 2, "state": "validated", "stateBasis": "runs"}
        promotion = {"eligible": False, "independentVerifiedRuns": 1, "sites": 1}
        lifecycle = {"status": "verified", "state": "validated", "promotion": promotion, "currentVersion": current}
        client = make_client(lambda m, u, k: {"id": U(30), "steps": [], "status": "verified", "state": "validated", "lifecycle": lifecycle, "runs": [{"id": "r1"}]})
        out = client.get_procedure_lifecycle(U(30))
        self.assertEqual(len(calls(client)), 1)
        method, url, kwargs = calls(client)[0]
        self.assertEqual((method, url), ("GET", f"{BASE}/api2.0/procedures/{U(30)}"))
        self.assertEqual(kwargs["params"]["source"], "dagjson")
        self.assertEqual(out, {
            "procedureId": U(30), "status": "verified", "state": "validated", "trusted": True, "legacy": False,
            "legacyReason": None, "promotion": promotion, "validation": None, "currentVersion": current, "runCount": 1,
            "lifecycle": lifecycle,
        })

    def test_get_procedure_lifecycle_candidate_and_retired_never_trusted(self):
        for state, status, extra in [("candidate", "verified", {"legacy": True, "legacyReason": "saved with no verdict"}), ("candidate", "draft", {}), ("retired", "retired", {})]:
            client = make_client(lambda m, u, k: {"id": U(30), "status": status, "state": state, "lifecycle": dict(status=status, state=state, **extra), "runs": []})
            out = client.get_procedure_lifecycle(U(30))
            self.assertFalse(out["trusted"], (status, state))
            self.assertEqual(out["legacy"], bool(extra.get("legacy")))

    def test_get_procedure_lifecycle_falls_back_without_dagjson(self):
        def reply(m, u, k):
            if (k.get("params") or {}).get("source") == "dagjson":
                return ({"error": "Procedure not found"}, 404)
            return {"id": U(30), "status": "verified", "state": "promoted", "lifecycle": {"status": "verified", "state": "promoted"}, "runs": []}
        client = make_client(reply)
        out = client.get_procedure_lifecycle(U(30))
        self.assertEqual(len(calls(client)), 2)
        self.assertNotIn("source", calls(client)[1][2].get("params") or {})
        self.assertEqual((out["state"], out["trusted"]), ("promoted", True))

    def test_get_procedure_lifecycle_missing_and_empty(self):
        client = make_client(lambda m, u, k: ({"error": "Procedure not found"}, 404))
        with self.assertRaises(requests.HTTPError) as ctx:
            client.get_procedure_lifecycle(U(99))
        self.assertEqual(ctx.exception.response.status_code, 404)
        with self.assertRaises(ValueError):
            client.get_procedure_lifecycle("")


if __name__ == "__main__":
    unittest.main()
