"""Contract tests for the SDK catch-up to knowshowgo ``dev`` (server 0.2.42 + K1/K2,
origin/dev 58d1f3b2): events and episodes, Logic IR rules, procedure runs,
procedure versions and verified facts.

Parity with ``js/server_parity.test.mjs``. The transport is mocked, so these
pin the request each method sends and that the server's response comes back
untouched. Every shape is copied from the server source; the file:line in each
test is where to look when the server changes (paths relative to the
knowshowgo repo).
"""

import os
import sys
import unittest
from unittest.mock import MagicMock

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from client import KnowShowGoClient  # noqa: E402

BASE = "https://ksg.example.test"


def U(n):
    return f"00000000-0000-4000-8000-{n:012d}"


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code} error", response=self)

    def json(self):
        return self._payload


def make_client(payload=None, status=200, **kwargs):
    client = KnowShowGoClient(BASE, **kwargs)
    client.session.request = MagicMock(return_value=FakeResponse(payload if payload is not None else {"ok": True}, status))
    return client


def last_call(client):
    args, kwargs = client.session.request.call_args
    return args[0], args[1], kwargs


class TestEventsAndEpisodes(unittest.TestCase):
    # src/server/rest-api.js:6497 POST /events -> recordEvent (src/semantic_event/events.js:129);
    # body keys at rest-api.js:6504-6510; response is loadEvent's shape (events.js:285) + created, reused, lineageKey.
    def test_record_event_posts_kg10_body(self):
        reply = {"ok": True, "event": {"uuid": U(9)}, "created": True, "reused": False, "lineageKey": "event:abc"}
        client = make_client(reply, 201)
        out = client.record_event(
            U(1),
            roles={"agent": U(2), "beneficiary": U(3)},
            observed_at="2026-11-01",
            episode={"title": "Walk on 2026-11-01"},
            provenance={"source": "test"},
            private=True,
        )
        self.assertEqual(out, reply)
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/events"))
        self.assertEqual(kwargs["json"], {
            "action": U(1),
            "roles": {"agent": U(2), "beneficiary": U(3)},
            "observedAt": "2026-11-01",
            "episode": {"title": "Walk on 2026-11-01"},
            "provenance": {"source": "test"},
            "private": True,
        })

    def test_record_event_sends_only_given_fields_and_requires_action(self):
        client = make_client()
        client.record_event(U(1), roles={"patient": U(4)})
        self.assertEqual(last_call(client)[2]["json"], {"action": U(1), "roles": {"patient": U(4)}})
        with self.assertRaisesRegex(ValueError, "action is required"):
            client.record_event("", roles={"agent": U(2)})

    # rest-api.js:6496 eventStatus: E002 UNRESOLVED_ROLE -> 422 (refuse() at events.js:51).
    def test_record_event_raises_on_unresolved_role(self):
        client = make_client({"ok": False, "code": "E002", "unresolved": [{"role": "agent"}]}, 422)
        with self.assertRaises(requests.HTTPError) as ctx:
            client.record_event(U(1), roles={"agent": U(2)})
        self.assertEqual(ctx.exception.response.json()["code"], "E002")

    # rest-api.js:6518 GET /events: EVENT_ROLES (events.js:36) as query constraints + limit;
    # findEvents (events.js:342) refuses an empty walk (events.js:345).
    def test_find_events_sends_role_constraints(self):
        reply = {"ok": True, "constraints": {"agent": U(2)}, "events": [{"uuid": U(9)}], "count": 1, "complete": True, "limit": 50}
        client = make_client(reply)
        self.assertEqual(client.find_events(agent=U(2), action=U(1), limit=50), reply)
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("GET", f"{BASE}/api2.0/events"))
        self.assertEqual(kwargs["params"], {"action": U(1), "agent": U(2), "limit": 50})
        with self.assertRaisesRegex(ValueError, "at least one role"):
            client.find_events(limit=5)

    # rest-api.js:6530 GET /events/:uuid (loadEvent events.js:263);
    # rest-api.js:6555 GET /episodes/:uuid (loadEpisode events.js:306).
    def test_get_event_and_get_episode(self):
        client = make_client({"ok": True, "event": {"uuid": U(9)}})
        client.get_event(U(9))
        self.assertEqual(last_call(client)[:2], ("GET", f"{BASE}/api2.0/events/{U(9)}"))
        client.get_episode(U(7))
        self.assertEqual(last_call(client)[:2], ("GET", f"{BASE}/api2.0/episodes/{U(7)}"))
        with self.assertRaisesRegex(ValueError, "uuid is required"):
            client.get_event("")
        with self.assertRaisesRegex(ValueError, "uuid is required"):
            client.get_episode(None)

    # rest-api.js:6543 POST /episodes/recall: { pattern, eventVariable, limit };
    # recallEpisodes (src/semantic_event/recall.js:74).
    def test_recall_episodes_posts_pattern(self):
        pattern = [{"subject": "?event", "predicate": "agent", "object": U(2)}]
        reply = {"ok": True, "eventVariable": "event", "episodes": [{"episode": {"uuid": U(7)}, "matches": []}], "count": 1, "complete": True}
        client = make_client(reply)
        self.assertEqual(client.recall_episodes(pattern, event_variable="event", limit=20), reply)
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/episodes/recall"))
        self.assertEqual(kwargs["json"], {"pattern": pattern, "eventVariable": "event", "limit": 20})
        with self.assertRaisesRegex(ValueError, "pattern is required"):
            client.recall_episodes(None)


