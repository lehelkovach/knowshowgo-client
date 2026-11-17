"""KSG-RATE1 (2026-11-17): 429 + Retry-After handling in the Python client.

A short wait is retried once (a refused request was never processed, so a
retried write is not a duplicate); a long one raises KnowShowGoRateLimited,
a requests.HTTPError carrying the wait and the RateLimit-* values. Transport
mocked; sleeps injected. Run-time budget asserted per test.
"""
import os
import sys
import time
import unittest
from email.utils import formatdate
from unittest.mock import MagicMock

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from client import KnowShowGoClient, KnowShowGoRateLimited  # noqa: E402

BUDGET_S = 0.25


class FakeResponse:
    def __init__(self, status, payload, headers=None):
        self.status_code = status
        self._payload = payload
        self.headers = requests.structures.CaseInsensitiveDict(headers or {})

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code} error", response=self)

    def json(self):
        return self._payload


def limited(retry_after):
    return FakeResponse(
        429,
        {"error": "rate limit exceeded", "scope": "read", "limit": 600},
        {
            "Retry-After": str(retry_after),
            "RateLimit-Limit": "600",
            "RateLimit-Remaining": "0",
            "RateLimit-Reset": str(retry_after),
            "RateLimit-Policy": "600;w=60",
        },
    )


class TestRateLimit(unittest.TestCase):
    def setUp(self):
        self.t0 = time.monotonic()

    def tearDown(self):
        self.assertLess(time.monotonic() - self.t0, BUDGET_S)

    def client(self, *responses, **kwargs):
        c = KnowShowGoClient("https://ksg.example.test", **kwargs)
        c.session.request = MagicMock(side_effect=list(responses))
        c.slept = []
        c.sleep = c.slept.append
        return c

    def test_short_retry_after_is_waited_out_once(self):
        c = self.client(limited(2), FakeResponse(200, {"ok": True}))
        self.assertEqual(c._request("POST", "/api/assertions", json={"subject": "Avery Example"}), {"ok": True})
        self.assertEqual(c.session.request.call_count, 2)
        self.assertEqual(c.slept, [2.0])

    def test_long_retry_after_raises_typed_error_with_the_wait(self):
        c = self.client(limited(42))
        with self.assertRaises(KnowShowGoRateLimited) as ctx:
            c._request("GET", "/api/concepts")
        err = ctx.exception
        self.assertIsInstance(err, requests.HTTPError)
        self.assertEqual(err.status_code, 429)
        self.assertEqual(err.retry_after, 42.0)
        self.assertEqual(err.rate_limit, {"limit": 600, "remaining": 0, "reset_seconds": 42, "policy": "600;w=60"})
        self.assertEqual(err.body["scope"], "read")
        self.assertEqual(c.slept, [])
        self.assertEqual(c.session.request.call_count, 1)

    def test_retries_are_bounded(self):
        c = self.client(limited(1), limited(1), FakeResponse(200, {"ok": True}))
        with self.assertRaises(KnowShowGoRateLimited):
            c._request("GET", "/x")
        self.assertEqual(c.session.request.call_count, 2)

    def test_retries_zero_and_a_wider_max_wait(self):
        c = self.client(limited(1), rate_limit_retries=0)
        with self.assertRaises(KnowShowGoRateLimited):
            c._request("GET", "/x")
        self.assertEqual(c.session.request.call_count, 1)
        p = self.client(limited(30), FakeResponse(200, {"ok": True}), max_retry_after=60.0)
        self.assertEqual(p._request("GET", "/x"), {"ok": True})
        self.assertEqual(p.slept, [30.0])

    def test_http_date_retry_after(self):
        c = self.client(limited(formatdate(time.time() + 3, usegmt=True)), FakeResponse(200, {"ok": True}))
        c._request("GET", "/x")
        self.assertEqual(len(c.slept), 1)
        self.assertTrue(1.0 <= c.slept[0] <= 4.0, c.slept)

    def test_last_rate_limit_is_kept(self):
        c = self.client(FakeResponse(200, {"ok": True}, {"RateLimit-Limit": "60", "RateLimit-Remaining": "59", "RateLimit-Reset": "12", "RateLimit-Policy": "60;w=60"}))
        self.assertIsNone(c.last_rate_limit)
        c._request("GET", "/x")
        self.assertEqual(c.last_rate_limit, {"limit": 60, "remaining": 59, "reset_seconds": 12, "policy": "60;w=60"})

    def test_429_without_retry_after_is_not_retried(self):
        c = self.client(FakeResponse(429, {"error": "too many requests"}))
        with self.assertRaises(KnowShowGoRateLimited) as ctx:
            c._request("GET", "/x")
        self.assertIsNone(ctx.exception.retry_after)
        self.assertEqual(c.slept, [])

    def test_other_errors_are_unchanged(self):
        c = self.client(FakeResponse(404, {"error": "not found"}))
        with self.assertRaises(requests.HTTPError) as ctx:
            c._request("GET", "/x")
        self.assertNotIsInstance(ctx.exception, KnowShowGoRateLimited)


if __name__ == "__main__":
    unittest.main()
