import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(__file__))
from client import (
    matches_route,  # noqa: E402
    KnowShowGoClient,
    EntityProxy,
    PUBLIC_API_BASE_URL,
    LOCAL_API_BASE_URL,
    resolve_base_url,
)


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

    def test_get_entity_properties_and_entity_proxy(self):
        payload = {
            "ok": True,
            "uuid": "person:Ada",
            "properties": {
                "middle_name": {
                    "value": "Augusta",
                    "confidence": 0.9,
                    "contested": True,
                    "claims": [
                        {"value": "Augusta", "rank": 1, "winner": True, "source": "resume"},
                        {"value": "A.", "rank": 2, "winner": False, "source": "chat"},
                    ],
                }
            },
        }
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(return_value=FakeResponse(payload))

        raw = client.get_entity_properties("person:Ada", predicate="middle_name")
        self.assertEqual(raw["properties"]["middle_name"]["value"], "Augusta")
        client.session.request.assert_called_with(
            "GET",
            "https://example.test/api2.0/entities/person:Ada/properties",
            params={"predicate": "middle_name"},
        )

        types_payload = {
            "ok": True,
            "uuid": "person:Ada",
            "types": [{"uuid": "proto-person", "name": "Person", "score": 0.91}],
        }

        def side_effect(method, url, **kwargs):
            if "/types" in url:
                return FakeResponse(types_payload)
            return FakeResponse(payload)

        client.session.request = MagicMock(side_effect=side_effect)
        entity = client.get_entity_snapshot("person:Ada")
        self.assertIsInstance(entity, EntityProxy)
        self.assertEqual(entity.middleName, "Augusta")
        self.assertEqual(entity.middle_name, "Augusta")
        self.assertEqual(entity.claims["middle_name"][0]["source"], "resume")
        self.assertTrue(entity.prop("middle_name")["contested"])
        self.assertEqual(entity.get_type()[0]["name"], "Person")

        client.session.request = MagicMock(return_value=FakeResponse(payload))
        client.get_entity_properties("person:Ada", entity_api_prefix="/api")
        client.session.request.assert_called_with(
            "GET",
            "https://example.test/api/entities/person:Ada/properties",
            params={},
        )

        client.session.request = MagicMock(return_value=FakeResponse(types_payload))
        typed = client.get_entity_types("person:Ada", top_k=3, persist=True)
        self.assertEqual(typed["types"][0]["name"], "Person")
        client.session.request.assert_called_with(
            "GET",
            "https://example.test/api2.0/entities/person:Ada/types",
            params={"topK": 3, "threshold": 0, "persist": "true", "persistTopK": 1},
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
            "https://example.test/api2.0/topics",
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
            "https://example.test/api2.0/topics/t1",
        )

    def test_resolve_topic_tag_maps_top_k_and_create_flag(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "topics": []})
        )

        client.resolve_topic_tag(tag="#[invoice]", top_k=3, create_if_missing=True)

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api2.0/topics/resolve-tag",
            json={
                "tag": "#[invoice]",
                "phrase": None,
                "topK": 3,
                "createIfMissing": True,
            },
        )

    def test_topic_api_prefix_falls_back_to_legacy_api(self):
        client = KnowShowGoClient("https://example.test", topic_api_prefix="/api")  # pragma: allowlist secret
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "created": True, "topic": {"uuid": "t1"}})
        )

        client.create_topic(label="Invoices")
        client.session.request.assert_called_with(
            "POST",
            "https://example.test/api/topics",
            json={
                "label": "Invoices",
                "phrase": None,
                "summary": "",
                "aliases": [],
                "kind": "topic",
                "provenance": None,
            },
        )

        client.get_topic("t1")
        client.session.request.assert_called_with(
            "GET",
            "https://example.test/api/topics/t1",
        )

        client.resolve_topic_tag(tag="#[invoice]")
        client.session.request.assert_called_with(
            "POST",
            "https://example.test/api/topics/resolve-tag",
            json={
                "tag": "#[invoice]",
                "phrase": None,
                "topK": 10,
                "createIfMissing": False,
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

    def test_get_procedure_passes_source_ab(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "loadPath": "dagJson"})
        )

        client.get_procedure("proc-1", source="dagJson")

        client.session.request.assert_called_once_with(
            "GET",
            "https://example.test/api/procedures/proc-1",
            params={"source": "dagJson"},
        )

    def test_put_procedure_dag_maps_body(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True})
        )

        client.put_procedure_dag(
            "proc-1",
            {"version": 1, "title": "P", "steps": [{"id": "0", "title": "A"}]},
            rematerialize=False,
        )

        client.session.request.assert_called_once_with(
            "PUT",
            "https://example.test/api/procedures/proc-1/dag",
            json={
                "dagJson": {
                    "version": 1,
                    "title": "P",
                    "steps": [{"id": "0", "title": "A"}],
                },
                "rematerialize": False,
            },
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

        result = client.suggest_concept_objects(text="Bowie", top_k=5, create_tag_if_missing=True)
        self.assertEqual(result["suggestions"], [])

        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api/concept-objects/suggest",
            json={
                "text": "Bowie",
                "query": "Bowie",
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

    def test_search_knowledge_posts_to_api2(self):
        client = KnowShowGoClient("https://example.test", default_owner_user_id="slack:U1")
        client.session.request = MagicMock(
            return_value=FakeResponse(
                {
                    "ok": True,
                    "query": "Acme",
                    "count": 1,
                    "results": [{"kind": "object", "title": "Acme Offer", "score": 1}],
                }
            )
        )
        out = client.search_knowledge("Acme", top_k=5)
        self.assertEqual(out["count"], 1)
        self.assertEqual(out["results"][0]["title"], "Acme Offer")
        args, kwargs = client.session.request.call_args
        self.assertEqual(args[0], "POST")
        self.assertIn("/api2.0/knowledge/search", args[1])

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

    def test_search_prototypes_unwraps_prototypes(self):
        client = KnowShowGoClient("https://example.test")  # pragma: allowlist secret
        client.session.request = MagicMock(
            return_value=FakeResponse({"prototypes": [{"uuid": "p1", "name": "Person"}]})
        )

        protos = client.search_prototypes(query="Pers", top_k=5)

        self.assertEqual(protos[0]["name"], "Person")
        client.session.request.assert_called_once_with(
            "POST",
            "https://example.test/api2.0/prototypes/search",
            json={"query": "Pers", "topK": 5},
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
    def test_connect_validates_release_manifest(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({
                "channel": "dev",
                "release": "v0.2.8-dev",
                "surfaces": {"clientContract": [{"method": "GET", "path": "/health"}]}
            })
        )
        manifest = client.connect(expected_channel='dev', expected_release='v0.2.8-dev')
        self.assertEqual(manifest["channel"], "dev")

    def test_resolve_object_adds_object_uuid_alias(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "selectedObjectUuid": "obj-9"})
        )
        result = client.resolve_object(object_lineage_key="line-1")
        self.assertEqual(result["objectUuid"], "obj-9")

    def test_suggest_concept_objects_requires_text(self):
        client = KnowShowGoClient("https://example.test")
        with self.assertRaises(ValueError):
            client.suggest_concept_objects()


class TestPublicApiBaseUrl(unittest.TestCase):
    """Base URL resolution for the hosted public API."""

    def setUp(self):
        self._saved = {k: os.environ.get(k) for k in ("KSG_API_URL", "KSG_PUBLIC_API_URL")}
        for k in self._saved:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_explicit_wins(self):
        self.assertEqual(resolve_base_url("https://explicit.test"), "https://explicit.test")

    def test_local_default_without_env(self):
        self.assertEqual(resolve_base_url(), LOCAL_API_BASE_URL)

    def test_env_fallbacks(self):
        os.environ["KSG_PUBLIC_API_URL"] = "https://from-public-env.test"
        self.assertEqual(resolve_base_url(), "https://from-public-env.test")
        os.environ["KSG_API_URL"] = "https://from-env.test"
        self.assertEqual(resolve_base_url(), "https://from-env.test")

    def test_client_uses_env_when_no_base_url(self):
        os.environ["KSG_API_URL"] = "https://env-host.test/"
        client = KnowShowGoClient()
        self.assertEqual(client.base_url, "https://env-host.test")

    def test_public_api_helper(self):
        client = KnowShowGoClient.public_api()
        self.assertEqual(client.base_url, PUBLIC_API_BASE_URL)
        self.assertEqual(PUBLIC_API_BASE_URL, "https://api.knowshowgo.com")


class TestAdvertisedBaseUrl(unittest.TestCase):
    """connect(adopt_advertised_base_url=True) follows the manifest."""

    def _client(self):
        client = KnowShowGoClient("http://127.0.0.1:3000")
        client.session.request = MagicMock(
            return_value=FakeResponse({
                "channel": "dev",
                "release": "v0.2.8-dev",
                "api": {
                    "publicBaseUrl": "https://api.knowshowgo.com",
                    "prefixes": {"stable": "/api", "current": "/api2.0"},
                },
                "surfaces": {"clientContract": [{"method": "GET", "path": "/health"}]},
            })
        )
        return client

    def test_adopts_when_requested(self):
        client = self._client()
        client.connect(adopt_advertised_base_url=True)
        self.assertEqual(client.base_url, "https://api.knowshowgo.com")
        self.assertEqual(client.api_prefixes, {"stable": "/api", "current": "/api2.0"})

    def test_default_keeps_base_url(self):
        client = self._client()
        client.connect()
        self.assertEqual(client.base_url, "http://127.0.0.1:3000")


class TestApiTokens(unittest.TestCase):
    """The server has verified bearer auth; until now the SDK could only send
    the soft X-KSG-Owner header, so callers had no way to use it."""

    def test_create_api_token_posts_to_token_endpoint(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "token": "ksg_abc123", "record": {"jti": "j1"}})
        )

        out = client.create_api_token(owner_user_id="alice", label="laptop", ttl_days=30)

        self.assertEqual(out["token"], "ksg_abc123")
        args, kwargs = client.session.request.call_args
        self.assertEqual(args[0], "POST")
        self.assertEqual(args[1], "https://example.test/api2.0/auth/tokens")
        self.assertEqual(kwargs["json"]["ownerUserId"], "alice")
        self.assertEqual(kwargs["json"]["ttlDays"], 30)

    def test_auth_token_is_sent_as_bearer_header(self):
        client = KnowShowGoClient("https://example.test", auth_token="ksg_live")
        client.session.request = MagicMock(return_value=FakeResponse({"objects": []}))

        client.list_objects()

        _, kwargs = client.session.request.call_args
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer ksg_live")

    def test_no_token_means_no_authorization_header(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(return_value=FakeResponse({"objects": []}))

        client.list_objects()

        _, kwargs = client.session.request.call_args
        self.assertNotIn("Authorization", kwargs.get("headers", {}))

    def test_set_auth_token_swaps_the_token(self):
        client = KnowShowGoClient("https://example.test", auth_token="old")
        client.session.request = MagicMock(return_value=FakeResponse({"objects": []}))

        client.set_auth_token("new")
        client.list_objects()

        _, kwargs = client.session.request.call_args
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer new")

    def test_token_endpoints_honour_the_api_fallback_prefix(self):
        client = KnowShowGoClient("https://example.test", prototype_api_prefix="/api")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "tokens": [{"jti": "j1"}]})
        )

        tokens = client.list_api_tokens(owner_user_id="alice")

        self.assertEqual(tokens[0]["jti"], "j1")
        args, _ = client.session.request.call_args
        self.assertEqual(args[1], "https://example.test/api/auth/tokens")

    def test_admin_secret_rides_along_so_the_first_token_can_be_minted(self):
        client = KnowShowGoClient("https://example.test", admin_secret="s3cret")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "token": "ksg_x", "record": {"jti": "j1"}})
        )

        client.create_api_token(owner_user_id="alice")

        _, kwargs = client.session.request.call_args
        self.assertEqual(kwargs["headers"]["X-KSG-Admin"], "s3cret")

    def test_no_admin_secret_means_no_admin_header(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(return_value=FakeResponse({"tokens": []}))

        client.list_api_tokens()

        _, kwargs = client.session.request.call_args
        self.assertNotIn("X-KSG-Admin", kwargs.get("headers", {}))

    def test_revoke_api_token_targets_the_jti(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"ok": True, "record": {"jti": "j1", "revoked": True}})
        )

        out = client.revoke_api_token("j1", owner_user_id="alice")

        self.assertTrue(out["record"]["revoked"])
        args, _ = client.session.request.call_args
        self.assertEqual(args[1], "https://example.test/api2.0/auth/tokens/j1/revoke")