class TestRules(unittest.TestCase):
    IR = {"kind": "ForAll", "variable": "x", "domain": U(20), "body": {"if": {"kind": "Atom"}, "then": {"kind": "Atom"}}}

    # rest-api.js:6247 POST /logic-ir/rules; createRule (src/logic_ir/rules.js:184).
    def test_create_rule(self):
        reply = {"ok": True, "ruleUuid": U(21), "version": 1, "reused": False, "revision": "r1", "enabled": True, "name": "Northwind eligibility"}
        client = make_client(reply, 201)
        self.assertEqual(client.create_rule("Northwind eligibility", self.IR, description="test rule", provenance={"source": "mandate"}), reply)
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/logic-ir/rules"))
        self.assertEqual(kwargs["json"], {"name": "Northwind eligibility", "ir": self.IR, "description": "test rule", "provenance": {"source": "mandate"}})
        client.create_rule("off", self.IR, enabled=False)
        self.assertIs(last_call(client)[2]["json"]["enabled"], False)
        with self.assertRaisesRegex(ValueError, "name is required"):
            client.create_rule("", self.IR)
        with self.assertRaisesRegex(ValueError, "ir is required"):
            client.create_rule("x", None)

    # rest-api.js:6268 GET /logic-ir/rules (listRules rules.js:252);
    # rest-api.js:6279 GET /logic-ir/rules/:uuid (getRule rules.js:198 + versions, rest-api.js:6285).
    def test_list_and_get_rule(self):
        client = make_client({"ok": True, "rules": [{"uuid": U(21)}]})
        self.assertEqual(client.list_rules()["rules"][0]["uuid"], U(21))
        self.assertEqual(last_call(client)[:2], ("GET", f"{BASE}/api2.0/logic-ir/rules"))
        client.get_rule(U(21))
        self.assertEqual(last_call(client)[:2], ("GET", f"{BASE}/api2.0/logic-ir/rules/{U(21)}"))
        with self.assertRaisesRegex(ValueError, "rule_uuid is required"):
            client.get_rule("")

    # rest-api.js:6291 POST /logic-ir/rules/:uuid/enabled: { enabled: boolean } (400 otherwise, rest-api.js:6295).
    def test_set_rule_enabled(self):
        client = make_client({"ok": True, "enabled": False})
        client.set_rule_enabled(U(21), False)
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/logic-ir/rules/{U(21)}/enabled"))
        self.assertEqual(kwargs["json"], {"enabled": False})
        with self.assertRaisesRegex(ValueError, "enabled must be a boolean"):
            client.set_rule_enabled(U(21), "false")

    # rest-api.js:6313 POST /logic-ir/rules/check; checkRules (rules.js:478) + factsWritten (rest-api.js:6371).
    def test_check_rules(self):
        members = ["Contoso Labs", {"subject": "Northwind Robotics", "facts": [{"predicate": "employees", "object": 40}]}]
        client = make_client({"ok": True, "members": [], "factsWritten": 1})
        client.check_rules([U(21)], members, record=True)
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/logic-ir/rules/check"))
        self.assertEqual(kwargs["json"], {"ruleUuids": [U(21)], "members": members, "record": True})
        client.check_rules([U(21)], ["Contoso Labs"])
        self.assertNotIn("record", last_call(client)[2]["json"])
        with self.assertRaisesRegex(ValueError, "rule_uuids is required"):
            client.check_rules([], members)
        with self.assertRaisesRegex(ValueError, "members is required"):
            client.check_rules([U(21)], [])

    # rest-api.js:6565 POST /logic-ir/rules/:uuid/apply (applyRule rules.js:323);
    # rest-api.js:6380 POST /logic-ir/fixpoint.
    def test_apply_rule_and_saturate(self):
        client = make_client({"ok": True, "fired": []})
        client.apply_rule(U(21), domain_limit=100)
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/logic-ir/rules/{U(21)}/apply"))
        self.assertEqual(kwargs["json"], {"domainLimit": 100})
        client.apply_rule(U(21))
        self.assertEqual(last_call(client)[2]["json"], {})
        client.saturate_rules(rule_uuids=[U(21)], max_rounds=4, max_facts=100, domain_limit=50)
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/logic-ir/fixpoint"))
        self.assertEqual(kwargs["json"], {"ruleUuids": [U(21)], "maxRounds": 4, "maxFacts": 100, "domainLimit": 50})


