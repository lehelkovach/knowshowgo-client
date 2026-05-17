import sys
import unittest
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from client import KnowShowGoClient  # noqa: E402


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self):
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, **kwargs})
        if "/snapshot" in url:
            return FakeResponse({"snapshot": {"label": "current"}})
        if "/evidence" in url:
            return FakeResponse({"evidence": [{"predicate": "label"}]})
        if "/procedures/search" in url:
            return FakeResponse({"results": [{"uuid": "proc-1"}]})
        if "/concepts/search" in url:
            return FakeResponse({"results": [{"uuid": "concept-1"}]})
        return FakeResponse({"ok": True, "uuid": "uuid-1"})


class KnowShowGoClientDevApiTest(unittest.TestCase):
    def setUp(self):
        self.session = FakeSession()
        self.client = KnowShowGoClient("http://ksg.test/")
        self.client.session = self.session

    def test_dev_api_methods_map_to_routes_and_payloads(self):
        self.client.resolve_tag(phrase="#[Machine Learning]", top_k=3, create_if_missing=True)
        self.client.suggest(text="machin learn", context={"app": "test"}, create_tag_if_missing=True)
        self.client.create_topic(label="Machine Learning", aliases=["ML"])
        self.client.get_topic("topic/1")
        self.client.create_category(name="Person", properties=[{"name": "birthDate", "type": "date"}])
        self.client.get_category("cat/1")
        self.client.upsert_object(
            title="David Bowie",
            category_name="Person",
            tags=["#[david bowie]"],
            properties=[{"name": "sameAs", "type": "url", "value": "https://example.test/bowie"}],
        )
        self.client.get_object("object/1")
        self.client.resolve_object(title="David Bowie", category_prototype_uuid="cat-1")
        self.assertEqual(self.client.get_snapshot("object/1"), {"label": "current"})
        self.assertEqual(self.client.get_evidence("object/1", predicate="label"), [{"predicate": "label"}])
        self.client.create_procedure(title="Login", steps=[{"title": "Open site"}])
        self.client.get_procedure("proc/1")
        self.client.insert_procedure_step("proc/1", title="Submit", after_step_uuid="step-1")
        self.client.generalize_procedure("proc/1", title="Generic login", mode="schema_only")
        self.assertEqual(self.client.search_procedures("login", top_k=2), [{"uuid": "proc-1"}])
        self.client.search_concept_objects("david bowie", top_k=4)

        self.assertEqual(
            [(call["method"], urlparse(call["url"]).path) for call in self.session.calls],
            [
                ("POST", "/api/topics/resolve-tag"),
                ("POST", "/api/concept-objects/suggest"),
                ("POST", "/api/topics"),
                ("GET", "/api/topics/topic%2F1"),
                ("POST", "/api/object-categories"),
                ("GET", "/api/object-categories/cat%2F1"),
                ("POST", "/api/objects/upsert"),
                ("GET", "/api/objects/object%2F1"),
                ("POST", "/api/objects/resolve"),
                ("GET", "/api/entities/object%2F1/snapshot"),
                ("GET", "/api/entities/object%2F1/evidence"),
                ("POST", "/api/procedures"),
                ("GET", "/api/procedures/proc%2F1"),
                ("POST", "/api/procedures/proc%2F1/steps"),
                ("POST", "/api/procedures/proc%2F1/generalize"),
                ("POST", "/api/procedures/search"),
                ("POST", "/api/concept-objects/search"),
            ],
        )

        self.assertEqual(self.session.calls[0]["json"]["phrase"], "#[Machine Learning]")
        self.assertEqual(self.session.calls[0]["json"]["topK"], 3)
        self.assertTrue(self.session.calls[1]["json"]["createTagIfMissing"])
        self.assertEqual(self.session.calls[6]["json"]["properties"][0]["name"], "sameAs")
        self.assertEqual(self.session.calls[8]["json"]["title"], "David Bowie")
        self.assertEqual(self.session.calls[10]["params"]["predicate"], "label")
        self.assertEqual(self.session.calls[13]["json"]["afterStepUuid"], "step-1")
        self.assertEqual(self.session.calls[15]["json"]["topK"], 2)
        self.assertEqual(self.session.calls[16]["json"]["query"], "david bowie")


if __name__ == "__main__":
    unittest.main()