class TestListParity(unittest.TestCase):
    """These two existed in the JS SDK only, so a Python caller had no way to
    enumerate objects or categories."""

    def test_list_objects_filters_by_category(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"objects": [{"uuid": "o1"}]})
        )

        objects = client.list_objects(category="GmailAccount", limit=50, owner_user_id="alice")

        self.assertEqual(objects[0]["uuid"], "o1")
        args, kwargs = client.session.request.call_args
        self.assertEqual(args[1], "https://example.test/api/objects")
        self.assertEqual(kwargs["params"]["category"], "GmailAccount")
        self.assertEqual(kwargs["params"]["limit"], 50)
        self.assertEqual(kwargs["headers"]["X-KSG-Owner"], "alice")

    def test_list_object_categories_returns_categories(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"categories": [{"name": "GmailAccount", "objectCount": 1}]})
        )

        categories = client.list_object_categories()

        self.assertEqual(categories[0]["name"], "GmailAccount")
        args, _ = client.session.request.call_args
        self.assertEqual(args[1], "https://example.test/api/object-categories")



class TestP0Transport(unittest.TestCase):
    def test_matches_route_templates(self):
        self.assertTrue(matches_route("/api/objects/:uuid", "/api/objects/4ee7abcd"))
        self.assertFalse(matches_route("/api/objects/:uuid", "/api/objects/4ee7/extra"))
        self.assertFalse(matches_route("/api/objects/:uuid", "/api/concepts/4ee7abcd"))

    def test_connect_without_expectations_accepts_public_release(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"channel": "release", "release": "v0.2.8", "surfaces": {}})
        )
        manifest = client.connect()
        self.assertEqual(manifest["channel"], "release")

    def test_connect_fails_fast_on_explicit_mismatch(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            return_value=FakeResponse({"channel": "release", "release": "v0.2.8", "surfaces": {}})
        )
        with self.assertRaisesRegex(ValueError, "expected channel dev"):
            client.connect(expected_channel="dev")

    def test_access_token_alias_and_token_provider(self):
        client = KnowShowGoClient("https://example.test", access_token="from-alias")
        client.session.request = MagicMock(return_value=FakeResponse({"ok": True, "objects": []}))
        client.list_objects()
        kwargs = client.session.request.call_args.kwargs
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer from-alias")

        n = {"i": 0}

        def provider():
            n["i"] += 1
            return f"tok-{n['i']}"

        client = KnowShowGoClient("https://example.test", token_provider=provider)
        client.session.request = MagicMock(return_value=FakeResponse({"ok": True, "objects": []}))
        client.list_objects()
        client.list_objects()
        first = client.session.request.call_args_list[0].kwargs["headers"]["Authorization"]
        second = client.session.request.call_args_list[1].kwargs["headers"]["Authorization"]
        self.assertEqual(first, "Bearer tok-1")
        self.assertEqual(second, "Bearer tok-2")

    def test_bearer_skips_owner_in_query(self):
        client = KnowShowGoClient(
            "https://example.test",
            default_owner_user_id="alice",
            auth_token="ksg_live",
        )
        client.session.request = MagicMock(return_value=FakeResponse({"ok": True, "objects": []}))
        client.list_objects()
        kwargs = client.session.request.call_args.kwargs
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer ksg_live")
        self.assertEqual(kwargs["headers"]["X-KSG-Owner"], "alice")
        self.assertNotIn("ownerUserId", kwargs.get("params") or {})

    def test_contract_enforcement_matches_uuid_templates(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(
            side_effect=[
                FakeResponse(
                    {
                        "channel": "dev",
                        "release": "v0.2.9-dev",
                        "surfaces": {
                            "clientContract": [{"method": "GET", "path": "/api/objects/:uuid"}]
                        },
                    }
                ),
                FakeResponse({"ok": True, "uuid": "x"}),
            ]
        )
        client.connect(enforce_contract=True)
        out = client.get_object("4ee7abcd-0000-0000-0000-000000000001")
        self.assertTrue(out.get("ok"))


if __name__ == "__main__":
    unittest.main()