class TestProcedureRunsAndVersions(unittest.TestCase):
    # rest-api.js:11256 POST /procedures/:uuid/runs (+ /api2.0, rest-api.js:11285);
    # planRun (src/verified_memory/status.js:198); recordRun (src/verified_memory/service.js:311).
    def test_record_procedure_run(self):
        reply = {"ok": True, "run": {"id": "run-1"}, "status": "verified", "state": "validated", "previousStatus": "draft", "retired": False, "revived": False}
        client = make_client(reply, 201)
        out = client.record_procedure_run(U(30), True, verified_by="tool", site="portal.example.test", evidence="confirmation 555")
        self.assertEqual(out, reply)
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/procedures/{U(30)}/runs"))
        self.assertEqual(kwargs["json"], {"ok": True, "verifiedBy": "tool", "site": "portal.example.test", "evidence": "confirmation 555"})
        client.record_procedure_run(U(30), False, failure="submit button missing")
        self.assertEqual(last_call(client)[2]["json"], {"ok": False, "failure": "submit button missing"})
        with self.assertRaisesRegex(ValueError, r"ok \(boolean\) is required"):
            client.record_procedure_run(U(30), None)
        with self.assertRaisesRegex(ValueError, "procedure_uuid is required"):
            client.record_procedure_run("", True)

    # No GET .../runs route on the server: runs, lifecycle and the IR-S1 state come back on
    # GET /procedures/:uuid (rest-api.js:11218, keys at rest-api.js:11231-11243; state from status.js:316).
    # K1: the current version's state rides inside `lifecycle` (service.js:206-212, service.js:220).
    def test_list_procedure_runs(self):
        current = {"uuid": U(31), "version": 2, "state": "validated", "stateBasis": "runs"}
        lifecycle = {"status": "verified", "state": "promoted", "currentVersion": current}
        runs = [{"id": "run-1", "ok": True, "verified": True, "versionUuid": U(31), "version": 2}]
        client = make_client({"id": U(30), "steps": [], "status": "verified", "state": "promoted", "lifecycle": lifecycle, "runs": runs})
        out = client.list_procedure_runs(U(30))
        self.assertEqual(out, {"procedureId": U(30), "status": "verified", "state": "promoted", "currentVersion": current, "lifecycle": lifecycle, "runs": runs})
        self.assertEqual(last_call(client)[:2], ("GET", f"{BASE}/api2.0/procedures/{U(30)}"))
        client.session.request = MagicMock(return_value=FakeResponse({"id": U(30), "status": "draft", "state": "candidate", "lifecycle": {"status": "draft"}, "runs": []}))
        self.assertIsNone(client.list_procedure_runs(U(30))["currentVersion"])

    # K1 (knowshowgo #385): versionUuid / version / heldOut stamped by planRun (status.js:211-215),
    # echoed on `run` (status.js:253); unknown version 400 (service.js:292); verifiers widened (status.js:39).
    def test_record_procedure_run_with_version_and_held_out(self):
        client = make_client({"ok": True, "run": {"id": "run-2", "heldOut": True, "versionUuid": U(31), "version": 2}}, 201)
        out = client.record_procedure_run(U(30), True, verified_by="oracle", site="b.example.test", version_uuid=U(31), held_out=True)
        self.assertEqual(out["run"]["versionUuid"], U(31))
        self.assertEqual(last_call(client)[2]["json"], {"ok": True, "verifiedBy": "oracle", "site": "b.example.test", "versionUuid": U(31), "heldOut": True})
        client.record_procedure_run(U(30), True, verified_by="email", version=2, held_out=False)
        self.assertEqual(last_call(client)[2]["json"], {"ok": True, "verifiedBy": "email", "version": 2})
        with self.assertRaisesRegex(ValueError, "version must be a positive integer"):
            client.record_procedure_run(U(30), True, version=0)

    # K2 (knowshowgo #386): GET /procedures/:uuid/evaluation (rest-api.js:11273, mounted at rest-api.js:11284)
    # -> service.js:254; stats from runStats (evaluation.js:78), regression (evaluation.js:107), state (service.js:260-263).
    def test_get_procedure_evaluation(self):
        reply = {
            "ok": True,
            "procedureId": U(30),
            "procedure": {"runs": 5, "verifiedSuccesses": 3, "failures": 2, "successRate": 0.6, "interval": {"low": 0.23, "high": 0.88, "level": 0.95, "method": "wilson"}},
            "versions": [
                {"uuid": U(32), "version": 3, "stats": {"runs": 0, "successRate": None, "interval": None}, "regression": {"tested": False, "flagged": False, "pValue": None}, "state": "candidate", "stateBasis": "runs"},
                {"uuid": U(31), "version": 2, "stats": {"runs": 5, "verifiedSuccesses": 3}, "regression": None, "state": "retired", "stateBasis": "superseded"},
            ],
            "regression": {"tested": False, "flagged": False, "pValue": None},
            "unattributed": {"runs": 0},
            "method": {"interval": "Wilson score, 95%"},
        }
        client = make_client(reply)
        self.assertEqual(client.get_procedure_evaluation(U(30)), reply)
        self.assertEqual(last_call(client)[:2], ("GET", f"{BASE}/api2.0/procedures/{U(30)}/evaluation"))
        with self.assertRaisesRegex(ValueError, "procedure_uuid is required"):
            client.get_procedure_evaluation("")

    # GET /procedures/search (rest-api.js:11197, mounted at rest-api.js:11282) -> searchProcedures (service.js:359).
    def test_search_verified_procedures(self):
        hit = {"id": U(30), "status": "verified", "state": "validated", "currentVersion": {"uuid": U(31), "version": 2, "state": "validated", "stateBasis": "runs"}}
        reply = {"ok": True, "query": {"goal": "register supplier"}, "results": [hit], "excluded": {}, "scanned": 4}
        client = make_client(reply)
        self.assertEqual(client.search_verified_procedures(goal="register supplier", site="portal.example.test", include=["drafts"], limit=3), reply)
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("GET", f"{BASE}/api2.0/procedures/search"))
        self.assertEqual(kwargs["params"], {"goal": "register supplier", "site": "portal.example.test", "include": "drafts", "limit": 3})
        with self.assertRaisesRegex(ValueError, "goal or site is required"):
            client.search_verified_procedures()

    # POST /api/procedures/search hits carry currentVersion (rest-api.js:11584).
    def test_search_procedures_passes_current_version(self):
        current = {"uuid": U(31), "version": 2, "state": "validated", "stateBasis": "runs"}
        client = make_client({"results": [{"uuid": U(30), "state": "validated", "currentVersion": current}]})
        self.assertEqual(client.search_procedures("register supplier")[0]["currentVersion"], current)

    # rest-api.js:9456 POST /procedures/:uuid/versions -> 201 { ok, procedureVersion, capabilityResolution }.
    def test_create_procedure_version(self):
        client = make_client({"ok": True, "procedureVersion": {"uuid": U(31)}}, 201)
        client.create_procedure_version(U(30), status="dogfood", provides=["forms.supplier_registration"], requires=[])
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/procedures/{U(30)}/versions"))
        self.assertEqual(kwargs["json"], {"status": "dogfood", "requires": [], "provides": ["forms.supplier_registration"]})

    # rest-api.js:9536 list, 9559 by number (positive integer, rest-api.js:9563), 9585 by uuid.
    # K1: every view carries state, stateBasis, statusAsState, statusDeprecated, lifecycle beside
    # `status` (versionView, service.js:273); the list adds unattributedRuns (rest-api.js:9545-9553).
    def test_list_and_get_procedure_versions(self):
        v = {"uuid": U(31), "version": 2, "status": "tested", "state": "validated", "stateBasis": "runs",
             "statusAsState": "validated", "statusDeprecated": True, "lifecycle": {"runCount": 2, "heldOutVerifiedRuns": 1}}
        client = make_client({"ok": True, "procedureId": U(30), "count": 1, "latest": v, "versions": [v], "unattributedRuns": 0})
        listed = client.list_procedure_versions(U(30))
        self.assertEqual(listed["unattributedRuns"], 0)
        self.assertEqual(listed["versions"][0]["status"], "tested")
        self.assertEqual(listed["versions"][0]["state"], "validated")
        self.assertIs(listed["versions"][0]["statusDeprecated"], True)
        self.assertEqual(last_call(client)[:2], ("GET", f"{BASE}/api2.0/procedures/{U(30)}/versions"))
        client.get_procedure_version_by_number(U(30), 2)
        self.assertEqual(last_call(client)[:2], ("GET", f"{BASE}/api2.0/procedures/{U(30)}/versions/2"))
        client.get_procedure_version(U(31))
        self.assertEqual(last_call(client)[:2], ("GET", f"{BASE}/api2.0/procedure-versions/{U(31)}"))
        with self.assertRaisesRegex(ValueError, "version must be a positive integer"):
            client.get_procedure_version_by_number(U(30), 0)

    # rest-api.js:9598 POST /procedure-versions/:uuid/status; 409 status_terminal (rest-api.js:9624-9633).
    def test_transition_procedure_version(self):
        client = make_client({"ok": True, "transition": {"to": "validated"}})
        client.transition_procedure_version(U(31), "validated", reason="held-out pass")
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/procedure-versions/{U(31)}/status"))
        self.assertEqual(kwargs["json"], {"status": "validated", "reason": "held-out pass"})
        with self.assertRaisesRegex(ValueError, "status is required"):
            client.transition_procedure_version(U(31), "")
        client.session.request = MagicMock(return_value=FakeResponse({"error": "status_terminal"}, 409))
        with self.assertRaises(requests.HTTPError):
            client.transition_procedure_version(U(31), "draft")


