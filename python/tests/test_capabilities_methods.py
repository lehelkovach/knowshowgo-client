"""CS1: Python parity for the methods in ``js/capabilities_methods.test.mjs``.

Mocked transport; fake data only.
"""

import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from client import KnowShowGoClient  # noqa: E402

BASE = "https://ksg.example.test"
U1 = "00000000-0000-4000-8000-000000000001"
U2 = "00000000-0000-4000-8000-000000000002"


class FakeResponse:
    def __init__(self, payload=None):
        self._payload = payload or {"ok": True}

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def make_client(**kwargs):
    client = KnowShowGoClient(BASE, **kwargs)
    client.session.request = MagicMock(return_value=FakeResponse())
    return client


def last(client):
    args, kwargs = client.session.request.call_args
    return args[0], args[1], kwargs


class CapabilityMethodsTest(unittest.TestCase):
    def test_articles_and_typed_values(self):
        c = make_client()
        c.amend_article(U2, predicate="founded", value_type="date", value="2001-04-01", replaces_claim=U1)
        method, url, kw = last(c)
        self.assertEqual((method, url), ("POST", f"{BASE}/api2.0/articles/{U2}/claims"))
        self.assertEqual(kw["json"], {"predicate": "founded", "valueType": "date", "value": "2001-04-01", "replacesClaim": U1})
        c.declare_predicate("website", "url", attach_to=U1)
        method, url, kw = last(c)
        self.assertEqual(url, f"{BASE}/api2.0/predicates/declare")
        self.assertEqual(kw["json"], {"name": "website", "valueType": "url", "attachTo": U1})
        c.search_articles("Contoso", range=["Organization"])
        self.assertEqual(last(c)[2]["params"], {"q": "Contoso", "range": "Organization"})
        c.list_value_types()
        self.assertEqual(last(c)[1], f"{BASE}/api2.0/value-types")
        c.get_prototype_fields(U1)
        self.assertEqual(last(c)[1], f"{BASE}/api2.0/prototypes/{U1}/fields")

    def test_concepts_logic_and_taxonomy(self):
        c = make_client()
        c.find_or_create_concept("Avery Example", prototype_name="Person")
        self.assertEqual(last(c)[2]["json"], {"label": "Avery Example", "prototypeName": "Person"})
        c.merge_concepts(U1, [U2], reason="same person")
        self.assertEqual(last(c)[2]["json"], {"survivor": U1, "members": [U2], "reason": "same person"})
        c.get_derivation_tree(U1, max_depth=3)
        self.assertEqual(last(c)[1], f"{BASE}/api2.0/logic-ir/derivations/{U1}/tree")
        self.assertEqual(last(c)[2]["params"], {"maxDepth": 3})
        c.get_taxonomy_duplicates()
        self.assertEqual(last(c)[1], f"{BASE}/api2.0/taxonomy/duplicates")
        c.reconcile_inferred_propositions("Contoso")
        self.assertEqual(last(c)[2]["json"], {"label": "Contoso"})

    def test_for_owner_sends_that_owners_token(self):
        c = make_client(auth_token="ksg_service_token_fake")
        avery = c.for_owner(auth_token="ksg_avery_token_fake", owner_user_id="avery")
        avery.get_article(U2)
        headers = last(c)[2]["headers"]
        self.assertEqual(headers["Authorization"], "Bearer ksg_avery_token_fake")
        self.assertEqual(headers["X-KSG-Owner"], "avery")
        c.get_article(U2)
        self.assertEqual(last(c)[2]["headers"]["Authorization"], "Bearer ksg_service_token_fake")
        self.assertNotIn("X-KSG-Owner", last(c)[2]["headers"])


if __name__ == "__main__":
    unittest.main()
