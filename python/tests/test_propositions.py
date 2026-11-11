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


if __name__ == "__main__":
    unittest.main()
