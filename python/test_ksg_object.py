"""
KSGObject — the duck-typed projection, Python side.

Kept deliberately parallel to js/ksg_object.test.mjs: the same hydration payload
and the same guarantees, so the two clients cannot drift on what a member access
means.
"""

import unittest

from client import KnowShowGoClient, KSGObject

HYDRATION = {
    "ok": True,
    "uuid": "entity-1",
    "hydratedAt": "2026-09-07T21:00:00.000Z",
    "types": [
        {"uuid": "proto-person", "name": "Person", "score": 0.91},
        {"uuid": "proto-employee", "name": "Employee", "score": 0.62},
    ],
    "members": {
        "middle_name": {
            "name": "middle_name",
            "valueType": "string",
            "required": False,
            "definedBy": {"prototypeUuid": "proto-person", "prototypeName": "Person", "score": 0.91},
            "alsoDefinedBy": [],
            "hasValue": True,
        },
        "city": {
            "name": "city",
            "valueType": "string",
            "required": False,
            "definedBy": {"prototypeUuid": "proto-person", "prototypeName": "Person", "score": 0.91},
            "alsoDefinedBy": [
                {"prototypeUuid": "proto-employee", "prototypeName": "Employee", "score": 0.62}
            ],
            "hasValue": True,
        },
        "role": {
            "name": "role",
            "valueType": "string",
            "required": False,
            "definedBy": {"prototypeUuid": "proto-employee", "prototypeName": "Employee", "score": 0.62},
            "alsoDefinedBy": [],
            "hasValue": True,
        },
        "nickname": {
            "name": "nickname",
            "valueType": "string",
            "required": False,
            "definedBy": {"prototypeUuid": "proto-person", "prototypeName": "Person", "score": 0.91},
            "alsoDefinedBy": [],
            "hasValue": False,
        },
        "favourite_colour": {
            "name": "favourite_colour",
            "valueType": None,
            "required": False,
            "definedBy": None,
            "alsoDefinedBy": [],
            "hasValue": True,
        },
    },
    "properties": {
        "middle_name": {"value": "Byron", "confidence": 0.9, "contested": False, "claims": [{"value": "Byron"}]},
        "city": {
            "value": "Denver",
            "confidence": 0.6,
            "contested": True,
            "claims": [{"value": "Denver"}, {"value": "Boulder"}],
        },
        "role": {"value": "engineer", "confidence": 0.8, "contested": False, "claims": []},
        "favourite_colour": {"value": "green", "confidence": 0.5, "contested": False, "claims": []},
    },
    "byPrototype": {
        "Person": {"uuid": "proto-person", "score": 0.91, "members": ["middle_name", "city", "nickname"]},
        "Employee": {"uuid": "proto-employee", "score": 0.62, "members": ["role", "city"]},
    },
    "policy": None,
}


class FakeResponse:
    def __init__(self, payload, status=200):
        self.status_code = status
        self.headers = {"content-type": "application/json"}
        self._payload = payload
        self.text = "{}"

    def json(self):
        return self._payload

    def raise_for_status(self):
        return None


