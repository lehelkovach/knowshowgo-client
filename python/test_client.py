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


if __name__ == "__main__":
    unittest.main()
