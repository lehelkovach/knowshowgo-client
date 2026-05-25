import unittest

from python.client import KnowShowGoClient


class FakeResponse:
    def __init__(self):
        self.payload = {
            "ok": True,
            "assertions": [],
            "snapshot": {},
            "evidence": []
        }

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, calls):
        self.calls = calls

    def request(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        return FakeResponse()


class KnowShowGoClientSemanticApiTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.client = KnowShowGoClient("https://ksg.example/")
        self.client.session = FakeSession(self.calls)

    def assert_request(self, invoke, method, path, json_body=None, params=None):
        before = len(self.calls)
        invoke()
        call = self.calls[before]
        self.assertEqual(call["method"], method)
        self.assertEqual(call["url"], f"https://ksg.example{path}")
        self.assertEqual(call["kwargs"].get("json"), json_body)
        self.assertEqual(call["kwargs"].get("params", {}), params or {})

    def test_current_semantic_api_methods_issue_expected_rest_requests(self):
        self.assert_request(lambda: self.client.create_topic({"label": "Topic"}), "POST", "/api/topics", {"label": "Topic"})
        self.assert_request(lambda: self.client.get_topic("topic/id"), "GET", "/api/topics/topic%2Fid")
        self.assert_request(lambda: self.client.resolve_topic_tag({"phrase": "#[topic]"}), "POST", "/api/topics/resolve-tag", {"phrase": "#[topic]"})
        self.assert_request(lambda: self.client.create_category({"name": "Person"}), "POST", "/api/object-categories", {"name": "Person"})
        self.assert_request(lambda: self.client.upsert_category({"name": "Person"}), "POST", "/api/object-categories/upsert", {"name": "Person"})
        self.assert_request(lambda: self.client.get_category("cat/id"), "GET", "/api/object-categories/cat%2Fid")
        self.assert_request(lambda: self.client.upsert_object({"title": "Object"}), "POST", "/api/objects/upsert", {"title": "Object"})
        self.assert_request(lambda: self.client.get_object("obj/id", owner_user_id="user-1"), "GET", "/api/objects/obj%2Fid", params={"ownerUserId": "user-1"})
        self.assert_request(lambda: self.client.resolve_object({"title": "Object"}), "POST", "/api/objects/resolve", {"title": "Object"})
        self.assert_request(lambda: self.client.generalize_object({"sourceObjectUuid": "obj-1"}), "POST", "/api/objects/generalize", {"sourceObjectUuid": "obj-1"})
        self.assert_request(lambda: self.client.suggest_concept_objects({"text": "bike"}), "POST", "/api/concept-objects/suggest", {"text": "bike"})
        self.assert_request(lambda: self.client.search_concept_objects({"query": "bike"}), "POST", "/api/concept-objects/search", {"query": "bike"})
        self.assert_request(lambda: self.client.suggest_prototypes({"properties": [{"name": "color"}]}), "POST", "/api/concept-objects/suggest-prototypes", {"properties": [{"name": "color"}]})
        self.assert_request(lambda: self.client.create_composite({"title": "Budget"}), "POST", "/api/composites", {"title": "Budget"})
        self.assert_request(lambda: self.client.get_composite("comp/id"), "GET", "/api/composites/comp%2Fid")
        self.assert_request(lambda: self.client.update_composite_component("comp/id", "part/id", {"title": "Part"}), "POST", "/api/composites/comp%2Fid/components/part%2Fid/update", {"title": "Part"})
        self.assert_request(lambda: self.client.create_assertion("s", "p", "o"), "POST", "/api/assertions", {
            "subject": "s",
            "predicate": "p",
            "object": "o",
            "truth": 1.0,
            "source": "user",
            "strength": None,
            "voteScore": None,
            "sourceRel": None,
            "status": None,
            "prevAssertionId": None,
            "provenance": None
        })
        self.assert_request(lambda: self.client.get_assertions(subject="s"), "GET", "/api/assertions", params={"subject": "s"})
        self.assert_request(lambda: self.client.vote_assertion("assert/id", -1), "POST", "/api/assertions/assert%2Fid/vote", {"delta": -1})
        self.assert_request(lambda: self.client.get_snapshot("entity/id"), "GET", "/api/entities/entity%2Fid/snapshot")
        self.assert_request(lambda: self.client.get_evidence("entity/id", predicate="definition"), "GET", "/api/entities/entity%2Fid/evidence", params={"predicate": "definition"})
        self.assert_request(lambda: self.client.explain_entity("entity/id", predicate="definition"), "GET", "/api/entities/entity%2Fid/explain", params={"predicate": "definition"})
        self.assert_request(lambda: self.client.create_procedure({"title": "Proc", "steps": []}), "POST", "/api/procedures", {"title": "Proc", "steps": []})
        self.assert_request(lambda: self.client.get_procedure("proc/id"), "GET", "/api/procedures/proc%2Fid")
        self.assert_request(lambda: self.client.insert_procedure_step("proc/id", {"title": "Step"}), "POST", "/api/procedures/proc%2Fid/steps", {"title": "Step"})
        self.assert_request(lambda: self.client.generalize_procedure("proc/id", {"title": "General Proc"}), "POST", "/api/procedures/proc%2Fid/generalize", {"title": "General Proc"})
        self.assert_request(lambda: self.client.import_procedure_json({"procedure": {"steps": [{}]}}), "POST", "/api/procedures/import-json", {"procedure": {"steps": [{}]}})
        self.assert_request(lambda: self.client.repair_procedure_selector("proc/id", {"stepUuid": "step-1"}), "POST", "/api/procedures/proc%2Fid/repair-selector", {"stepUuid": "step-1"})
        self.assert_request(lambda: self.client.search_procedures("invoice", top_k=3), "POST", "/api/procedures/search", {"query": "invoice", "topK": 3})
        self.assert_request(lambda: self.client.create_syllogism({"title": "Syllogism"}), "POST", "/api/logic/syllogisms", {"title": "Syllogism"})
        self.assert_request(lambda: self.client.get_syllogism("logic/id"), "GET", "/api/logic/syllogisms/logic%2Fid")
        self.assert_request(lambda: self.client.register_market_match({"kind": "offer"}), "POST", "/api/market/matches/register", {"kind": "offer"})
        self.assert_request(lambda: self.client.search_market_matches({"kind": "want"}), "POST", "/api/market/matches/search", {"kind": "want"})
        self.assert_request(lambda: self.client.subscribe_channel({"channelTag": "#[x]"}), "POST", "/api/channels/subscribe", {"channelTag": "#[x]"})
        self.assert_request(lambda: self.client.post_channel_message({"channelTag": "#[x]", "message": "hello"}), "POST", "/api/channels/messages", {"channelTag": "#[x]", "message": "hello"})
        self.assert_request(lambda: self.client.get_channel_feed("actor-1"), "GET", "/api/channels/feed", params={"actorId": "actor-1"})
        self.assert_request(lambda: self.client.create_repeating_event({"title": "Standup"}), "POST", "/api/events/repeating", {"title": "Standup"})
        self.assert_request(lambda: self.client.rate_entity("obj/id", {"actorId": "a", "value": 5}), "POST", "/api/ratings/obj%2Fid", {"actorId": "a", "value": 5})
        self.assert_request(lambda: self.client.get_ratings("obj/id"), "GET", "/api/ratings/obj%2Fid")


if __name__ == "__main__":
    unittest.main()

