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


if __name__ == "__main__":
    unittest.main()