class KSGObjectTest(unittest.TestCase):
    def obj(self):
        return KSGObject(HYDRATION)

    def test_members_readable_in_either_case_style(self):
        person = self.obj()
        self.assertEqual(person.middle_name, "Byron")
        self.assertEqual(person.middleName, "Byron")
        self.assertEqual(person.city, "Denver")

    def test_membership_and_iteration(self):
        person = self.obj()
        self.assertIn("middle_name", person)
        self.assertIn("middleName", person)
        self.assertNotIn("not_a_field", person)
        self.assertEqual(set(person.keys()), set(HYDRATION["members"].keys()))
        self.assertEqual(person["city"], "Denver")
        with self.assertRaises(KeyError):
            person["nope"]

    def test_strongest_match_is_default_type(self):
        person = self.obj()
        self.assertEqual(person.type()["name"], "Person")
        self.assertEqual(len(person.types_now()), 2)

    def test_declared_without_value_differs_from_unknown(self):
        person = self.obj()
        self.assertIsNone(person.nickname)
        self.assertTrue(person.has_member("nickname"))
        self.assertFalse(person.has_value("nickname"))

        self.assertFalse(person.has_member("typo_field"))
        with self.assertRaises(AttributeError):
            person.typo_field

    def test_explain_names_owner_and_rivals(self):
        person = self.obj()
        city = person.explain("city")
        self.assertEqual(city["definedBy"]["prototypeName"], "Person")
        self.assertEqual(len(city["alsoDefinedBy"]), 1)
        self.assertEqual(city["alsoDefinedBy"][0]["prototypeName"], "Employee")
        self.assertIsNone(person.explain("unknown_name"))

    def test_undeclared_value_still_exposed(self):
        person = self.obj()
        self.assertEqual(person.favourite_colour, "green")
        self.assertIsNone(person.explain("favourite_colour")["definedBy"])

    def test_contested_claims_reachable_behind_winner(self):
        person = self.obj()
        self.assertEqual(person.city, "Denver")
        self.assertTrue(person.is_contested("city"))
        self.assertEqual(len(person.claims("city")), 2)
        self.assertFalse(person.is_contested("middle_name"))

    def test_cell_carries_value_confidence_and_provenance(self):
        cell = self.obj().cell("middleName")
        self.assertEqual(cell["name"], "middle_name")
        self.assertEqual(cell["value"], "Byron")
        self.assertEqual(cell["confidence"], 0.9)
        self.assertEqual(cell["definedBy"]["prototypeName"], "Person")
        self.assertIsNone(self.obj().cell("nope"))

    def test_as_reads_through_weaker_match(self):
        employee = self.obj().as_("Employee")
        self.assertEqual(employee.role, "engineer")
        self.assertEqual(employee.city, "Denver")
        self.assertNotIn("middle_name", employee)
        self.assertEqual(employee.type()["name"], "Employee")
        self.assertEqual(employee.explain("city")["definedBy"]["prototypeName"], "Employee")

    def test_as_accepts_uuid_and_rejects_non_match(self):
        self.assertEqual(self.obj().as_("proto-employee").type()["name"], "Employee")
        self.assertIsNone(self.obj().as_("NotAMatchedPrototype"))

    def test_real_attributes_win_but_member_stays_reachable(self):
        payload = dict(HYDRATION)
        payload["members"] = dict(HYDRATION["members"])
        payload["members"]["uuid"] = {
            "name": "uuid",
            "definedBy": None,
            "alsoDefinedBy": [],
            "hasValue": True,
        }
        payload["properties"] = dict(HYDRATION["properties"])
        payload["properties"]["uuid"] = {"value": "a-member-called-uuid", "claims": []}

        person = KSGObject(payload)
        self.assertEqual(person.uuid, "entity-1")
        self.assertEqual(person.value("uuid"), "a-member-called-uuid")

    def test_projection_is_a_timestamped_snapshot(self):
        self.assertEqual(self.obj().hydrated_at, "2026-09-07T21:00:00.000Z")

    def test_empty_hydration_is_inert(self):
        empty = KSGObject()
        self.assertIsNone(empty.type())
        self.assertEqual(empty.types_now(), [])
        self.assertFalse(empty.has_member("anything"))
        with self.assertRaises(AttributeError):
            empty.anything

    def test_hydrate_issues_one_get_and_returns_ksg_object(self):
        calls = []

        class FakeSession:
            def request(self, method, url, **kwargs):
                calls.append((method, url))
                return FakeResponse(HYDRATION)

        client = KnowShowGoClient(base_url="http://ksg.test")
        client.session = FakeSession()

        person = client.hydrate("entity-1")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "GET")
        self.assertIn("/api2.0/entities/entity-1/hydrate", calls[0][1])
        self.assertIsInstance(person, KSGObject)
        self.assertEqual(person.middleName, "Byron")

        # Access is local: no further requests.
        person.city
        person.explain("city")
        person.as_("Employee").role
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
