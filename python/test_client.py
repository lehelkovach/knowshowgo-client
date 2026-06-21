import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(__file__))
from client import KnowShowGoClient  # noqa: E402


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class TestKnowShowGoClient(unittest.TestCase):
    def test_vote_assertion_posts_delta_and_returns_nested_assertion(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"assertion": {"id": "a1", "voteScore": 3}})
        )

        assertion = client.vote_assertion("a1", delta=2.0)

        self.assertEqual(assertion["id"], "a1")
        self.assertEqual(assertion["voteScore"], 3)
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/assertions/a1/vote",
            json={"delta": 2.0},
        )

    def test_explain_entity_passes_optional_predicate(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"entityId": "topic-1", "trace": []})
        )

        explained = client.explain_entity("topic-1", predicate="status")

        self.assertEqual(explained["entityId"], "topic-1")
        client.session.request.assert_called_once_with(
            "GET",
            "https://example.test/api/entities/topic-1/explain",
            params={"predicate": "status"},
        )

    # ===== Topics =====

    def test_create_topic_posts_label_and_omits_language(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "created": True, "topic": {"uuid": "t1"}})
        )

        result = client.create_topic(label="Invoices", summary="Money docs", aliases=["#[invoice]"])

        self.assertTrue(result["created"])
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/topics",
            json={
                "label": "Invoices",
                "phrase": None,
                "summary": "Money docs",
                "aliases": ["#[invoice]"],
                "kind": "topic",
                "provenance": None,
            },
        )

    def test_get_topic_unwraps_nested_payload(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "topic": {"uuid": "t1", "name": "Invoices"}})
        )

        topic = client.get_topic("t1")

        self.assertEqual(topic["uuid"], "t1")
        client.session.request.assert_called_once_with(
            "GET",
            "https://example.test/api/topics/t1",
        )

    def test_resolve_topic_tag_maps_top_k_and_create_flag(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "topics": []})
        )

        client.resolve_topic_tag(tag="#[invoice]", top_k=3, create_if_missing=True)

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/topics/resolve-tag",
            json={
                "tag": "#[invoice]",
                "phrase": None,
                "topK": 3,
                "createIfMissing": True,
            },
        )

    # ===== Object Categories =====

    def test_create_object_category_maps_parent_fields(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "categoryPrototypeUuid": "cat-1"})
        )

        result = client.create_object_category(
            name="Person", parent_category_name="Thing", source="schema.org"
        )

        self.assertEqual(result["categoryPrototypeUuid"], "cat-1")
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/object-categories",
            json={
                "name": "Person",
                "description": "",
                "context": "object-category",
                "parentPrototypeUuid": None,
                "parentCategoryName": "Thing",
                "properties": [],
                "source": "schema.org",
            },
        )

    def test_upsert_object_category_maps_lineage_key(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "categoryPrototypeUuid": "cat-2"})
        )

        client.upsert_object_category(name="Person", category_lineage_key="category:person")

        called_json = client.session.request.call_args.kwargs["json"]
        self.assertEqual(client.session.request.call_args.args[1],
                         "https://example.test/api/object-categories/upsert")
        self.assertEqual(called_json["categoryLineageKey"], "category:person")

    def test_get_object_category_targets_uuid(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "categoryPrototypeUuid": "cat-3"})
        )

        client.get_object_category("cat-3")

        client.session.request.assert_called_once_with(
            "GET",
            "https://example.test/api/object-categories/cat-3",
        )

    # ===== Objects =====

    def test_upsert_object_maps_snake_to_camel(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "objectUuid": "obj-1"})
        )

        result = client.upsert_object(
            title="David Bowie",
            category_prototype_uuid="cat-1",
            knowledge_kind="fact",
            owner_user_id="user-1",
            private=True,
        )

        self.assertEqual(result["objectUuid"], "obj-1")
        called_json = client.session.request.call_args.kwargs["json"]
        self.assertEqual(client.session.request.call_args.args[1],
                         "https://example.test/api/objects/upsert")
        self.assertEqual(called_json["title"], "David Bowie")
        self.assertEqual(called_json["categoryPrototypeUuid"], "cat-1")
        self.assertEqual(called_json["knowledgeKind"], "fact")
        self.assertEqual(called_json["ownerUserId"], "user-1")
        self.assertEqual(called_json["private"], True)

    def test_get_object_passes_scope_params(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "objectUuid": "obj-1"})
        )

        client.get_object("obj-1", owner_user_id="user-1")

        client.session.request.assert_called_once_with(
            "GET",
            "https://example.test/api/objects/obj-1",
            params={"ownerUserId": "user-1"},
        )

    def test_resolve_object_maps_lineage_and_private(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "selectedObjectUuid": "obj-1"})
        )

        client.resolve_object(
            object_lineage_key="obj:person:bowie", private=True, owner_user_id="user-1"
        )

        called_json = client.session.request.call_args.kwargs["json"]
        self.assertEqual(client.session.request.call_args.args[1],
                         "https://example.test/api/objects/resolve")
        self.assertEqual(called_json["objectLineageKey"], "obj:person:bowie")
        self.assertEqual(called_json["private"], True)
        self.assertEqual(called_json["ownerUserId"], "user-1")

    def test_generalize_object_maps_source_and_target(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(return_value=FakeResponse({"ok": True}))

        client.generalize_object(
            source_object_uuid="obj-1",
            target_category_name="Person",
            mode="schema_only",
            publish_assertion=True,
        )

        called_json = client.session.request.call_args.kwargs["json"]
        self.assertEqual(client.session.request.call_args.args[1],
                         "https://example.test/api/objects/generalize")
        self.assertEqual(called_json["sourceObjectUuid"], "obj-1")
        self.assertEqual(called_json["targetCategoryName"], "Person")
        self.assertEqual(called_json["mode"], "schema_only")
        self.assertEqual(called_json["publishAssertion"], True)
        self.assertEqual(called_json["assertionPredicate"], "generalized_fact")

    # ===== Procedures =====

    def test_create_procedure_maps_extra_props(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"procedure_uuid": "proc-1", "step_uuids": ["s1"]})
        )

        result = client.create_procedure(
            title="Apply to job",
            steps=[{"title": "Open form"}],
            dependencies=[[0, 0]],
            extra_props={"source": "agent"},
        )

        self.assertEqual(result["procedure_uuid"], "proc-1")
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/procedures",
            json={
                "title": "Apply to job",
                "description": "",
                "steps": [{"title": "Open form"}],
                "dependencies": [[0, 0]],
                "extraProps": {"source": "agent"},
            },
        )

    def test_get_procedure_targets_uuid(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "steps": []})
        )

        client.get_procedure("proc-1")

        client.session.request.assert_called_once_with(
            "GET",
            "https://example.test/api/procedures/proc-1",
        )

    def test_add_procedure_step_maps_anchors_and_omits_none(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "step_uuid": "step-2"})
        )

        client.add_procedure_step(
            "proc-1",
            title="Accept terms",
            tool="browser.click",
            payload={"selector": "#accept"},
            after_step_uuid="step-open",
            before_step_uuid="step-submit",
        )

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/procedures/proc-1/steps",
            json={
                "title": "Accept terms",
                "payload": {"selector": "#accept"},
                "tool": "browser.click",
                "afterStepUuid": "step-open",
                "beforeStepUuid": "step-submit",
            },
        )

    def test_generalize_procedure_posts_title_and_mode(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "generalized_procedure_uuid": "proc-2"})
        )

        result = client.generalize_procedure("proc-1", title="Generic apply", mode="safe")

        self.assertEqual(result["generalized_procedure_uuid"], "proc-2")
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/procedures/proc-1/generalize",
            json={
                "title": "Generic apply",
                "description": "",
                "mode": "safe",
                "provenance": None,
            },
        )

    def test_repair_procedure_selector_maps_fields(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "form_element_uuid": "fe-2"})
        )

        client.repair_procedure_selector(
            "proc-1",
            step_uuid="step-1",
            form_element_uuid="fe-1",
            failed_selector="#old",
            repaired_selector="#new",
        )

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/procedures/proc-1/repair-selector",
            json={
                "stepUuid": "step-1",
                "formElementUuid": "fe-1",
                "failedSelector": "#old",
                "repairedSelector": "#new",
                "provenance": None,
            },
        )

    def test_search_procedures_unwraps_results(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"results": [{"uuid": "proc-1"}]})
        )

        results = client.search_procedures("apply to job", top_k=3)

        self.assertEqual(results[0]["uuid"], "proc-1")
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/procedures/search",
            json={"query": "apply to job", "topK": 3},
        )

    def test_import_procedure_json_maps_form_element_category(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "procedure_uuid": "proc-1"})
        )

        client.import_procedure_json(
            procedure={"title": "Apply", "steps": [{"id": "a", "title": "Open"}]},
            form_element_category_prototype_uuid="fe-cat-1",
        )

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/procedures/import-json",
            json={
                "procedure": {"title": "Apply", "steps": [{"id": "a", "title": "Open"}]},
                "formElementCategoryPrototypeUuid": "fe-cat-1",
                "provenance": None,
            },
        )

    # ===== Concept Objects =====

    def test_suggest_concept_objects_maps_fields(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "candidates": []})
        )

        client.suggest_concept_objects(text="Bowie", top_k=5, create_tag_if_missing=True)

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/concept-objects/suggest",
            json={
                "text": "Bowie",
                "query": None,
                "context": {},
                "topK": 5,
                "createTagIfMissing": True,
            },
        )

    def test_search_concept_objects_unwraps_results(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "results": [{"uuid": "o1"}]})
        )

        results = client.search_concept_objects(query="Bowie", top_k=3)

        self.assertEqual(results[0]["uuid"], "o1")
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/concept-objects/search",
            json={"query": "Bowie", "text": None, "context": {}, "topK": 3},
        )

    def test_suggest_concept_object_prototypes_maps_fields(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "selected": None, "candidates": []})
        )

        client.suggest_concept_object_prototypes(
            label="Person",
            properties=[{"name": "name", "type": "string"}],
            category_prototype_uuids=["cat-1"],
            top_k=4,
        )

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/concept-objects/suggest-prototypes",
            json={
                "label": "Person",
                "properties": [{"name": "name", "type": "string"}],
                "context": {},
                "categoryPrototypeUuids": ["cat-1"],
                "topK": 4,
            },
        )

    # ===== Composites =====

    def test_create_composite_maps_category_and_components(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "composite": {"object": {"uuid": "comp-1"}}})
        )

        client.create_composite(
            category_prototype_uuid="cat-1",
            title="Band",
            components=[{"categoryPrototypeUuid": "cat-1", "title": "Member"}],
        )

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/composites",
            json={
                "categoryPrototypeUuid": "cat-1",
                "title": "Band",
                "summary": "",
                "tags": [],
                "properties": [],
                "components": [{"categoryPrototypeUuid": "cat-1", "title": "Member"}],
                "provenance": None,
            },
        )

    def test_get_composite_targets_uuid(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "components": []})
        )

        client.get_composite("comp-1")

        client.session.request.assert_called_once_with(
            "GET",
            "https://example.test/api/composites/comp-1",
        )

    def test_update_composite_component_builds_nested_url(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "previous_component_uuid": "cmp-1"})
        )

        client.update_composite_component("comp-1", "cmp-1", title="Member v2")

        called_args = client.session.request.call_args.args
        self.assertEqual(
            called_args[1],
            "https://example.test/api/composites/comp-1/components/cmp-1/update",
        )
        self.assertEqual(client.session.request.call_args.kwargs["json"]["title"], "Member v2")

    # ===== Logic / Syllogisms =====

    def test_create_syllogism_posts_premises_and_conclusion(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "syllogism_uuid": "syl-1"})
        )

        result = client.create_syllogism(
            title="Mortality",
            premises=[{"text": "All men are mortal"}],
            conclusion={"text": "Socrates is mortal"},
        )

        self.assertEqual(result["syllogism_uuid"], "syl-1")
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/logic/syllogisms",
            json={
                "title": "Mortality",
                "description": "",
                "premises": [{"text": "All men are mortal"}],
                "conclusion": {"text": "Socrates is mortal"},
                "provenance": None,
            },
        )

    def test_get_syllogism_targets_uuid(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "steps": []})
        )

        client.get_syllogism("syl-1")

        client.session.request.assert_called_once_with(
            "GET",
            "https://example.test/api/logic/syllogisms/syl-1",
        )

    # ===== Market =====

    def test_register_market_match_maps_actor_and_object(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "intent_uuid": "intent-1"})
        )

        client.register_market_match(
            kind="offer", actor_id="actor-1", object_uuid="obj-1", tags=["#[guitar]"]
        )

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/market/matches/register",
            json={
                "kind": "offer",
                "actorId": "actor-1",
                "objectUuid": "obj-1",
                "tags": ["#[guitar]"],
                "properties": [],
            },
        )

    def test_search_market_matches_unwraps_matches(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "matches": [{"score": 2}]})
        )

        matches = client.search_market_matches(kind="offer", tags=["#[guitar]"])

        self.assertEqual(matches[0]["score"], 2)
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/market/matches/search",
            json={"kind": "offer", "tags": ["#[guitar]"], "properties": []},
        )

    # ===== Channels =====

    def test_subscribe_channel_maps_fields(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "subscription_uuid": "sub-1"})
        )

        client.subscribe_channel(channel_tag="#[news]", actor_id="actor-1")

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/channels/subscribe",
            json={"channelTag": "#[news]", "actorId": "actor-1"},
        )

    def test_post_channel_message_maps_fields(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "message_uuid": "msg-1"})
        )

        client.post_channel_message(
            channel_tag="#[news]", actor_id="actor-2", message="hi", tags=["#[t]"]
        )

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/channels/messages",
            json={
                "channelTag": "#[news]",
                "actorId": "actor-2",
                "message": "hi",
                "tags": ["#[t]"],
            },
        )

    def test_get_channel_feed_passes_param_and_unwraps_items(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "items": [{"uuid": "m1"}]})
        )

        items = client.get_channel_feed("actor-1")

        self.assertEqual(items[0]["uuid"], "m1")
        client.session.request.assert_called_once_with(
            "GET",
            "https://example.test/api/channels/feed",
            params={"actorId": "actor-1"},
        )

    # ===== Events =====

    def test_create_repeating_event_maps_category_and_title(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "event_uuid": "evt-1"})
        )

        result = client.create_repeating_event(
            category_prototype_uuid="cat-1", title="Standup", tags=["#[standup]"]
        )

        self.assertEqual(result["event_uuid"], "evt-1")
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/events/repeating",
            json={
                "categoryPrototypeUuid": "cat-1",
                "title": "Standup",
                "tags": ["#[standup]"],
                "properties": [],
                "provenance": None,
            },
        )

    # ===== Ratings =====

    def test_rate_entity_maps_fields(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "rating": {"id": "a1"}})
        )

        client.rate_entity("obj-1", actor_id="actor-1", value=4, metric="quality")

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/ratings/obj-1",
            json={
                "actorId": "actor-1",
                "metric": "quality",
                "value": 4,
                "scale": 5,
                "comment": "",
            },
        )

    def test_get_ratings_targets_uuid(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "summary": {}, "evidence": []})
        )

        client.get_ratings("obj-1")

        client.session.request.assert_called_once_with(
            "GET",
            "https://example.test/api/ratings/obj-1",
        )

    # ===== Prototype / centroid mechanics =====

    def test_generalize_from_exemplar_maps_payload(self):
        client = KnowShowGoClient("https://example.test")  # pragma: allowlist secret
        client.session.request = MagicMock(
            return_value=FakeResponse(
                {"prototypeUuid": "p1", "created": True, "exemplarCount": 1, "typicality": 1.0}
            )
        )

        out = client.generalize_from_exemplar(
            text="login username password submit", label="Login Form", threshold=0.8
        )

        self.assertEqual(out["prototypeUuid"], "p1")
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api2.0/prototypes/generalize",
            json={
                "conceptUuid": None,
                "text": "login username password submit",
                "jsonObj": None,
                "prototypeUuid": None,
                "label": "Login Form",
                "threshold": 0.8,
                "createIfNoMatch": True,
            },
        )

    def test_match_prototypes_unwraps_matches(self):
        client = KnowShowGoClient("https://example.test")  # pragma: allowlist secret
        client.session.request = MagicMock(
            return_value=FakeResponse({"matches": [{"uuid": "p1", "name": "Login Form", "score": 0.92}]})
        )

        matches = client.match_prototypes(text="email password submit", top_k=3)

        self.assertEqual(matches[0]["name"], "Login Form")
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api2.0/prototypes/match",
            json={"text": "email password submit", "embedding": None, "topK": 3, "threshold": 0.0},
        )

    def test_prototype_api_prefix_falls_back_to_legacy_api(self):
        client = KnowShowGoClient("https://example.test", prototype_api_prefix="/api")  # pragma: allowlist secret
        client.session.request = MagicMock(return_value=FakeResponse({"matches": []}))

        client.match_prototypes(text="username password submit")

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/prototypes/match",
            json={"text": "username password submit", "embedding": None, "topK": 5, "threshold": 0.0},
        )

    def test_attach_exemplar_targets_endpoint(self):
        client = KnowShowGoClient("https://example.test")  # pragma: allowlist secret
        client.session.request = MagicMock(
            return_value=FakeResponse({"prototypeUuid": "p1", "exemplarCount": 2, "typicality": 0.9})
        )

        client.attach_exemplar("p1", "c2")

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api2.0/prototypes/p1/exemplars",
            json={"conceptUuid": "c2"},
        )


if __name__ == "__main__":
    unittest.main()