class TestVerifiedFacts(unittest.TestCase):
    # rest-api.js:12187 / 12337 POST /api2.0/facts -> addFact (src/verified_memory/service.js:428).
    def test_add_fact(self):
        client = make_client({"ok": True, "fact": {"id": U(40), "status": "candidate"}}, 201)
        client.add_fact("Northwind Robotics", "duns", "000000000", provenance={"source": "portal"}, visibility="private")
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/facts"))
        self.assertEqual(kwargs["json"], {"subject": "Northwind Robotics", "predicate": "duns", "object": "000000000", "status": "candidate", "provenance": {"source": "portal"}, "visibility": "private"})
        with self.assertRaisesRegex(ValueError, "obj is required"):
            client.add_fact("s", "p", None)

    # rest-api.js:12291 GET /facts (listFacts service.js:457); rest-api.js:12305 GET /facts/:id.
    def test_list_and_get_fact(self):
        client = make_client({"ok": True, "facts": [], "total": 0})
        client.list_facts(subject="Northwind Robotics", include=["candidates", "corrected"], limit=10)
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("GET", f"{BASE}/api2.0/facts"))
        self.assertEqual(kwargs["params"], {"subject": "Northwind Robotics", "include": "candidates,corrected", "limit": 10})
        client.get_fact(U(40))
        self.assertEqual(last_call(client)[:2], ("GET", f"{BASE}/api2.0/facts/{U(40)}"))

    # rest-api.js:12314 POST /facts/:id/confirm { by?, provenance? } (confirmFact service.js:504; 409 at service.js:507).
    def test_confirm_fact(self):
        client = make_client({"ok": True, "fact": {"id": U(40), "status": "confirmed"}})
        out = client.confirm_fact(U(40), by="person", provenance={"source": "review"})
        self.assertEqual(out["fact"]["status"], "confirmed")
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/facts/{U(40)}/confirm"))
        self.assertEqual(kwargs["json"], {"by": "person", "provenance": {"source": "review"}})
        client.confirm_fact(U(40))
        self.assertEqual(last_call(client)[2]["json"], {})
        with self.assertRaisesRegex(ValueError, "fact_id is required"):
            client.confirm_fact("")
        client.session.request = MagicMock(return_value=FakeResponse({"error": "corrected", "replacedBy": U(41)}, 409))
        with self.assertRaises(requests.HTTPError):
            client.confirm_fact(U(40))

    # rest-api.js:12328 POST /facts/:id/correct { object, provenance? } -> 201 { ok, fact, corrected } (service.js:523).
    def test_correct_fact(self):
        client = make_client({"ok": True, "fact": {"id": U(41)}, "corrected": {"id": U(40)}}, 201)
        client.correct_fact(U(40), "111111111", provenance={"source": "review"})
        method, url, kwargs = last_call(client)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/facts/{U(40)}/correct"))
        self.assertEqual(kwargs["json"], {"object": "111111111", "provenance": {"source": "review"}})
        with self.assertRaisesRegex(ValueError, "obj is required"):
            client.correct_fact(U(40), "")


