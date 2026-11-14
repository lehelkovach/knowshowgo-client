"""KG-P1 contract: ``assert_proposition``. Parity with ``js/propositions.test.mjs``.

Mocked transport; the body shape is the one ``writePropositionFromRequest``
reads in knowshowgo ``src/server/rest-api.js``. Fake data only.
"""

import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from client import KnowShowGoClient  # noqa: E402

BASE = "https://ksg.example.test"


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def make_client(payload=None):
    client = KnowShowGoClient(BASE)
    client.session.request = MagicMock(return_value=FakeResponse(payload or {"ok": True}))
    return client


class AssertPropositionTest(unittest.TestCase):
    def test_posts_proposition_body(self):
        client = make_client({"ok": True, "claim": {"uuid": "c1"}})
        out = client.assert_proposition(
            subject="Avery Example", subject_prototype="Person", predicate="email",
            value="avery@example.test", scope="private", provenance={"statedBy": "owner"}, replace=True,
        )
        self.assertEqual(out["claim"]["uuid"], "c1")
        args, kwargs = client.session.request.call_args
        self.assertEqual(args[0], "POST")
        self.assertEqual(args[1], f"{BASE}/api2.0/propositions")
        self.assertEqual(kwargs["json"], {
            "subject": "Avery Example", "subjectPrototype": "Person", "predicate": "email",
            "value": "avery@example.test", "provenance": {"statedBy": "owner"}, "replace": True,
            "securityClass": "private",
        })

    def test_entity_object_and_uuid_subject(self):
        client = make_client()
        client.assert_proposition(subject_uuid="u1", predicate="works for", obj="Contoso", object_prototype="Organization")
        _, kwargs = client.session.request.call_args
        self.assertEqual(kwargs["json"], {"subjectUuid": "u1", "predicate": "works for", "object": "Contoso", "objectPrototype": "Organization"})


class LogicForAgentsTest(unittest.TestCase):
    def last(self, client):
        args, kwargs = client.session.request.call_args
        return args[0], args[1], kwargs["json"]

    def test_bind_pattern_with_label_term(self):
        client = make_client()
        pattern = [{"subject": {"label": "Avery Example", "prototype": "Person"}, "predicate": "email", "object": "?e"}]
        client.bind_pattern(pattern, describe=True)
        self.assertEqual(self.last(client), ("POST", f"{BASE}/api2.0/logic-ir/bind", {"pattern": pattern, "describe": True}))

    def test_close_relation_joins_predicates_membership(self):
        client = make_client()
        client.close_relation("manager_of")
        self.assertEqual(self.last(client), ("POST", f"{BASE}/api2.0/logic-ir/closure", {"predicate": "manager_of"}))
        client.evaluate_joins([{"name": "skip", "ir": {"kind": "ForAll"}}])
        self.assertEqual(self.last(client)[1], f"{BASE}/api2.0/logic-ir/joins")
        client.ensure_predicate("skip_manager_of")
        self.assertEqual(self.last(client), ("POST", f"{BASE}/api2.0/predicates", {"name": "skip_manager_of"}))
        client.check_membership("s1", "c1")
        self.assertEqual(self.last(client), ("POST", f"{BASE}/api2.0/prototypes/membership", {"subject": "s1", "category": "c1"}))


    def test_ka4b_exclude_claims_and_describe(self):
        client = make_client()
        client.close_relation("supplies", exclude_claims=["c7"], describe=True)
        self.assertEqual(self.last(client), ("POST", f"{BASE}/api2.0/logic-ir/closure",
                                             {"predicate": "supplies", "excludeClaims": ["c7"], "describe": True}))
        rules = [{"name": "tier2", "ir": {"kind": "ForAll"}}]
        client.evaluate_joins(rules, exclude_claims=["c8", "c9"], describe=True)
        self.assertEqual(self.last(client), ("POST", f"{BASE}/api2.0/logic-ir/joins",
                                             {"rules": rules, "excludeClaims": ["c8", "c9"], "describe": True}))
        client.close_relation("supplies")
        self.assertEqual(self.last(client)[2], {"predicate": "supplies"})
        client.evaluate_joins(rules, exclude_claims=[])
        self.assertEqual(self.last(client)[2], {"rules": rules, "excludeClaims": []})
        with self.assertRaises(ValueError):
            client.close_relation("supplies", exclude_claims="c1")


    def test_r6_ground_by_centroid_and_assimilate_evidence(self):
        client = make_client()
        client.ground(term="tin", method="centroid", k=3, margin=0.08, targets="prototypes")
        self.assertEqual(self.last(client)[2], {"ownerUserId": None, "term": "tin", "method": "centroid", "k": 3, "margin": 0.08, "targets": "prototypes"})
        items = [{"term": "tin", "expect": "Metal"}]
        client.ground(method="centroid", items=items)
        self.assertEqual(self.last(client)[2], {"ownerUserId": None, "method": "centroid", "items": items})
        with self.assertRaises(ValueError):
            client.ground(items=items)
        client.ground(term="tin")
        self.assertEqual(self.last(client)[2], {"ownerUserId": None, "term": "tin"})
        client.assimilate_exemplar("s1", "c1", evidence={"kind": "verified_run", "ref": "run:1"})
        self.assertEqual(self.last(client)[2], {"subject": "s1", "category": "c1", "evidence": {"kind": "verified_run", "ref": "run:1"}})
        client.assimilate_exemplar("s1", "c1")
        self.assertEqual(self.last(client)[2], {"subject": "s1", "category": "c1"})


if __name__ == "__main__":
    unittest.main()
