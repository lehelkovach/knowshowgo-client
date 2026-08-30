"""create_node_with_document privacy forwarding.

The wrapper had no privacy parameter, so everything written through it -- every
episodic conversation turn and tool call -- became a public, anonymously
readable node. 2,650 such rows were counted on production 2026-08-24.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from client import KnowShowGoClient  # noqa: E402
from test_client import FakeResponse  # noqa: E402


class TestNodeWriteScope(unittest.TestCase):
    def test_default_sends_no_privacy_fields(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(return_value=FakeResponse({"uuid": "n1"}))

        uuid = client.create_node_with_document(label="Berlin", tags=["place"])

        self.assertEqual(uuid, "n1")
        sent = client.session.request.call_args.kwargs["json"]
        self.assertEqual(sent["label"], "Berlin")
        self.assertNotIn("private", sent)
        self.assertNotIn("securityClass", sent)
        self.assertNotIn("ownerUserId", sent)

    def test_private_true_is_forwarded(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(return_value=FakeResponse({"uuid": "n2"}))

        client.create_node_with_document(
            label='dataset.choose {"name":"wells-fargo-blackwool"}',
            private=True,
            metadata={"episodic": True},
        )

        sent = client.session.request.call_args.kwargs["json"]
        self.assertTrue(sent["private"])

    def test_security_class_private_implies_private_flag(self):
        client = KnowShowGoClient("https://example.test")
        client.session.request = MagicMock(return_value=FakeResponse({"uuid": "n3"}))

        client.create_node_with_document(
            label="x",
            security_class="private",
            owner_user_id="lehel",
            agent_session_id="slack:U9",
        )

        sent = client.session.request.call_args.kwargs["json"]
        self.assertEqual(sent["securityClass"], "private")
        self.assertTrue(sent["private"], "older servers key off private, not securityClass")
        self.assertEqual(sent["ownerUserId"], "lehel")
        self.assertEqual(sent["agentSessionId"], "slack:U9")


if __name__ == "__main__":
    unittest.main()