class TestConventions(unittest.TestCase):
    def test_prefix_and_identity_follow_the_client(self):
        client = make_client(prototype_api_prefix="/api", auth_token="test-token-not-real", default_owner_user_id="owner-avery-example")
        client.list_rules()
        self.assertEqual(last_call(client)[1], f"{BASE}/api/logic-ir/rules")
        client.record_procedure_run(U(30), True)
        self.assertEqual(last_call(client)[1], f"{BASE}/api/procedures/{U(30)}/runs")
        client.confirm_fact(U(40))
        method, url, kwargs = last_call(client)
        self.assertEqual(url, f"{BASE}/api/facts/{U(40)}/confirm")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-token-not-real")
        self.assertEqual(kwargs["headers"]["X-KSG-Owner"], "owner-avery-example")

    def test_js_and_python_expose_the_same_new_methods(self):
        names = [
            "create_rule", "list_rules", "get_rule", "set_rule_enabled", "check_rules", "apply_rule", "saturate_rules",
            "record_event", "find_events", "get_event", "get_episode", "recall_episodes",
            "record_procedure_run", "list_procedure_runs",
            "create_procedure_version", "list_procedure_versions", "get_procedure_version_by_number",
            "get_procedure_version", "transition_procedure_version",
            "get_procedure_evaluation", "search_verified_procedures",
            "add_fact", "list_facts", "get_fact", "confirm_fact", "correct_fact",
        ]
        js_path = os.path.join(os.path.dirname(__file__), "..", "..", "js", "client.js")
        with open(js_path, encoding="utf-8") as fh:
            js = fh.read()
        for name in names:
            self.assertTrue(callable(getattr(KnowShowGoClient, name, None)), f"python lacks {name}")
            self.assertIn(f"\n  {name}(", js, f"js lacks {name}")


if __name__ == "__main__":
    unittest.main()
