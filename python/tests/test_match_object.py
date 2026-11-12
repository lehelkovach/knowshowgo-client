"""AC1: ``match_prototypes(object=...)`` plus the taxonomy / lookup / CE3d
stats methods. Parity with ``js/match_object.test.mjs``. Fake data only."""

import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from knowshowgo_client.client import KnowShowGoClient, object_to_match_text  # noqa: E402

BASE = "https://ksg.example.test"
U = lambda n: f"00000000-0000-4000-8000-{n:012d}"  # noqa: E731
THING, PERSON, ORG, LEGACY = U(1), U(2), U(3), U(9)


def prop(name, schema_name=None):
    return {"name": name, "schemaName": schema_name}


TREE = {
    "ok": True,
    "root": {"uuid": THING, "name": "Thing"},
    "nodes": [
        {"uuid": THING, "name": "Thing", "parents": [], "properties": [prop("name"), prop("url"), prop("description")]},
        {"uuid": PERSON, "name": "Person", "parents": [THING], "properties": [prop("birth_date", "birthDate"), prop("works_for", "worksFor"), prop("nationality")]},
        {"uuid": ORG, "name": "Organization", "parents": [THING], "properties": [prop("founding_date"), prop("employee"), prop("legal_name")]},
    ],
}
MATCHES = {"matches": [
    {"uuid": ORG, "name": "Organization", "score": 0.61, "centroidScore": 0.62},
    {"uuid": PERSON, "name": "Person", "score": 0.60, "centroidScore": 0.59},
    {"uuid": LEGACY, "name": "ProcedureRun", "score": 0.40, "centroidScore": 0.40},
]}


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


def routed_client(routes):
    client = KnowShowGoClient(BASE)
    calls = []

    def request(method, url, **kwargs):
        path = url[len(BASE):]
        calls.append({"method": method, "path": path, **kwargs})
        payload = routes.get(f"{method} {path}")
        if payload is None:
            return FakeResponse({"error": "no route"}, 404)
        return FakeResponse(payload[0], payload[1]) if isinstance(payload, tuple) else FakeResponse(payload)

    client.session.request = MagicMock(side_effect=request)
    return client, calls


class MatchObjectTest(unittest.TestCase):
    def test_object_ranked_with_typicality_and_evidence(self):
        client, calls = routed_client({"POST /api2.0/prototypes/match": MATCHES, "GET /api2.0/taxonomy": TREE})
        obj = {"label": "Avery Example", "properties": {"birthDate": "1990-04-02", "works_for": "Contoso", "nationality": "Utopia", "favorite_color": "teal"}}
        ranked = client.match_prototypes(object=obj, top_k=3)
        body = calls[0]["json"]
        self.assertIn("works for: Contoso", body["text"])
        self.assertEqual(body["topK"], 25)
        self.assertEqual([r["name"] for r in ranked], ["Person", "Organization", "ProcedureRun"])
        person = ranked[0]
        self.assertEqual(person["typicality"], 0.59)
        self.assertEqual(sorted(person["evidence"]["matched"]), ["birth_date", "nationality", "works_for"])
        self.assertEqual(person["evidence"]["extra"], ["favorite_color"])
        self.assertEqual(person["evidence"]["overlap"], 0.75)
        self.assertEqual(person["evidence"]["isA"], ["Person", "Thing"])
        self.assertFalse(ranked[2]["evidence"]["schema"])
        self.assertEqual(ranked[2]["rankScore"], ranked[2]["score"])

    def test_taxonomy_cached_and_failure_tolerated(self):
        client, calls = routed_client({"POST /api2.0/prototypes/match": MATCHES, "GET /api2.0/taxonomy": ({"error": "boom"}, 500)})
        ranked = client.match_prototypes(object={"label": "Avery Example", "properties": {"nationality": "Utopia"}})
        self.assertEqual(ranked[0]["name"], "Organization")
        client.match_prototypes(object={"label": "Contoso", "properties": {"legal_name": "Contoso Ltd"}})
        self.assertEqual(len([c for c in calls if c["path"] == "/api2.0/taxonomy"]), 1)

    def test_text_only_unchanged(self):
        client, calls = routed_client({"POST /api2.0/prototypes/match": MATCHES})
        out = client.match_prototypes(text="a person", top_k=2)
        self.assertEqual(calls[0]["json"]["topK"], 2)
        self.assertNotIn("evidence", out[0])

    def test_object_text(self):
        text = object_to_match_text({"name": "Contoso", "founding_date": "2001", "employee": [{"label": "Avery Example"}, "Dana Example"], "uuid": U(5)})
        self.assertTrue(text.startswith("Contoso."))
        self.assertIn("employee: Avery Example, Dana Example", text)
        self.assertNotIn("00000000", text)


class PublicRoutesTest(unittest.TestCase):
    def test_lookup_stats_taxonomy(self):
        client, calls = routed_client({
            "POST /api2.0/concepts/lookup": {"ok": True},
            "GET /api2.0/propositions/inferred/stats": {"proposed": 0},
            "GET /api2.0/taxonomy": TREE,
            f"GET /api2.0/taxonomy/prototypes/{PERSON}": {"ok": True},
            f"GET /api2.0/taxonomy/nodes/{U(5)}": {"ok": True},
        })
        client.lookup_concept(term="Contoso", context="company")
        self.assertEqual(calls[0]["json"]["term"], "Contoso")
        self.assertEqual(client.get_inferred_proposition_stats()["proposed"], 0)
        client.get_taxonomy(root="Thing")
        self.assertEqual(calls[2]["params"], {"root": "Thing"})
        client.get_taxonomy_prototype(PERSON)
        client.get_taxonomy_node(U(5), history=True)
        self.assertEqual(calls[4]["params"], {"history": 1})


if __name__ == "__main__":
    unittest.main()
