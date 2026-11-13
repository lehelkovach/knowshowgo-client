"""
KnowShowGo Python REST API Client

Provides a Python client for the KnowShowGo REST API.
"""

import copy
import os
import re
import requests
from typing import Dict, Any, List, Optional, Union
import json

#: Canonical hosted KnowShowGo API (see server ``docs/PUBLIC-API.md``).
PUBLIC_API_BASE_URL = "https://api.knowshowgo.com"
#: Local default used when nothing else is configured.
LOCAL_API_BASE_URL = "http://localhost:3000"  # pragma: allowlist secret


def resolve_base_url(explicit: Optional[str] = None) -> str:
    """Explicit arg → ``KSG_API_URL`` → ``KSG_PUBLIC_API_URL`` → local default."""
    if explicit:
        return explicit
    return (
        os.environ.get("KSG_API_URL")
        or os.environ.get("KSG_PUBLIC_API_URL")
        or LOCAL_API_BASE_URL
    )


def _to_snake_case(name: str) -> str:
    out = []
    for i, ch in enumerate(name or ""):
        if ch.isupper() and i > 0 and (name[i - 1].islower() or name[i - 1].isdigit()):
            out.append("_")
        out.append(ch.lower() if ch != "-" else "_")
    return "".join(out)


def resolve_property_key(name: Optional[str], properties: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Resolve a JS-friendly attribute name against a properties map."""
    if not name or not properties:
        return None
    if name in properties:
        return name
    snake = _to_snake_case(name)
    if snake in properties:
        return snake
    lower = name.lower()
    snake_lower = snake.lower()
    for key in properties:
        k = key.lower()
        if k == lower or k == snake_lower:
            return key
    return None


def _member_name_aliases(name: str) -> set:
    """
    Every spelling a caller might reasonably use for one member name.

    Built once per hydration so member access is a dict lookup rather than a
    scan over every property on each attribute get.
    """
    raw = str(name)
    snake = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", raw).replace("-", "_").lower()
    parts = snake.split("_")
    camel = parts[0] + "".join(p.title() for p in parts[1:])
    return {
        raw,
        snake,
        camel,
        raw.lower(),
        snake.lower(),
        camel.lower(),
        snake.replace("_", ""),
    }


class KSGObject:
    """
    A KSG entity projected as a duck-typed object, from one hydration call.

    ``person.middle_name`` / ``person.middleName`` → winner value.
    ``person.type()`` → strongest prototype match.
    ``person.explain("city")`` → which prototype supplied the member, and rivals.
    ``person.as_("Employee").role`` → read through a weaker match.

    Members come from whatever prototypes matched, strongest first. A weaker
    prototype that declares the same name is still reachable through ``as_``
    and is listed by ``explain``, because the top match is a ranking rather than
    a fact — the centroid machinery that ranks ``cvv`` above ``number`` for
    "Card number" should not silently pick a member's meaning.

    This mirrors the JS ``KSGObject`` deliberately. It is a snapshot;
    ``hydrated_at`` records when, since centroids move as exemplars accumulate.
    """

    def __init__(self, payload: Optional[Dict[str, Any]] = None):
        payload = payload or {}
        self.ok = payload.get("ok", True) is not False
        self.uuid = payload.get("uuid")
        self.hydrated_at = payload.get("hydratedAt")
        self.types = payload.get("types") or []
        self.members = payload.get("members") or {}
        self.properties = payload.get("properties") or {}
        self.by_prototype = payload.get("byPrototype") or {}
        self.policy = payload.get("policy")
        self.raw = dict(payload)

        index: Dict[str, str] = {}
        for name in self.members:
            for alias in _member_name_aliases(name):
                index.setdefault(alias, name)
        self._index = index

    def __getattr__(self, name: str) -> Any:
        # Only reached when normal attribute lookup fails, so real attributes
        # always win and a member sharing their name stays available via value().
        if name.startswith("_"):
            raise AttributeError(name)
        index = self.__dict__.get("_index") or {}
        key = index.get(name) or index.get(name.lower())
        if key is None:
            raise AttributeError(name)
        return (self.__dict__.get("properties") or {}).get(key, {}).get("value")

    def __contains__(self, name: str) -> bool:
        return self.member_name(name) is not None

    def __iter__(self):
        return iter(self.members)

    def keys(self):
        """Member names, so ``dict(**obj)``-style spreading works."""
        return self.members.keys()

    def __getitem__(self, name: str) -> Any:
        key = self.member_name(name)
        if key is None:
            raise KeyError(name)
        return self.properties.get(key, {}).get("value")

    def member_name(self, name: str) -> Optional[str]:
        """Canonical member name for any accepted spelling, else None."""
        return self._index.get(name) or self._index.get(str(name).lower())

    def has_member(self, name: str) -> bool:
        """True when a prototype declares it or the entity holds a value."""
        return self.member_name(name) is not None

    def has_value(self, name: str) -> bool:
        """
        True when the member exists AND carries a value.

        Worth distinguishing from ``has_member``: plain access yields None for a
        typo, for a declared-but-empty field, and for an undeclared member, and
        telling those apart is most of debugging a fuzzy projection.
        """
        key = self.member_name(name)
        if key is None:
            return False
        return (self.properties.get(key) or {}).get("value") is not None

    def value(self, name: str) -> Any:
        """Winner value for a computed or shadowed name."""
        key = self.member_name(name)
        return None if key is None else (self.properties.get(key) or {}).get("value")

    def cell(self, name: str) -> Optional[Dict[str, Any]]:
        """Value plus confidence, contested flag, claims and provenance."""
        key = self.member_name(name)
        if key is None:
            return None
        member = self.members.get(key) or {}
        prop = self.properties.get(key) or {}
        return {
            "name": key,
            "value": prop.get("value"),
            "confidence": prop.get("confidence"),
            "contested": prop.get("contested") is True,
            "claims": prop.get("claims") or [],
            "valueType": member.get("valueType"),
            "required": member.get("required") is True,
            "definedBy": member.get("definedBy"),
            "alsoDefinedBy": member.get("alsoDefinedBy") or [],
            "hasValue": self.has_value(key),
        }

    def claims(self, name: str) -> List[Dict[str, Any]]:
        """Ranked claim stack for a member, strongest first."""
        cell = self.cell(name)
        return [] if cell is None else cell["claims"]

    def is_contested(self, name: str) -> bool:
        """True when claims disagree, so a caller can surface the conflict."""
        cell = self.cell(name)
        return bool(cell and cell["contested"])

    def explain(self, name: str) -> Optional[Dict[str, Any]]:
        """Which prototype supplied a member, and what else could have."""
        key = self.member_name(name)
        if key is None:
            return None
        member = self.members.get(key) or {}
        return {
            "name": key,
            "definedBy": member.get("definedBy"),
            "alsoDefinedBy": member.get("alsoDefinedBy") or [],
            "contested": self.is_contested(key),
            "confidence": (self.properties.get(key) or {}).get("confidence"),
        }

    def type(self) -> Optional[Dict[str, Any]]:
        """Strongest match, or None when nothing matched."""
        return self.types[0] if self.types else None

    def types_now(self) -> List[Dict[str, Any]]:
        """Ranked matches. Always a list."""
        return self.types

    def as_(self, prototype: str) -> Optional["KSGObject"]:
        """
        The same entity seen through one matched prototype, by name or uuid.

        Members that prototype does not declare disappear, which is how a caller
        escapes a wrong top-ranked guess without another request. Named ``as_``
        because ``as`` is a Python keyword.
        """
        wanted = str(prototype)
        name = wanted
        entry = self.by_prototype.get(wanted)
        if entry is None:
            for key, value in self.by_prototype.items():
                if (value or {}).get("uuid") == wanted or key.lower() == wanted.lower():
                    name, entry = key, value
                    break
        if entry is None:
            return None

        allowed = entry.get("members") or []
        members: Dict[str, Any] = {}
        properties: Dict[str, Any] = {}
        for member_name in allowed:
            if member_name in self.members:
                members[member_name] = {
                    **self.members[member_name],
                    "definedBy": {
                        "prototypeUuid": entry.get("uuid"),
                        "prototypeName": name,
                        "score": entry.get("score"),
                    },
                }
            if member_name in self.properties:
                properties[member_name] = self.properties[member_name]

        return KSGObject({
            "ok": self.ok,
            "uuid": self.uuid,
            "hydratedAt": self.hydrated_at,
            "types": [{"uuid": entry.get("uuid"), "name": name, "score": entry.get("score")}],
            "members": members,
            "properties": properties,
            "byPrototype": {name: entry},
            "policy": self.policy,
        })

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ok": self.ok,
            "uuid": self.uuid,
            "hydratedAt": self.hydrated_at,
            "types": self.types,
            "members": self.members,
            "properties": self.properties,
        }


class EntityProxy:
    """
    ORM-style entity view over ``/api2.0/entities/:id/properties``.

    ``entity.middle_name`` / ``entity.middleName`` → winner value.
    ``entity.claims["middle_name"]`` → ranked claim stack.
    ``entity.prop("middle_name")`` → full cell ``{value, confidence, contested, claims}``.
    ``entity.get_type()`` → ranked prototype matches (fuzzy duck typing).
    """

    def __init__(self, payload: Optional[Dict[str, Any]] = None, client: Optional["KnowShowGoClient"] = None):
        payload = payload or {}
        self.ok = payload.get("ok", True) is not False
        self.uuid = payload.get("uuid") or payload.get("entityId")
        self.properties = payload.get("properties") or {}
        self.policy = payload.get("policy")
        self.types = payload.get("types") or payload.get("matched") or []
        self.raw = dict(payload)
        self._client = client
        self.claims = {
            key: (cell or {}).get("claims")
            for key, cell in self.properties.items()
        }

    def prop(self, name: str) -> Optional[Dict[str, Any]]:
        key = resolve_property_key(name, self.properties)
        return self.properties.get(key) if key else None

    def get_type(self, refresh: bool = False) -> List[Dict[str, Any]]:
        """Ranked prototype matches (closest first)."""
        if refresh and self._client is not None and self.uuid:
            body = self._client.get_entity_types(self.uuid)
            self.types = body.get("types") or body.get("matched") or []
        return list(self.types or [])

    # camelCase alias for JS parity
    getType = get_type

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(name)
        key = resolve_property_key(name, self.properties)
        if key is None:
            raise AttributeError(name)
        return self.properties[key].get("value")

    def __contains__(self, name: str) -> bool:
        return resolve_property_key(name, self.properties) is not None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ok": self.ok,
            "uuid": self.uuid,
            "properties": self.properties,
            "policy": self.policy,
            "types": self.types,
        }


_UNSET = object()


def _camel(key: str) -> str:
    """snake_case option name → the server's camelCase body key."""
    head, *rest = key.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in rest)


def _without_nulls(body: Dict[str, Any]) -> Dict[str, Any]:
    """``body`` without the keys whose value is ``None``: send only what was given."""
    return {k: v for k, v in body.items() if v is not None}


def matches_route(template: str, actual: str) -> bool:
    """Segment-wise match of `/api/objects/:uuid` templates to concrete paths."""
    expected = str(template or "").split("/")
    received = str(actual or "").split("/")
    if len(expected) != len(received):
        return False
    for seg, got in zip(expected, received):
        if not seg.startswith(":") and seg != got:
            return False
    return True


LOGIC_IR_LINEAGE_PREFIX = "category:logic-ir:"
"""Lineage-key prefix every seeded Logic IR primitive category carries."""


# ===== Object -> prototype matching (AC1); parity with js/client.js =====
_OBJECT_NAME_KEYS = ("label", "name", "title")
_OBJECT_META_KEYS = {"uuid", "id", "type", "types", "prototype", "prototypeIds", "instanceOf",
                     "properties", "props", "description", "summary", *_OBJECT_NAME_KEYS}
PROPERTY_OVERLAP_WEIGHT = 0.3
_TAXONOMY_CACHE_S = 600
_MATCH_EVIDENCE_WINDOW = 25
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _normalize_key(k: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(k if k is not None else "").lower())


def _human_key(k: Any) -> str:
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", str(k))
    return re.sub(r"[_-]+", " ", s).lower()


def _value_text(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (list, tuple)):
        return ", ".join(t for t in (_value_text(x) for x in v) if t)
    if isinstance(v, dict):
        for key in ("label", "name", "value", "title"):
            if v.get(key) is not None:
                return _value_text(v[key])
        return ""
    s = str(v)
    return "" if _UUID_RE.match(s) else s


def object_properties(obj: Any) -> Dict[str, Any]:
    """The descriptive properties of an object: ``properties``/``props``, else its own non-meta keys."""
    if not isinstance(obj, dict):
        return {}
    nested = obj.get("properties", obj.get("props"))
    if isinstance(nested, dict):
        return nested
    return {k: v for k, v in obj.items() if k not in _OBJECT_META_KEYS}


def object_to_match_text(obj: Any) -> str:
    """Text an object is embedded as: "<label>. <description>. key: value; key: value"."""
    if obj is None:
        return ""
    if not isinstance(obj, dict):
        return str(obj)
    parts = []
    name = next((obj[k] for k in _OBJECT_NAME_KEYS if obj.get(k) not in (None, "")), None)
    if name:
        parts.append(f"{_value_text(name)}.")
    description = obj.get("description") or obj.get("summary")
    if description:
        parts.append(f"{_value_text(description)}.")
    pairs = [f"{_human_key(k)}: {t}" for k, v in object_properties(obj).items() for t in [_value_text(v)] if t]
    if pairs:
        parts.append("; ".join(pairs))
    return " ".join(parts).strip()


def _property_schema_by_prototype(tree: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    nodes = {n["uuid"]: n for n in (tree or {}).get("nodes", []) if n.get("uuid")}
    memo: Dict[str, Dict[str, Any]] = {}

    def collect(uuid: str, seen: set) -> Dict[str, Any]:
        if uuid in memo:
            return memo[uuid]
        if uuid in seen:
            return {"props": {}, "lineage": []}
        seen.add(uuid)
        node = nodes.get(uuid) or {}
        props: Dict[str, str] = {}
        lineage = [node["name"]] if node.get("name") else []
        for parent in node.get("parents") or []:
            up = collect(parent, seen)
            props.update(up["props"])
            lineage.extend(n for n in up["lineage"] if n not in lineage)
        for p in node.get("properties") or []:
            if not p or not p.get("name"):
                continue
            props[_normalize_key(p["name"])] = p["name"]
            if p.get("schemaName"):
                props[_normalize_key(p["schemaName"])] = p["name"]
        memo[uuid] = {"props": props, "lineage": lineage}
        return memo[uuid]

    return {uuid: collect(uuid, set()) for uuid in nodes}


def _property_evidence(object_props: Dict[str, Any], entry: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    keys = list((object_props or {}).keys())
    if not entry:
        return {"schema": False, "matched": [], "missing": [], "extra": keys, "known": [], "isA": [], "overlap": None}
    known = entry["props"]
    matched: List[str] = []
    extra: List[str] = []
    for k in keys:
        hit = known.get(_normalize_key(k))
        if hit:
            if hit not in matched:
                matched.append(hit)
        else:
            extra.append(k)
    names = list(dict.fromkeys(known.values()))
    return {
        "schema": True,
        "matched": matched,
        "extra": extra,
        "missing": [n for n in names if n not in matched],
        "known": names,
        "isA": entry["lineage"],
        "overlap": round(len(matched) / len(keys), 4) if keys else None,
    }


def _logic_ir_name_from_lineage(lineage: str) -> Optional[str]:
    """``category:logic-ir:proposition`` -> ``Proposition``, for unnamed rows."""
    slug = lineage[len(LOGIC_IR_LINEAGE_PREFIX):]
    if not slug:
        return None
    return slug[0].upper() + slug[1:]


def _security_class_field(security_class: Optional[str], scope: Optional[str]) -> Dict[str, Any]:
    """``{"securityClass": ...}`` for an assertion write, or ``{}`` when neither
    ``security_class`` nor its alias ``scope`` was given. The value is not checked
    here: the server validates it (``public`` | ``private``, anything else 400)."""
    value = security_class if security_class is not None else scope
    return {} if value is None else {"securityClass": value}


class KnowShowGoClient:
    """Python client for KnowShowGo REST API"""

    def __init__(
        self,
        base_url: Optional[str] = None,
        prototype_api_prefix: str = "/api2.0",
        topic_api_prefix: str = "/api2.0",
        enforce_contract: bool = False,
        default_owner_user_id: Optional[str] = None,
        default_agent_session_id: Optional[str] = None,
        auth_token: Optional[str] = None,
        access_token: Optional[str] = None,
        api_token: Optional[str] = None,
        token_provider=None,
        admin_secret: Optional[str] = None,
        auto_connect: bool = False,
    ):
        self.base_url = resolve_base_url(base_url).rstrip('/')
        self.session = requests.Session()
        # New features live under the /api2.0 namespace by default; set this to
        # "/api" to fall back to the retained backward-compatible alias.
        self.prototype_api_prefix = prototype_api_prefix
        self.topic_api_prefix = topic_api_prefix
        self.default_owner_user_id = default_owner_user_id
        self.default_agent_session_id = default_agent_session_id
        # Hard identity. A signed token cannot be spoofed the way the soft owner
        # headers can, and the server prefers it over them when both are present.
        self.auth_token = auth_token or access_token or api_token
        self.token_provider = token_provider if callable(token_provider) else None
        # Minting a token for someone else needs the server's admin secret, sent
        # as X-KSG-Admin. Without it a caller can only mint for the owner they
        # already hold a token for, which leaves no way to issue the first one.
        self.admin_secret = admin_secret
        self._contract = None
        self._enforce_contract = enforce_contract
        self._connected = False
        if auto_connect:
            try:
                self.connect()
            except Exception:
                # Mirror JS: failed auto_connect must not crash construction;
                # callers that care should call ready()/connect() explicitly.
                pass

    @staticmethod
    def _merge_aliases(body: Dict[str, Any], aliases: Dict[str, str]) -> Dict[str, Any]:
        out = dict(body)
        for alias, source in aliases.items():
            if alias not in out and source in out:
                out[alias] = out[source]
        return out

    def _assert_contract_path(self, method: str, path: str) -> None:
        if not self._enforce_contract or not self._contract:
            return
        allowed = any(
            entry.get('method') == method and matches_route(entry.get('path', ''), path)
            for entry in self._contract
        )
        if not allowed:
            raise ValueError(f'endpoint not in client contract: {method} {path}')

    def ready(self) -> "KnowShowGoClient":
        """No-op sync counterpart to the JS ready(); connect() is synchronous here."""
        return self

    def _resolve_auth_token(self, explicit=None):
        if explicit is not None:
            return explicit
        if self.token_provider is not None:
            provided = self.token_provider()
            if provided:
                self.auth_token = provided
                return provided
        return self.auth_token

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make HTTP request to API"""
        self._assert_contract_path(method, endpoint)
        url = f"{self.base_url}{endpoint}"
        owner_user_id = kwargs.pop("owner_user_id", None)
        agent_session_id = kwargs.pop("agent_session_id", None)
        if owner_user_id is None:
            owner_user_id = self.default_owner_user_id
        if agent_session_id is None:
            agent_session_id = self.default_agent_session_id

        auth_token = self._resolve_auth_token(kwargs.pop("auth_token", None))
        admin_secret = kwargs.pop("admin_secret", None)
        if admin_secret is None:
            admin_secret = self.admin_secret

        headers = dict(kwargs.pop("headers", None) or {})
        if owner_user_id:
            headers["X-KSG-Owner"] = str(owner_user_id)
        if agent_session_id:
            headers["X-KSG-Session"] = str(agent_session_id)
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
        if admin_secret:
            headers["X-KSG-Admin"] = str(admin_secret)
        if headers:
            kwargs["headers"] = headers

        params = dict(kwargs.get("params") or {})
        # Prefer Authorization over identity-in-query (logs/caches).
        if not auth_token:
            if owner_user_id and "ownerUserId" not in params:
                params["ownerUserId"] = owner_user_id
            if agent_session_id and "agentSessionId" not in params:
                params["agentSessionId"] = agent_session_id
        if params:
            kwargs["params"] = params

        json_body = kwargs.get("json")
        if isinstance(json_body, dict):
            body = dict(json_body)
            if owner_user_id is not None and "ownerUserId" not in body:
                body["ownerUserId"] = owner_user_id
            if agent_session_id is not None and "agentSessionId" not in body:
                body["agentSessionId"] = agent_session_id
            kwargs["json"] = body

        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()

    def get_release_manifest(self) -> Dict[str, Any]:
        """Fetch server release manifest and supported endpoint contract"""
        return self._request('GET', '/api/release')

    @classmethod
    def public_api(cls, **kwargs) -> "KnowShowGoClient":
        """Client for the canonical hosted API without hardcoding the URL."""
        kwargs.setdefault("base_url", PUBLIC_API_BASE_URL)
        return cls(**kwargs)

    def connect(
        self,
        expected_channel: Optional[str] = None,
        expected_release: Optional[str] = None,
        enforce_contract: bool = False,
        adopt_advertised_base_url: bool = False,
    ) -> Dict[str, Any]:
        """Discover the server contract. Channel/release pins are opt-in.

        A bare ``connect()`` accepts whatever the server advertises (public
        release or dev). Pass ``expected_channel`` / ``expected_release`` to
        fail fast against an unexpected host.

        ``adopt_advertised_base_url`` re-points this client at ``api.publicBaseUrl``
        from the manifest.
        """
        manifest = self.get_release_manifest()
        if expected_channel and manifest.get('channel') != expected_channel:
            raise ValueError(f"expected channel {expected_channel}, got {manifest.get('channel')}")
        if expected_release and manifest.get('release') != expected_release:
            raise ValueError(f"expected release {expected_release}, got {manifest.get('release')}")
        self._contract = (manifest.get('surfaces') or {}).get('clientContract')
        self._enforce_contract = enforce_contract
        api = manifest.get('api') or {}
        self.api_prefixes = api.get('prefixes')
        if adopt_advertised_base_url and api.get('publicBaseUrl'):
            self.base_url = str(api['publicBaseUrl']).rstrip('/')
        return manifest

    # ===== Prototype Methods =====

    def create_prototype(
        self,
        name: str,
        description: Optional[str] = None,
        context: Optional[str] = None,
        labels: Optional[List[str]] = None,
        embedding: Optional[List[float]] = None,
        parent_prototype_uuids: Optional[List[str]] = None
    ) -> str:
        """Create a new prototype"""
        data = {
            "name": name,
            "description": description,
            "context": context,
            "labels": labels or [],
            "embedding": embedding,
            "parentPrototypeUuids": parent_prototype_uuids
        }
        result = self._request("POST", "/api/prototypes", json=data)
        return result["uuid"]

    def get_prototype(self, uuid: str) -> Dict[str, Any]:
        """Get a prototype by UUID"""
        return self._request("GET", f"/api/prototypes/{uuid}")

    # ===== Concept Methods =====

    def create_concept(
        self,
        prototype_uuid: str,
        json_obj: Dict[str, Any],
        embedding: Optional[List[float]] = None,
        previous_version_uuid: Optional[str] = None
    ) -> str:
        """Create a new concept"""
        data = {
            "prototypeUuid": prototype_uuid,
            "jsonObj": json_obj,
            "embedding": embedding,
            "previousVersionUuid": previous_version_uuid
        }
        result = self._request("POST", "/api/concepts", json=data)
        return result["uuid"]

    def get_concept(self, uuid: str) -> Dict[str, Any]:
        """Get a concept by UUID"""
        return self._request("GET", f"/api/concepts/{uuid}")

    def search_concepts(
        self,
        query: str,
        top_k: int = 10,
        similarity_threshold: float = 0.0,
        prototype_filter: Optional[str] = None,
        scope: Optional[str] = None,
        props: Optional[Dict[str, Any]] = None,
        kind: Optional[str] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Search for concepts by semantic similarity.

        ``similarity_threshold`` defaults to no floor, matching the server and
        the JS client. A 0.7 default was safe only while the server dropped the
        parameter; now that it is applied, and because both backends score a
        text-path match a constant 0.5, that default returned nothing at all.

        ``scope="owner"`` (server >= 0.2.29) scopes the database scan to the
        caller's own nodes; ``props`` is exact equality on named props. Both
        are sent only when given, so the request to an older server is unchanged.
        """
        data = {
            "query": query,
            "topK": top_k,
            "similarityThreshold": similarity_threshold,
            "prototypeFilter": prototype_filter
        }
        if scope:
            data["scope"] = scope
        if isinstance(props, dict) and props:
            data["props"] = props
        if kind:
            data["kind"] = kind
        result = self._request(
            "POST",
            "/api/concepts/search",
            json=data,
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )
        return result["results"]

    # ===== Association Methods =====

    def add_association(
        self,
        from_concept_uuid: str,
        to_concept_uuid: str,
        relation_type: str,
        strength: float = 1.0
    ) -> None:
        """Create an association between concepts"""
        data = {
            "fromConceptUuid": from_concept_uuid,
            "toConceptUuid": to_concept_uuid,
            "relationType": relation_type,
            "strength": strength
        }
        self._request("POST", "/api/associations", json=data)

    def get_associations(
        self,
        uuid: str,
        direction: str = "both"
    ) -> List[Dict[str, Any]]:
        """Get associations for a concept"""
        result = self._request(
            "GET",
            f"/api/associations/{uuid}",
            params={"direction": direction}
        )
        return result["associations"]

    # ===== API tokens (hard identity) =====
    # The soft X-KSG-Owner header is client-supplied and therefore trusted only
    # as far as the caller is; these mint signed tokens the server can actually
    # verify. Token endpoints share the prototype prefix (/api2.0 with /api kept
    # as the backward-compatible alias).

    def set_auth_token(self, token: Optional[str]) -> "KnowShowGoClient":
        """Swap the bearer token on a live client (e.g. after minting one)."""
        self.auth_token = token or None
        return self

    def create_api_token(
        self,
        owner_user_id: Optional[str] = None,
        label: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        ttl_days: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Mint a token for an owner.

        The raw token comes back exactly once — the server stores only a record
        of it — so a caller that drops it must mint another.
        """
        return self._request(
            "POST",
            f"{self.prototype_api_prefix}/auth/tokens",
            json={
                "ownerUserId": owner_user_id,
                "label": label,
                "agentSessionId": agent_session_id,
                "ttlDays": ttl_days,
            },
        )

    def list_api_tokens(self, owner_user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List an owner's token records (never the raw tokens)."""
        params = {"ownerUserId": owner_user_id} if owner_user_id else None
        result = self._request(
            "GET", f"{self.prototype_api_prefix}/auth/tokens", params=params
        )
        return result.get("tokens", [])

    def revoke_api_token(self, jti: str, owner_user_id: Optional[str] = None) -> Dict[str, Any]:
        """Revoke one token by its ``jti``."""
        return self._request(
            "POST",
            f"{self.prototype_api_prefix}/auth/tokens/{jti}/revoke",
            json={"ownerUserId": owner_user_id},
        )

    def get_admin_usage(self, admin_token: Optional[str] = None) -> Dict[str, Any]:
        """Per-principal request/read/write counts for cost and quota tracking.

        Admin-only, and it authenticates differently from the token endpoints:
        the admin secret goes in as the bearer here, not the X-KSG-Admin header.
        """
        return self._request(
            "GET",
            "/api/admin/usage",
            auth_token=admin_token or self.admin_secret or self.auth_token,
        )

    # ===== Prototype / centroid (prototype-theory) mechanics =====
    def generalize_from_exemplar(
        self,
        concept_uuid: str = None,
        text: str = None,
        json_obj: Dict[str, Any] = None,
        prototype_uuid: str = None,
        label: str = None,
        threshold: float = 0.85,
        create_if_no_match: bool = True
    ) -> Dict[str, Any]:
        """Fold an exemplar into the nearest prototype by centroid similarity,
        creating a new prototype when nothing is similar enough."""
        data = {
            "conceptUuid": concept_uuid,
            "text": text,
            "jsonObj": json_obj,
            "prototypeUuid": prototype_uuid,
            "label": label,
            "threshold": threshold,
            "createIfNoMatch": create_if_no_match
        }
        return self._request("POST", f"{self.prototype_api_prefix}/prototypes/generalize", json=data)

    def match_prototypes(
        self,
        text: str = None,
        embedding: List[float] = None,
        top_k: int = 5,
        threshold: float = 0.0,
        object: Optional[Dict[str, Any]] = None,
        evidence: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        """Rank existing prototypes by how typical the item is of each.

        Nearest-centroid over the values each prototype absorbed, so this answers
        value-shaped questions ("which category is this?"). To ask which FIELD a
        label names, use :meth:`search_property_definitions`: a value centroid
        drifts toward the shape of the data, so "Card number" would rank closer
        to ``cvv`` than to ``number``.

        Pass ``object`` (a label plus properties) to classify a structured thing:
        each match then carries ``typicality`` (cosine to the centroid),
        ``evidence`` (which of the object's properties the prototype declares,
        own or inherited, and its ``isA`` lineage) and ``rankScore``, the order
        returned: score blended with property overlap by PROPERTY_OVERLAP_WEIGHT.
        """
        query_text = text if text is not None else (object_to_match_text(object) if object is not None else None)
        with_evidence = evidence if evidence is not None else object is not None
        window = max(top_k * 4, _MATCH_EVIDENCE_WINDOW) if with_evidence else top_k
        data = {
            "text": query_text,
            "embedding": embedding,
            "topK": window,
            "threshold": threshold,
        }
        result = self._request("POST", f"{self.prototype_api_prefix}/prototypes/match", json=data)
        matches = result["matches"]
        if not with_evidence or not isinstance(matches, list):
            return matches
        object_props = object_properties(object)
        has_props = bool(object_props)
        schema = self._taxonomy_schema()
        ranked = []
        for m in matches:
            # Per-property value prototypes answer which FIELD a value fills, not what a thing IS.
            if m.get("propertyName") or str(m.get("name") or "").startswith("PropertyValue:"):
                continue
            ev = _property_evidence(object_props, (schema or {}).get(m.get("uuid")))
            score = float(m.get("score") or 0)
            rank = score if not has_props else round((1 - PROPERTY_OVERLAP_WEIGHT) * score + PROPERTY_OVERLAP_WEIGHT * (ev["overlap"] or 0), 4)
            typicality = m.get("centroidScore") if m.get("centroidScore") is not None else m.get("score")
            ranked.append({**m, "typicality": typicality, "evidence": ev, "rankScore": rank})
        ranked.sort(key=lambda r: r["rankScore"], reverse=True)
        return ranked[:top_k]

    def _taxonomy_schema(self) -> Optional[Dict[str, Dict[str, Any]]]:
        import time
        now = time.time()
        cache = getattr(self, "_taxonomy_cache", None)
        if cache and now - cache["at"] < _TAXONOMY_CACHE_S:
            return cache["schema"]
        try:
            self._taxonomy_cache = {"at": now, "schema": _property_schema_by_prototype(self.get_taxonomy())}
        except Exception:  # noqa: BLE001 - a missing route degrades to scores only
            self._taxonomy_cache = {"at": now - _TAXONOMY_CACHE_S + 30, "schema": None}
        return self._taxonomy_cache["schema"]

    def get_taxonomy(self, root: Optional[str] = None) -> Dict[str, Any]:
        """TX1: the prototype tree under ``root`` (default Thing)."""
        kwargs = {"params": {"root": root}} if root else {}
        return self._request("GET", f"{self.prototype_api_prefix}/taxonomy", **kwargs)

    def get_taxonomy_prototype(self, uuid: str) -> Dict[str, Any]:
        """TX1: one prototype with centroid, properties, exemplars and instances."""
        return self._request("GET", f"{self.prototype_api_prefix}/taxonomy/prototypes/{uuid}")

    def get_taxonomy_node(self, uuid: str, history: bool = False) -> Dict[str, Any]:
        """TX1: one node with its prototypes, typicality and propositions."""
        kwargs = {"params": {"history": 1}} if history else {}
        return self._request("GET", f"{self.prototype_api_prefix}/taxonomy/nodes/{uuid}", **kwargs)

    def lookup_concept(self, term: str, context: Optional[str] = None, entity_type: Optional[str] = None, force: Optional[bool] = None) -> Dict[str, Any]:
        """CE3: look a public term up (Wikidata, Wikipedia, Wiktionary) and ground it."""
        body = _without_nulls({"term": term, "context": context, "entityType": entity_type, "force": force})
        return self._request("POST", f"{self.prototype_api_prefix}/concepts/lookup", json=body)

    def get_inferred_proposition_stats(self) -> Dict[str, Any]:
        """CE3d counters: model propositions proposed, reused, refused, confirmed, contradicted."""
        return self._request("GET", f"{self.prototype_api_prefix}/propositions/inferred/stats")

    # ===== CS1: the rest of the agent-facing routes (server capability manifest) =====

    def reconcile_inferred_propositions(self, label: str) -> Dict[str, Any]:
        """CE3d: check the model's proposals about a name against higher-tier claims."""
        return self._request("POST", f"{self.prototype_api_prefix}/propositions/reconcile", json={"label": label})

    def list_value_types(self) -> Dict[str, Any]:
        """TB2/KV1: the closed list of property value types and external-id schemes."""
        return self._request("GET", f"{self.prototype_api_prefix}/value-types")

    def search_predicates(self, query: str = "", limit: Optional[int] = None) -> Dict[str, Any]:
        """TB2: declared properties whose name matches ``query``."""
        return self._request("GET", f"{self.prototype_api_prefix}/predicates", params=_without_nulls({"q": query, "limit": limit}))

    def declare_predicate(
        self,
        name: str,
        value_type: str,
        cardinality: Optional[str] = None,
        range: Optional[List[str]] = None,
        options: Optional[List[Any]] = None,
        description: Optional[str] = None,
        attach_to: Optional[str] = None,
    ) -> Dict[str, Any]:
        """TB2: declare a property; an existing name is returned, not duplicated."""
        body = _without_nulls({
            "name": name, "valueType": value_type, "cardinality": cardinality, "range": range,
            "options": options, "description": description, "attachTo": attach_to,
        })
        return self._request("POST", f"{self.prototype_api_prefix}/predicates/declare", json=body)

    def get_prototype_fields(self, uuid: str) -> Dict[str, Any]:
        """TB2: a prototype's own and inherited properties (its create form)."""
        return self._request("GET", f"{self.prototype_api_prefix}/prototypes/{uuid}/fields")

    def search_articles(self, query: str = "", range: Optional[List[str]] = None, limit: Optional[int] = None) -> Dict[str, Any]:
        """TB2: topics (articles) whose title matches ``query``."""
        params = _without_nulls({"q": query, "range": ",".join(range) if range else None, "limit": limit})
        return self._request("GET", f"{self.prototype_api_prefix}/articles", params=params)

    def get_article(self, uuid: str) -> Dict[str, Any]:
        """TB2: one topic as an article, every version of every value with its provenance."""
        return self._request("GET", f"{self.prototype_api_prefix}/articles/{uuid}")

    def create_article(
        self,
        prototype_uuid: str,
        title: str,
        description: Optional[str] = None,
        fields: Optional[List[Dict[str, Any]]] = None,
        private: Optional[bool] = None,
        allow_duplicate: Optional[bool] = None,
        source_url: Optional[str] = None,
        source_title: Optional[str] = None,
        note: Optional[str] = None,
    ) -> Dict[str, Any]:
        """TB2: create a topic of a prototype with typed fields (signed-in owner only)."""
        body = _without_nulls({
            "prototypeUuid": prototype_uuid, "title": title, "description": description, "fields": fields,
            "private": private, "allowDuplicate": allow_duplicate, "sourceUrl": source_url,
            "sourceTitle": source_title, "note": note,
        })
        return self._request("POST", f"{self.prototype_api_prefix}/articles", json=body)

    def amend_article(
        self,
        uuid: str,
        predicate: str,
        value_type: Optional[str] = None,
        value: Any = None,
        object_uuid: Optional[str] = None,
        unit: Optional[str] = None,
        lang: Optional[str] = None,
        precision: Optional[str] = None,
        scheme: Optional[str] = None,
        replaces_claim: Optional[str] = None,
        source_url: Optional[str] = None,
        source_title: Optional[str] = None,
        note: Optional[str] = None,
    ) -> Dict[str, Any]:
        """TB2: amend a topic with one typed claim; ``replaces_claim`` versions an old value."""
        body = _without_nulls({
            "predicate": predicate, "valueType": value_type, "value": value, "objectUuid": object_uuid,
            "unit": unit, "lang": lang, "precision": precision, "scheme": scheme, "replacesClaim": replaces_claim,
            "sourceUrl": source_url, "sourceTitle": source_title, "note": note,
        })
        return self._request("POST", f"{self.prototype_api_prefix}/articles/{uuid}/claims", json=body)

    def get_taxonomy_duplicates(self) -> Dict[str, Any]:
        """DH1: public prototype names with more than one active prototype."""
        return self._request("GET", f"{self.prototype_api_prefix}/taxonomy/duplicates")

    def resolve_concept(self, label: str, **options: Any) -> Dict[str, Any]:
        """Resolve a label to its preferred concept without creating anything."""
        body = _without_nulls({"label": label, **{_camel(k): v for k, v in options.items()}})
        return self._request("POST", f"{self.prototype_api_prefix}/concepts/resolve", json=body)

    def find_or_create_concept(self, label: str, **options: Any) -> Dict[str, Any]:
        """The existing concept for this label, or a new one."""
        body = _without_nulls({"label": label, **{_camel(k): v for k, v in options.items()}})
        return self._request("POST", f"{self.prototype_api_prefix}/concepts/find-or-create", json=body)

    def merge_concepts(self, survivor: str, members: List[str], score: Optional[float] = None, reason: Optional[str] = None) -> Dict[str, Any]:
        """Merge duplicate concepts into a survivor (reversible with ``unmerge_concept``)."""
        body = _without_nulls({"survivor": survivor, "members": members, "score": score, "reason": reason})
        return self._request("POST", f"{self.prototype_api_prefix}/concepts/merge", json=body)

    def unmerge_concept(self, uuid: str, reason: Optional[str] = None) -> Dict[str, Any]:
        """Take one member back out of a merge."""
        return self._request("POST", f"{self.prototype_api_prefix}/concepts/{uuid}/unmerge", json=_without_nulls({"reason": reason}))

    def get_concept_variants(self, uuid: str) -> Dict[str, Any]:
        """The concepts merged into this one."""
        return self._request("GET", f"{self.prototype_api_prefix}/concepts/{uuid}/variants")

    def get_derivation(self, uuid: str) -> Dict[str, Any]:
        """One recorded Logic IR derivation, explained."""
        return self._request("GET", f"{self.prototype_api_prefix}/logic-ir/derivations/{uuid}")

    def get_derivation_tree(self, uuid: str, max_depth: Optional[int] = None) -> Dict[str, Any]:
        """The proof tree under a derivation."""
        kwargs = {"params": {"maxDepth": max_depth}} if max_depth else {}
        return self._request("GET", f"{self.prototype_api_prefix}/logic-ir/derivations/{uuid}/tree", **kwargs)

    def assimilate_exemplar(self, subject: str, category: str) -> Dict[str, Any]:
        """Add a confirmed member to a category's exemplars."""
        return self._request("POST", f"{self.prototype_api_prefix}/prototypes/assimilate", json={"subject": subject, "category": category})

    def hydrate_entity(self, entity_id: str, top_k: Optional[int] = None, threshold: Optional[float] = None) -> Dict[str, Any]:
        """The raw one-trip hydration payload for an entity."""
        params = _without_nulls({"topK": top_k, "threshold": threshold})
        return self._request("GET", f"{self.prototype_api_prefix}/entities/{entity_id}/hydrate", params=params)

    def for_owner(
        self,
        auth_token: Optional[str] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
    ) -> "KnowShowGoClient":
        """KT1: a copy of this client that acts as one owner (its token on every call).

        Without ``auth_token`` the copy keeps this client's token. This client is
        not changed; the HTTP session is shared.
        """
        view = copy.copy(self)
        if auth_token is not None:
            view.auth_token = auth_token
            view.token_provider = None
        if owner_user_id is not None:
            view.default_owner_user_id = owner_user_id
        if agent_session_id is not None:
            view.default_agent_session_id = agent_session_id
        return view

    def resolve_slots(
        self,
        labels: List[str],
        candidates: List[str] = None,
        floor: float = 0.5,
        top_k: int = 40,
        owner_user_id: str = None,
        agent_session_id: str = None
    ) -> Dict[str, Any]:
        """Resolve observed labels onto stored fields.

        Works for a web form's inputs, a CSV header row, or an API payload — the
        server ranks and assigns so callers do not each reimplement it.
        ``candidates`` closes the set to fields you actually hold, and assignment
        is one-to-one: a field fills at most one label.

        Returns ``{"slots": [{"label", "property", "score"}], "unresolved": [...]}``.
        """
        return self._request(
            "POST",
            f"{self.prototype_api_prefix}/slots/resolve",
            json={"labels": labels, "candidates": candidates, "floor": floor, "topK": top_k},
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )

    def search_property_definitions(
        self,
        query: str,
        top_k: int = 20,
        owner_user_id: str = None,
        agent_session_id: str = None
    ) -> List[Dict[str, Any]]:
        """Which stored field does this label name?

        Ranks property-definition concepts over the same vector index every other
        search uses, filtered by node role. Returns one entry per property, best
        first: ``[{"property", "valueType", "score", "uuid"}]``.
        """
        results = self.search_concepts(
            query,
            top_k=top_k,
            similarity_threshold=0.0,
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )
        out = []
        seen = set()
        for r in results or []:
            props = r.get("props") or {}
            if props.get("isObjectPropertyDefinition") is not True:
                continue
            prop = props.get("propertyName")
            if not prop or prop in seen:
                continue
            seen.add(prop)
            out.append({
                "property": prop,
                "valueType": props.get("valueType"),
                "score": r.get("similarity") or 0,
                "uuid": r.get("uuid"),
            })
        return out

    def search_prototypes(self, query: str = "", top_k: int = 10) -> List[Dict[str, Any]]:
        """Label/tag autocomplete over prototypes (e.g. to pick an object "type")."""
        result = self._request(
            "POST",
            f"{self.prototype_api_prefix}/prototypes/search",
            json={"query": query, "topK": top_k}
        )
        return result["prototypes"]

    def attach_exemplar(self, prototype_uuid: str, concept_uuid: str) -> Dict[str, Any]:
        """Attach an existing concept as an exemplar of a known prototype."""
        return self._request(
            "POST",
            f"{self.prototype_api_prefix}/prototypes/{prototype_uuid}/exemplars",
            json={"conceptUuid": concept_uuid}
        )

    def evaluate_prototype_match(
        self,
        object_revision_uuid: str,
        prototype_revision_uuid: str,
        context_revision_uuid: Optional[str] = None
    ) -> Dict[str, Any]:
        """Evaluate and cache an exact object/prototype revision pair."""
        return self._request(
            "POST",
            f"{self.prototype_api_prefix}/prototype-matches/evaluate",
            json={
                "objectRevisionUuid": object_revision_uuid,
                "prototypeRevisionUuid": prototype_revision_uuid,
                "contextRevisionUuid": context_revision_uuid,
            }
        )

    def evaluate_prototype_match_list(
        self,
        object_revision_uuid: str,
        prototype_revision_uuids=None,
        context_revision_uuid: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """List match decisions for one object vs many prototypes (not WTA)."""
        payload = {
            "objectRevisionUuid": object_revision_uuid,
            "prototypeRevisionUuids": list(prototype_revision_uuids or []),
            "contextRevisionUuid": context_revision_uuid,
        }
        if limit is not None:
            payload["limit"] = limit
        return self._request(
            "POST",
            f"{self.prototype_api_prefix}/prototype-matches/list",
            json=payload,
        )

    def cast_object(
        self,
        object_revision_uuid: str,
        prototype_revision_uuid: str,
        context_revision_uuid: Optional[str] = None,
        require_match: bool = True,
        title: Optional[str] = None,
        object_lineage_key: Optional[str] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Persist a new object under a chosen prototype. Source is unchanged."""
        return self._request(
            "POST",
            f"{self.prototype_api_prefix}/prototype-matches/cast",
            json={
                "objectRevisionUuid": object_revision_uuid,
                "prototypeRevisionUuid": prototype_revision_uuid,
                "contextRevisionUuid": context_revision_uuid,
                "requireMatch": require_match,
                "title": title,
                "objectLineageKey": object_lineage_key,
            },
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )

    def evaluate_logic_inference(
        self,
        premise_revision_uuids=None,
        conclusion_revision_uuid=None,
        argument_revision_uuid=None,
        record: bool = False,
    ) -> Dict[str, Any]:
        """Evaluate P1 + P2 ⊢ P3 with the tiny Logic IR inference core.

        Structural validity only; never reads the graph. ``record=True`` (KG2)
        persists a valid result as a Derivation object and the response then
        carries ``derivation``.
        """
        body: Dict[str, Any] = {
            "premiseRevisionUuids": list(premise_revision_uuids or []),
            "conclusionRevisionUuid": conclusion_revision_uuid,
            "argumentRevisionUuid": argument_revision_uuid,
        }
        if record is True:
            body["record"] = True
        return self._request(
            "POST",
            f"{self.prototype_api_prefix}/logic-ir/infer",
            json=body,
        )

    def evaluate_logic_ir(
        self,
        ir: Optional[Dict[str, Any]] = None,
        bindings: Optional[List[Dict[str, Any]]] = None,
        proposition_revision_uuid: Optional[str] = None,
        membership_predicate: Optional[str] = None,
        record: bool = False,
    ) -> Dict[str, Any]:
        """Truth of a quantifier-free formula against stored claims (KG1).

        Three-valued: ``truth`` is ``'true' | 'false' | 'unknown'``, with the
        claim uuids consulted per atom. Absence is ``unknown``, never
        ``false``; quantifiers are refused. Pass ``ir`` (+ ``bindings``) or a
        ``proposition_revision_uuid``. ``record=True`` (KG2) persists a
        true/false evaluation as a Derivation.
        """
        body: Dict[str, Any] = {}
        if ir is not None:
            body["ir"] = ir
        if bindings is not None:
            body["bindings"] = bindings
        if proposition_revision_uuid:
            body["propositionRevisionUuid"] = proposition_revision_uuid
        if membership_predicate:
            body["membershipPredicate"] = membership_predicate
        if record is True:
            body["record"] = True
        return self._request(
            "POST",
            f"{self.prototype_api_prefix}/logic-ir/evaluate",
            json=body,
        )

    def explain_derivation(self, derivation_uuid: str) -> Dict[str, Any]:
        """Walk a derivation back through the graph (KG2).

        Returns ``derivation``, ``rule`` (uuid, name, engineRevision),
        ``premises`` (uuid, kind, claimUuid, order) and ``conclusion`` (uuid,
        hash). Edges only, so it answers the same after a restart.
        """
        if not derivation_uuid:
            raise ValueError("derivation_uuid is required")
        return self._request(
            "GET",
            f"{self.prototype_api_prefix}/logic-ir/derivations/{derivation_uuid}",
        )

    def list_derivations(self, conclusion_uuid: str) -> List[Dict[str, Any]]:
        """Every derivation whose ``derives`` edge points at this conclusion (KG2)."""
        if not conclusion_uuid:
            raise ValueError("conclusion_uuid is required")
        result = self._request(
            "GET",
            f"{self.prototype_api_prefix}/logic-ir/derivations",
            params={"conclusion": conclusion_uuid},
        )
        return list(result.get("derivations") or [])

    # ===== Logic IR rules (KG3 / KG5 / KG21) =====
    # Rules are graph objects: each change is a new version of the same lineage,
    # and every derivation names the rule version it used. Refusals raise
    # requests.HTTPError; the body carries ``code`` (R001 bad input, R002
    # disabled -> 409, R003 not found -> 404).

    def create_rule(
        self,
        name: str,
        ir: Dict[str, Any],
        description: Optional[str] = None,
        enabled: Optional[bool] = None,
        provenance: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Add a rule (a guarded universal in Logic IR).

        The same name with the same body is one object; a changed body is the
        next version. Returns ``{ ok, ruleUuid, version, reused, revision,
        enabled, name, domain, variable }``.
        """
        if not name or not str(name).strip():
            raise ValueError("name is required")
        if not isinstance(ir, dict):
            raise ValueError("ir is required")
        body = _without_nulls({"name": name, "ir": ir, "description": description, "enabled": enabled, "provenance": provenance})
        return self._request("POST", f"{self.prototype_api_prefix}/logic-ir/rules", json=body)

    def list_rules(self) -> Dict[str, Any]:
        """The current version of every rule the caller may read: ``{ ok, rulesRevision, rules }``."""
        return self._request("GET", f"{self.prototype_api_prefix}/logic-ir/rules")

    def get_rule(self, rule_uuid: str) -> Dict[str, Any]:
        """One rule version with every version of its lineage: ``{ ok, rule, versions }``."""
        if not rule_uuid:
            raise ValueError("rule_uuid is required")
        return self._request("GET", f"{self.prototype_api_prefix}/logic-ir/rules/{rule_uuid}")

    def set_rule_enabled(self, rule_uuid: str, enabled: bool) -> Dict[str, Any]:
        """Enable or disable a rule; a new version unless nothing changes (``unchanged: True``)."""
        if not rule_uuid:
            raise ValueError("rule_uuid is required")
        if not isinstance(enabled, bool):
            raise ValueError("enabled must be a boolean")
        return self._request(
            "POST",
            f"{self.prototype_api_prefix}/logic-ir/rules/{rule_uuid}/enabled",
            json={"enabled": enabled},
        )

    def check_rules(
        self,
        rule_uuids: List[str],
        members: List[Any],
        record: bool = False,
        provenance: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Check rules against named members in one round trip.

        A member is a subject string or ``{ subject, facts: [{ predicate,
        object, negated? }] }``; given facts are written first as the caller's
        claims. ``record=True`` keeps each decided verdict as a Derivation.
        Returns ``{ ok, rules, disabled, members, factsWritten }``.
        """
        if not rule_uuids:
            raise ValueError("rule_uuids is required")
        if not members:
            raise ValueError("members is required")
        body = _without_nulls({
            "ruleUuids": list(rule_uuids),
            "members": list(members),
            "record": True if record is True else None,
            "provenance": provenance,
        })
        return self._request("POST", f"{self.prototype_api_prefix}/logic-ir/rules/check", json=body)

    def apply_rule(self, rule_uuid: str, domain_limit: Optional[int] = None) -> Dict[str, Any]:
        """Fire one rule over its domain: ``{ ok, rule, domain, fired, skipped, conflicts, complete }``."""
        if not rule_uuid:
            raise ValueError("rule_uuid is required")
        return self._request(
            "POST",
            f"{self.prototype_api_prefix}/logic-ir/rules/{rule_uuid}/apply",
            json=_without_nulls({"domainLimit": domain_limit}),
        )

    def saturate_rules(
        self,
        rule_uuids: Optional[List[str]] = None,
        max_rounds: Optional[int] = None,
        max_facts: Optional[int] = None,
        domain_limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Run the enabled rules (or the named ones) to a fixpoint, within the given bounds."""
        body = _without_nulls({
            "ruleUuids": list(rule_uuids) if rule_uuids is not None else None,
            "maxRounds": max_rounds,
            "maxFacts": max_facts,
            "domainLimit": domain_limit,
        })
        return self._request("POST", f"{self.prototype_api_prefix}/logic-ir/fixpoint", json=body)

    # ===== Logic over the graph for agents (KG-P2) =====

    def bind_pattern(self, pattern: List[Dict[str, Any]], limit: Optional[int] = None, describe: bool = False) -> Dict[str, Any]:
        """Bind a graph pattern. A term is ``"?var"``, a uuid, or ``{"label", "prototype"}`` /
        ``{"prototype"}`` / ``{"value"}`` resolved by structure (ambiguous → 409, nothing guessed).
        ``describe=True`` adds each variable's literal value and each claim's provenance."""
        if not pattern:
            raise ValueError("pattern is required")
        body = _without_nulls({"pattern": list(pattern), "limit": limit, "describe": True if describe else None})
        return self._request("POST", f"{self.prototype_api_prefix}/logic-ir/bind", json=body)

    def close_relation(self, predicate: str, as_: Optional[str] = None, include_alleged: bool = False,
                       max_facts: Optional[int] = None, max_rounds: Optional[int] = None,
                       edge_limit: Optional[int] = None) -> Dict[str, Any]:
        """KA4: transitive closure of one relation; each fact names the claims on its path."""
        if not predicate:
            raise ValueError("predicate is required")
        body = _without_nulls({"predicate": predicate, "as": as_, "includeAlleged": True if include_alleged else None,
                               "maxFacts": max_facts, "maxRounds": max_rounds, "edgeLimit": edge_limit})
        return self._request("POST", f"{self.prototype_api_prefix}/logic-ir/closure", json=body)

    def evaluate_joins(self, rules: List[Dict[str, Any]], include_alleged: bool = False,
                       max_facts: Optional[int] = None, max_rounds: Optional[int] = None,
                       edge_limit: Optional[int] = None) -> Dict[str, Any]:
        """KA4: rules over binary relations with joins (``[{"name", "ir"}]``), run in memory; nothing written."""
        if not rules:
            raise ValueError("rules is required")
        body = _without_nulls({"rules": list(rules), "includeAlleged": True if include_alleged else None,
                               "maxFacts": max_facts, "maxRounds": max_rounds, "edgeLimit": edge_limit})
        return self._request("POST", f"{self.prototype_api_prefix}/logic-ir/joins", json=body)

    def ensure_predicate(self, name: str, create: bool = True) -> Dict[str, Any]:
        """The Predicate concept for ``name`` (created once): ``{uuid, name, created}``."""
        if not name:
            raise ValueError("name is required")
        body = _without_nulls({"name": name, "create": False if create is False else None})
        return self._request("POST", f"{self.prototype_api_prefix}/predicates", json=body)

    def check_membership(self, subject: str, category: str, candidate_threshold: Optional[float] = None) -> Dict[str, Any]:
        """KG12: membership (from the graph) and typicality (a score), kept apart."""
        if not subject or not category:
            raise ValueError("subject and category are required")
        body = _without_nulls({"subject": subject, "category": category, "candidateThreshold": candidate_threshold})
        return self._request("POST", f"{self.prototype_api_prefix}/prototypes/membership", json=body)

    # ===== Events & episodes (KG10 / KG13) =====
    # An event is an action concept plus typed roles, each a concept uuid the
    # graph already has. Roles: agent, patient, beneficiary, instrument,
    # location, threat.

    def record_event(
        self,
        action: str,
        roles: Optional[Dict[str, str]] = None,
        title: Optional[str] = None,
        observed_at: Optional[str] = None,
        episode: Optional[Dict[str, Any]] = None,
        provenance: Optional[Dict[str, Any]] = None,
        private: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Record an event.

        ``episode`` is ``{ uuid }`` to extend one or ``{ title, observedAt,
        source }`` to open one. Returns ``{ ok, event, created, reused,
        lineageKey, episode? }``; a role naming no concept is a 422.
        """
        if not action:
            raise ValueError("action is required")
        body = _without_nulls({
            "action": action,
            "roles": roles,
            "title": title,
            "observedAt": observed_at,
            "episode": episode,
            "provenance": provenance,
            "private": private if isinstance(private, bool) else None,
        })
        return self._request("POST", f"{self.prototype_api_prefix}/events", json=body)

    def find_events(
        self,
        action: Optional[str] = None,
        agent: Optional[str] = None,
        patient: Optional[str] = None,
        beneficiary: Optional[str] = None,
        instrument: Optional[str] = None,
        location: Optional[str] = None,
        threat: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Find events by structure: each role given (a concept uuid) is a constraint.

        Returns ``{ ok, constraints, walked, events, count, complete, limit }``.
        """
        constraints = _without_nulls({
            "action": action,
            "agent": agent,
            "patient": patient,
            "beneficiary": beneficiary,
            "instrument": instrument,
            "location": location,
            "threat": threat,
        })
        if not constraints:
            raise ValueError(
                "find_events needs at least one role constraint "
                "(action, agent, patient, beneficiary, instrument, location, threat)"
            )
        params = _without_nulls({**constraints, "limit": limit})
        return self._request("GET", f"{self.prototype_api_prefix}/events", params=params)

    def get_event(self, uuid: str) -> Dict[str, Any]:
        """One event with its roles, provenance and the episodes that contain it."""
        if not uuid:
            raise ValueError("uuid is required")
        return self._request("GET", f"{self.prototype_api_prefix}/events/{uuid}")

    def get_episode(self, uuid: str) -> Dict[str, Any]:
        """One episode with every event it contains."""
        if not uuid:
            raise ValueError("uuid is required")
        return self._request("GET", f"{self.prototype_api_prefix}/episodes/{uuid}")

    def recall_episodes(
        self,
        pattern: List[Dict[str, Any]],
        event_variable: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Recall the episodes whose events satisfy a structural pattern.

        Each match says why (bindings, derivation steps, fuzzy scores). Returns
        ``{ ok, episodes: [{ episode, matches, ranking }], events, count, complete }``.
        """
        if not pattern:
            raise ValueError("pattern is required")
        body = _without_nulls({"pattern": pattern, "eventVariable": event_variable, "limit": limit})
        return self._request("POST", f"{self.prototype_api_prefix}/episodes/recall", json=body)

    # ===== Procedure runs (verified memory) =====

    def record_procedure_run(
        self,
        procedure_uuid: str,
        ok: bool,
        verified_by: Optional[str] = None,
        failure: Optional[str] = None,
        site: Optional[str] = None,
        evidence: Optional[str] = None,
        version_uuid: Optional[str] = None,
        version: Optional[int] = None,
        held_out: bool = False,
    ) -> Dict[str, Any]:
        """Record one run of a procedure.

        ``verified_by`` names who confirmed the outcome: ``"page" | "person" |
        "tool" | "oracle" | "email" | "api"`` (only person, oracle, email and
        api count as independent in the evaluation record). ``version_uuid``
        or ``version`` names the procedure version that ran (default: the
        current one); ``held_out=True`` marks a held-out validation case. The
        server applies the lifecycle (draft -> verified -> retired / revived)
        and the IR-S1 ``state`` (candidate -> validated -> promoted | retired).
        Returns ``{ ok, run, status, state, previousStatus, retired, revived,
        procedure }``. Only the procedure's owner may record its runs (403
        otherwise); a version not of this procedure is a 400.
        """
        if not procedure_uuid:
            raise ValueError("procedure_uuid is required")
        if not isinstance(ok, bool):
            raise ValueError("ok (boolean) is required")
        if version is not None and (isinstance(version, bool) or not isinstance(version, int) or version < 1):
            raise ValueError("version must be a positive integer")
        body = _without_nulls({
            "ok": ok,
            "verifiedBy": verified_by,
            "failure": failure,
            "site": site,
            "evidence": evidence,
            "versionUuid": version_uuid,
            "version": version,
            "heldOut": True if held_out is True else None,
        })
        return self._request("POST", f"{self.prototype_api_prefix}/procedures/{procedure_uuid}/runs", json=body)

    def list_procedure_runs(self, procedure_uuid: str) -> Dict[str, Any]:
        """A procedure's runs (oldest first), lifecycle ``status``, IR-S1 ``state``
        and ``currentVersion`` ``{ uuid, version, state, stateBasis }`` (None
        when the procedure has no versions).

        The server has no separate runs route; this reads ``GET /procedures/:uuid``
        and returns ``{ procedureId, status, state, currentVersion, lifecycle, runs }``.
        """
        if not procedure_uuid:
            raise ValueError("procedure_uuid is required")
        r = self._request("GET", f"{self.prototype_api_prefix}/procedures/{procedure_uuid}")
        lifecycle = r.get("lifecycle")
        current = (lifecycle or {}).get("currentVersion") if isinstance(lifecycle, dict) else None
        return {
            "procedureId": r.get("id") or procedure_uuid,
            "status": r.get("status"),
            "state": r.get("state"),
            "currentVersion": current or r.get("currentVersion"),
            "lifecycle": lifecycle,
            "runs": list(r.get("runs") or []),
        }

    def get_procedure_evaluation(self, procedure_uuid: str) -> Dict[str, Any]:
        """The procedure's evaluation record, computed on read.

        Per version (newest first): ``stats`` (runs, verifiedSuccesses,
        failures, unverified, verifiedBy, lastRunAt, successRate, Wilson 95%
        ``interval``), ``regression`` against the previous version (one-sided
        Fisher exact, flagged at p < 0.05; ``tested: False`` when either side
        has no runs), ``state`` and ``stateBasis``. Returns ``{ ok,
        procedureId, procedure, versions, regression, unattributed, method }``.
        """
        if not procedure_uuid:
            raise ValueError("procedure_uuid is required")
        return self._request("GET", f"{self.prototype_api_prefix}/procedures/{procedure_uuid}/evaluation")

    def search_verified_procedures(
        self,
        goal: Optional[str] = None,
        site: Optional[str] = None,
        include: Optional[Union[str, List[str]]] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Verified procedural recall: semantic on ``goal``, exact on ``site``.

        Verified procedures only unless ``include`` names ``"drafts"``,
        ``"retired"`` or ``"all"`` (or a list). Each result carries ``status``,
        ``state`` and, when the procedure has versions, ``currentVersion``.
        Returns ``{ ok, query, results, excluded, scanned }``. Distinct from
        ``search_procedures`` (POST, by meaning only).
        """
        if not goal and not site:
            raise ValueError("goal or site is required")
        inc = ",".join(include) if isinstance(include, (list, tuple)) else include
        params = _without_nulls({"goal": goal, "site": site, "include": inc, "limit": limit})
        return self._request("GET", f"{self.prototype_api_prefix}/procedures/search", params=params)

    # ===== Procedure versions (capability model) =====
    # Every version read carries ``state`` (candidate | validated | promoted |
    # retired), computed from the runs of that version, with ``stateBasis``
    # ("runs" | "superseded" | "status"), ``statusAsState``, ``lifecycle`` and
    # ``statusDeprecated: True``. The hand-set ``status`` (draft, dogfood,
    # tested, validated, stable, degraded, deprecated) is still returned and
    # writable; it now decides only a retirement by hand (degraded/deprecated).

    def create_procedure_version(
        self,
        procedure_uuid: str,
        status: Optional[str] = None,
        implementation: Optional[Dict[str, Any]] = None,
        requires: Optional[List[str]] = None,
        provides: Optional[List[str]] = None,
        provenance: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Publish the next version of a procedure: ``{ ok, procedureVersion, capabilityResolution }``."""
        if not procedure_uuid:
            raise ValueError("procedure_uuid is required")
        body = _without_nulls({
            "status": status,
            "implementation": implementation,
            "requires": requires,
            "provides": provides,
            "provenance": provenance,
        })
        return self._request("POST", f"{self.prototype_api_prefix}/procedures/{procedure_uuid}/versions", json=body)

    def list_procedure_versions(self, procedure_uuid: str) -> Dict[str, Any]:
        """Every version, latest first, each with its ``state``: ``{ ok, procedureId, count, latest, versions, unattributedRuns }``."""
        if not procedure_uuid:
            raise ValueError("procedure_uuid is required")
        return self._request("GET", f"{self.prototype_api_prefix}/procedures/{procedure_uuid}/versions")

    def get_procedure_version_by_number(self, procedure_uuid: str, version: int) -> Dict[str, Any]:
        """One version by its number: ``{ ok, procedureVersion }``."""
        if not procedure_uuid:
            raise ValueError("procedure_uuid is required")
        if isinstance(version, bool) or not isinstance(version, int) or version < 1:
            raise ValueError("version must be a positive integer")
        return self._request("GET", f"{self.prototype_api_prefix}/procedures/{procedure_uuid}/versions/{version}")

    def get_procedure_version(self, version_uuid: str) -> Dict[str, Any]:
        """One version by its uuid, with its status history: ``{ ok, procedureVersion }``."""
        if not version_uuid:
            raise ValueError("version_uuid is required")
        return self._request("GET", f"{self.prototype_api_prefix}/procedure-versions/{version_uuid}")

    def transition_procedure_version(
        self,
        version_uuid: str,
        status: str,
        reason: Optional[str] = None,
        provenance: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Move a version to another hand-set status, recorded in its history.

        The status is deprecated: ``state`` is computed from runs, and only
        degraded or deprecated retire a version by hand.

        Returns ``{ ok, procedureVersion, transition }``; 409 ``status_terminal``
        out of deprecated, 409 ``status_unchanged`` for the same status.
        """
        if not version_uuid:
            raise ValueError("version_uuid is required")
        if not status:
            raise ValueError("status is required")
        body = _without_nulls({"status": status, "reason": reason, "provenance": provenance})
        return self._request("POST", f"{self.prototype_api_prefix}/procedure-versions/{version_uuid}/status", json=body)

    # ===== Verified facts =====
    # Facts with status ``candidate | confirmed`` and provenance. Reads return
    # confirmed facts unless ``include`` asks for more; a correction keeps the
    # old fact as ``corrected``. Distinct from the legacy ``store_fact``.

    def add_fact(
        self,
        subject: str,
        predicate: str,
        obj: Any,
        status: str = "candidate",
        provenance: Optional[Dict[str, Any]] = None,
        visibility: Optional[str] = None,
        confidence: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Add a fact, a ``candidate`` unless told otherwise: ``{ ok, fact }``."""
        if not subject:
            raise ValueError("subject is required")
        if not predicate:
            raise ValueError("predicate is required")
        if obj is None or obj == "":
            raise ValueError("obj is required")
        body = _without_nulls({
            "subject": subject,
            "predicate": predicate,
            "object": obj,
            "status": status,
            "provenance": provenance,
            "visibility": visibility,
            "confidence": confidence,
        })
        return self._request("POST", f"{self.prototype_api_prefix}/facts", json=body)

    def list_facts(
        self,
        subject: Optional[str] = None,
        predicate: Optional[str] = None,
        include: Optional[Union[str, List[str]]] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Facts about a subject (or, with no subject, the caller's own).

        ``include``: ``"candidates" | "corrected" | "disputed" | "all"`` or a
        list. Returns ``{ ok, facts, total, truncated, include }``.
        """
        inc = ",".join(include) if isinstance(include, (list, tuple)) else include
        params = _without_nulls({"subject": subject, "predicate": predicate, "include": inc, "limit": limit})
        return self._request("GET", f"{self.prototype_api_prefix}/facts", params=params)

    def get_fact(self, fact_id: str) -> Dict[str, Any]:
        """One fact with its provenance and history: ``{ ok, fact }``."""
        if not fact_id:
            raise ValueError("fact_id is required")
        return self._request("GET", f"{self.prototype_api_prefix}/facts/{fact_id}")

    def confirm_fact(
        self,
        fact_id: str,
        by: Optional[str] = None,
        provenance: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """A candidate fact becomes confirmed (idempotent on a confirmed one).

        409 when the fact was corrected (confirm its ``replacedBy`` instead);
        403 when the caller is not its owner.
        """
        if not fact_id:
            raise ValueError("fact_id is required")
        body = _without_nulls({"by": by, "provenance": provenance})
        return self._request("POST", f"{self.prototype_api_prefix}/facts/{fact_id}/confirm", json=body)

    def correct_fact(
        self,
        fact_id: str,
        obj: Any,
        provenance: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Write a corrected value as a new confirmed fact; the old one is kept as ``corrected``."""
        if not fact_id:
            raise ValueError("fact_id is required")
        if obj is None or obj == "":
            raise ValueError("obj is required")
        body = _without_nulls({"object": obj, "provenance": provenance})
        return self._request("POST", f"{self.prototype_api_prefix}/facts/{fact_id}/correct", json=body)

    # ===== Knowledge packs (PK1; needs a server newer than 0.2.59) =====

    def export_pack(
        self,
        name: str,
        version: str,
        license: str,
        prototypes: Optional[List[str]] = None,
        procedures: Optional[List[str]] = None,
        facts: Optional[List[str]] = None,
        description: Optional[str] = None,
        source: Optional[Dict[str, Any]] = None,
        include_private: bool = False,
    ) -> Dict[str, Any]:
        """Export a chosen set as one ``ksg-pack/1``: ``{ok, pack, summary}``.

        ``prototypes`` are uuids or names; ``procedures`` and ``facts`` are
        ids. ``name``, ``version`` (semver) and ``license`` are required;
        there is no default license. Read-only.

        An item you may not read answers as a missing one (404) and fails the
        whole export. Your own private items are held back: the server answers
        400 and lists them unless ``include_private=True``. That is an
        explicit opt-in, off by default, and only the literal ``True`` turns
        it on; use it only when the owner has said those items may leave their
        scope. Secret-shaped values are redacted (``summary["redactions"]``);
        read a pack before you publish it.
        """
        if not name:
            raise ValueError("name is required")
        if not version:
            raise ValueError("version is required (semver, for example 1.0.0)")
        if not license:
            raise ValueError("license is required (for example CC-BY-4.0)")
        select = _without_nulls({"prototypes": prototypes, "procedures": procedures, "facts": facts})
        if not any(isinstance(items, list) and items for items in select.values()):
            raise ValueError("name at least one prototype, procedure or fact to export")
        body = _without_nulls({
            "name": name,
            "version": version,
            "license": license,
            "description": description,
            "source": source,
        })
        body["select"] = select
        if include_private is True:
            body["includePrivate"] = True
        return self._request("POST", "/api2.0/packs/export", json=body)

    def install_pack(self, pack: Any, dry_run: bool = False) -> Dict[str, Any]:
        """Install a ``ksg-pack/1`` (a dict, or the file's JSON text) into the caller's own scope.

        Needs an owner token. ``dry_run=True`` returns the plan and writes
        nothing; run it first.

        A pack grants no trust. Installed procedures are your private
        candidates with no runs: do not recall them as trusted until a
        verified run is recorded. Installed facts are third-party candidates
        that keep what the pack stated under ``provenance``; only
        ``confirm_fact`` makes one confirmed. The same pack again changes
        nothing; a newer version supersedes what it replaces and deletes
        nothing; the same version with other contents, or an older version,
        is 409.
        """
        body = pack
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except ValueError:
                body = None
        if not isinstance(body, dict) or not body:
            raise ValueError("pack is required: a ksg-pack/1 dict or its JSON text")
        payload: Dict[str, Any] = {"pack": body}
        if dry_run is True:
            payload["dryRun"] = True
        return self._request("POST", "/api2.0/packs/install", json=payload)

    # camelCase aliases: the JS client exposes both spellings, and agents port
    # call sites between the two SDKs. Parity is cheaper than a translation table.
    evaluatePrototypeMatch = evaluate_prototype_match
    evaluatePrototypeMatchList = evaluate_prototype_match_list
    castObject = cast_object
    evaluateLogicInference = evaluate_logic_inference
    evaluateLogicIr = evaluate_logic_ir
    explainDerivation = explain_derivation
    listDerivations = list_derivations

    # ===== Node with Document Methods =====

    def create_node_with_document(
        self,
        label: str,
        summary: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        associations: Optional[List[Dict[str, Any]]] = None,
        prototype_uuid: Optional[str] = None,
        private: bool = False,
        security_class: Optional[str] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None
    ) -> str:
        """Create a node with document metadata and tags.

        `private` exists because this wrapper previously had no way to express
        privacy, so everything written through it landed in the anonymously
        readable commons. Pass private=True for owner-scoped data; the owner
        comes from default_owner_user_id (X-KSG-Owner) unless overridden here.
        The server refuses a private write it cannot attribute.
        """
        data = {
            "label": label,
            "summary": summary,
            "tags": tags or [],
            "metadata": metadata or {},
            "associations": associations or [],
            "prototypeUuid": prototype_uuid
        }
        if private or security_class == "private":
            data["private"] = True
        if security_class:
            data["securityClass"] = security_class
        if owner_user_id:
            data["ownerUserId"] = owner_user_id
        if agent_session_id:
            data["agentSessionId"] = agent_session_id
        result = self._request("POST", "/api/nodes", json=data)
        return result["uuid"]

    def update_node_embedding(self, uuid: str) -> None:
        """Update/recompute node embedding"""
        self._request("POST", f"/api/nodes/{uuid}/embedding")

    # ===== ORM Methods =====

    def register_prototype(
        self,
        prototype_name: str,
        options: Optional[Dict[str, Any]] = None
    ) -> None:
        """Register a prototype for ORM use"""
        data = {
            "prototypeName": prototype_name,
            "options": options or {}
        }
        self._request("POST", "/api/orm/register", json=data)

    def create_instance(
        self,
        prototype_name: str,
        properties: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a concept instance via ORM"""
        data = {"properties": properties}
        return self._request(
            "POST",
            f"/api/orm/{prototype_name}/create",
            json=data
        )

    def get_instance(
        self,
        prototype_name: str,
        uuid: str
    ) -> Dict[str, Any]:
        """Get a concept instance via ORM"""
        return self._request(
            "GET",
            f"/api/orm/{prototype_name}/{uuid}"
        )

    # ===== Health Check =====

    def health_check(self) -> Dict[str, Any]:
        """Check API health"""
        return self._request("GET", "/health")

    # ===== Assertions (v0.2.0) =====

    def create_assertion(
        self,
        subject: str,
        predicate: str,
        obj: Any,
        truth: float = 1.0,
        source: str = "user",
        security_class: Optional[str] = None,
        scope: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create an assertion.

        ``security_class`` (``"public"`` | ``"private"``; ``scope`` is an alias)
        is sent as ``securityClass`` only when given, so the body of a call that
        leaves it out is unchanged. A private claim is stored under the caller's
        owner identity and read back only by that owner; the server validates
        the value.
        """
        data = {
            "subject": subject,
            "predicate": predicate,
            "object": obj,
            "truth": truth,
            "source": source
        }
        data.update(_security_class_field(security_class, scope))
        return self._request("POST", "/api/assertions", json=data)

    def assert_proposition(
        self,
        subject: Optional[str] = None,
        predicate: Optional[str] = None,
        value: Any = _UNSET,
        obj: Any = _UNSET,
        subject_uuid: Optional[str] = None,
        subject_prototype: Optional[str] = None,
        predicate_uuid: Optional[str] = None,
        object_uuid: Optional[str] = None,
        object_prototype: Optional[str] = None,
        value_prototype: Optional[str] = None,
        truth: Optional[float] = None,
        source: Optional[str] = None,
        provenance: Optional[Dict[str, Any]] = None,
        replace: bool = False,
        security_class: Optional[str] = None,
        scope: Optional[str] = None,
    ) -> Dict[str, Any]:
        """KG-P1: write a claim as a proposition of three ConceptObject uuids.

        Each term may be a uuid or a surface form. The subject is found by
        structure (label + prototype + scope) or created as an instance of
        ``subject_prototype``; the predicate is a ``Predicate`` concept; a
        literal ``value`` becomes a value node (EmailAddress, PhoneNumber, ...
        under Value); ``obj`` + ``object_prototype`` resolves an entity. Two
        instances bearing one label raise a 409 (candidates in the error body)
        and nothing is written. ``replace=True`` supersedes the live claims for
        this subject and predicate; nothing is deleted.
        """
        data: Dict[str, Any] = {
            "subject": subject,
            "subjectUuid": subject_uuid,
            "subjectPrototype": subject_prototype,
            "predicate": predicate,
            "predicateUuid": predicate_uuid,
            "objectUuid": object_uuid,
            "objectPrototype": object_prototype,
            "valuePrototype": value_prototype,
            "truth": truth,
            "source": source,
            "provenance": provenance,
            "replace": True if replace else None,
        }
        if value is not _UNSET:
            data["value"] = value
        if obj is not _UNSET:
            data["object"] = obj
        data = _without_nulls(data)
        data.update(_security_class_field(security_class, scope))
        return self._request("POST", "/api2.0/propositions", json=data)

    def get_assertions(
        self,
        subject: Optional[str] = None,
        predicate: Optional[str] = None,
        obj: Optional[Any] = None,
        uuid: Optional[str] = None,
        why: bool = False,
    ) -> List[Dict[str, Any]]:
        """Get assertions with optional filters, or one claim by ``uuid``.

        ``why=True`` (WHY1) gives each claim a ``why`` block: sources with tier
        and speaker, version chain, contested peers, model or Logic IR rule,
        status with the reason. Another owner's private claim is simply absent.
        """
        params = {}
        if subject:
            params["subject"] = subject
        if predicate:
            params["predicate"] = predicate
        if obj is not None:
            params["object"] = obj
        if uuid:
            params["uuid"] = uuid
        if why:
            params["why"] = "true"
        result = self._request("GET", "/api/assertions", params=params)
        return result["assertions"]

    def explain_claim(self, claim_uuid: str) -> Optional[Dict[str, Any]]:
        """WHY1 / KSG-1: "why do we believe this?" for one claim.

        Returns the claim with its ``why`` block (``sources``, ``versions``,
        ``contested``, ``inference``, ``status``) or None when there is no such
        claim the caller may read.
        """
        result = self._request("GET", "/api2.0/assertions", params={"uuid": claim_uuid, "why": "true"})
        rows = result.get("assertions") if isinstance(result, dict) else None
        return rows[0] if rows else None

    def list_contradictions(
        self,
        visibility: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """WHY1 / KSG-2: the contradiction inbox.

        Open contested sets the caller may read (their own private ones and
        the public ones), each side with its source and tier, highest tier
        first: ``{contradictions, total, truncated}``. Resolve one with
        ``confirm_fact(side_uuid)`` or ``correct_fact(side_uuid, obj=...)``;
        a new version supersedes every side, nothing is deleted.
        """
        params: Dict[str, Any] = {"contested": "true"}
        if visibility:
            params["visibility"] = visibility
        if limit is not None:
            params["limit"] = limit
        return self._request("GET", "/api2.0/assertions", params=params)

    def vote_assertion(
        self,
        assertion_id: str,
        delta: float = 1.0
    ) -> Dict[str, Any]:
        """Adjust vote score for an assertion (v0.2.1)"""
        result = self._request(
            "POST",
            f"/api/assertions/{assertion_id}/vote",
            json={"delta": delta}
        )
        return result["assertion"]

    def reinforce_assertion(
        self,
        subject: str,
        predicate: str,
        obj: Any,
        speaker: Optional[str] = None,
        delta: Optional[float] = None,
        truth: Optional[float] = None,
        source: str = "user",
        provenance: Optional[Dict[str, Any]] = None,
        security_class: Optional[str] = None,
        scope: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Same claim from another speaker → strengthen belief.

        ``security_class`` / ``scope`` as on ``create_assertion``: a private
        reinforce bumps the caller's own private claim, never another owner's.
        """
        data: Dict[str, Any] = {
            "subject": subject,
            "predicate": predicate,
            "object": obj,
            "source": source,
        }
        if speaker is not None:
            data["speaker"] = speaker
        if delta is not None:
            data["delta"] = delta
        if truth is not None:
            data["truth"] = truth
        if provenance is not None:
            data["provenance"] = provenance
        data.update(_security_class_field(security_class, scope))
        return self._request("POST", "/api/assertions/reinforce", json=data)

    def contradict_assertion(
        self,
        subject: str,
        predicate: str,
        obj: Any,
        speaker: Optional[str] = None,
        truth: Optional[float] = None,
        source: str = "user",
        provenance: Optional[Dict[str, Any]] = None,
        against_assertion_id: Optional[str] = None,
        security_class: Optional[str] = None,
        scope: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Competing claim for same subject/predicate.

        ``security_class`` / ``scope`` as on ``create_assertion``.
        """
        data: Dict[str, Any] = {
            "subject": subject,
            "predicate": predicate,
            "object": obj,
            "source": source,
        }
        if speaker is not None:
            data["speaker"] = speaker
        if truth is not None:
            data["truth"] = truth
        if provenance is not None:
            data["provenance"] = provenance
        if against_assertion_id is not None:
            data["againstAssertionId"] = against_assertion_id
        data.update(_security_class_field(security_class, scope))
        return self._request("POST", "/api/assertions/contradict", json=data)

    def retract_assertion(
        self,
        assertion_id: str,
        speaker: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Soft-delete an assertion from belief resolution."""
        return self._request(
            "POST",
            f"/api/assertions/{assertion_id}/retract",
            json={"speaker": speaker, "reason": reason},
        )

    def get_beliefs(
        self,
        entity_id: str,
        predicate: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Live belief snapshot (resolved values + alternatives + speakers)."""
        params = {}
        if predicate:
            params["predicate"] = predicate
        return self._request("GET", f"/api/entities/{entity_id}/beliefs", params=params)

    def get_snapshot(self, entity_id: str) -> Dict[str, Any]:
        """Get resolved values for an entity"""
        result = self._request("GET", f"/api/entities/{entity_id}/snapshot")
        return result["snapshot"]

    def get_evidence(
        self,
        entity_id: str,
        predicate: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all competing assertions for an entity"""
        params = {}
        if predicate:
            params["predicate"] = predicate
        result = self._request(
            "GET",
            f"/api/entities/{entity_id}/evidence",
            params=params
        )
        return result["evidence"]

    def explain_entity(
        self,
        entity_id: str,
        predicate: Optional[str] = None
    ) -> Dict[str, Any]:
        """Explain assertion resolution for an entity (v0.2.1)"""
        params = {}
        if predicate:
            params["predicate"] = predicate
        return self._request(
            "GET",
            f"/api/entities/{entity_id}/explain",
            params=params
        )

    def get_entity_properties(
        self,
        entity_id: str,
        predicate: Optional[str] = None,
        entity_api_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Ranked property map (winner + contested claim stack).
        Canonical path ``/api2.0/entities/:id/properties`` with ``/api`` alias.
        """
        prefix = entity_api_prefix or self.prototype_api_prefix or "/api2.0"
        params: Dict[str, Any] = {}
        if predicate:
            params["predicate"] = predicate
        return self._request(
            "GET",
            f"{prefix}/entities/{entity_id}/properties",
            params=params,
        )

    def get_entity_types(
        self,
        entity_id: str,
        top_k: int = 5,
        threshold: float = 0,
        persist: bool = False,
        persist_top_k: int = 1,
        entity_api_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Ranked prototype/type matches (fuzzy duck typing)."""
        prefix = entity_api_prefix or self.prototype_api_prefix or "/api2.0"
        params: Dict[str, Any] = {"topK": top_k, "threshold": threshold}
        if persist:
            params["persist"] = "true"
            params["persistTopK"] = persist_top_k
        return self._request(
            "GET",
            f"{prefix}/entities/{entity_id}/types",
            params=params,
        )

    def hydrate(
        self,
        entity_id: str,
        top_k: int = 5,
        threshold: float = 0,
        entity_api_prefix: Optional[str] = None,
    ) -> KSGObject:
        """
        Hydrate an entity as a duck-typed :class:`KSGObject` in one round trip.

        Mirrors the JS ``client.hydrate``. Never persists prototype membership —
        pass ``persist=True`` to :meth:`get_entity_types` when you mean to stamp
        it.
        """
        prefix = entity_api_prefix or self.prototype_api_prefix or "/api2.0"
        body = self._request(
            "GET",
            f"{prefix}/entities/{entity_id}/hydrate",
            params={"topK": top_k, "threshold": threshold},
        )
        payload = dict(body or {})
        payload.setdefault("uuid", entity_id)
        return KSGObject(payload)

    def get_entity_snapshot(
        self,
        entity_id: str,
        predicate: Optional[str] = None,
        entity_api_prefix: Optional[str] = None,
        top_k: int = 5,
    ) -> EntityProxy:
        """EntityProxy over get_entity_properties (``.middleName`` → winner)."""
        body = self.get_entity_properties(
            entity_id,
            predicate=predicate,
            entity_api_prefix=entity_api_prefix,
        )
        types: List[Dict[str, Any]] = []
        try:
            typed = self.get_entity_types(
                entity_id,
                top_k=top_k,
                entity_api_prefix=entity_api_prefix,
            )
            types = typed.get("types") or typed.get("matched") or []
        except Exception:
            pass
        body = dict(body)
        body["types"] = types
        return EntityProxy(body, client=self)

    def entity(
        self,
        entity_id: str,
        predicate: Optional[str] = None,
        entity_api_prefix: Optional[str] = None,
    ) -> EntityProxy:
        """Alias for get_entity_snapshot."""
        return self.get_entity_snapshot(
            entity_id,
            predicate=predicate,
            entity_api_prefix=entity_api_prefix,
        )

    # ===== Verification / Hallucination Detection =====

    def store_fact(
        self,
        subject: str,
        predicate: str,
        obj: str,
        status: str = "verified",
        confidence: float = 1.0,
        source: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Store a verified fact for hallucination detection.
        
        Args:
            subject: Subject entity (e.g., "Bell")
            predicate: Relation (e.g., "invented")
            obj: Object entity (e.g., "telephone")
            status: verified|refuted|unverified
            confidence: Confidence [0,1]
            source: Provenance source info
        
        Returns:
            Stored fact with UUID
        """
        data = {
            "subject": subject,
            "predicate": predicate,
            "object": obj,
            "status": status,
            "confidence": confidence,
            "source": source
        }
        return self._request("POST", "/api/facts", json=data)

    def store_facts_bulk(
        self,
        facts: List[tuple]
    ) -> Dict[str, Any]:
        """
        Store multiple facts at once.
        
        Args:
            facts: List of (subject, predicate, object) tuples
        
        Returns:
            Result with stored count
        """
        fact_dicts = [
            {"subject": f[0], "predicate": f[1], "object": f[2]}
            for f in facts
        ]
        return self._request("POST", "/api/facts/bulk", json={"facts": fact_dicts})

    def verify(
        self,
        claim: str,
        threshold: float = 0.7
    ) -> Dict[str, Any]:
        """
        Verify a claim against stored facts.
        
        Args:
            claim: Natural language claim to verify
            threshold: Similarity threshold [0,1]
        
        Returns:
            Verification result with status, confidence, reason
        """
        data = {
            "claim": claim,
            "threshold": threshold
        }
        result = self._request("POST", "/api/verify", json=data)
        result["verified"] = result.get("status") == "verified"
        return result

    def get_fact_stats(self) -> Dict[str, Any]:
        """Get statistics about stored facts"""
        stats = self._request("GET", "/api/facts/stats")
        stats["totalFacts"] = stats.get("total", stats.get("totalFacts", 0))
        return stats

    # Alias for scp_alg_test compatibility
    def add_verified_fact(
        self,
        subject: str,
        predicate: str,
        obj: str,
        sources: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Alias for store_fact (scp_alg_test compatible).
        
        Args:
            subject: Subject entity
            predicate: Relation
            obj: Object entity
            sources: List of source dicts with url, trust_score
        """
        source = sources[0] if sources else None
        confidence = source.get("trust_score", 1.0) if source else 1.0
        return self.store_fact(
            subject=subject,
            predicate=predicate,
            obj=obj,
            status="verified",
            confidence=confidence,
            source=source
        )

    def check(self, claim: str) -> Dict[str, Any]:
        """
        Alias for verify (scp_alg_test compatible).
        
        Args:
            claim: Natural language claim
        
        Returns:
            Verification result
        """
        return self.verify(claim)

    # ===== Topics (v0.2.2) =====

    def create_topic(
        self,
        label: Optional[str] = None,
        phrase: Optional[str] = None,
        summary: str = "",
        aliases: Optional[List[str]] = None,
        kind: str = "topic",
        language: Optional[str] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create (or resolve) a semantic topic"""
        data = {
            "label": label,
            "phrase": phrase,
            "summary": summary,
            "aliases": aliases or [],
            "kind": kind,
            "provenance": provenance
        }
        if language is not None:
            data["language"] = language
        body = self._request("POST", f"{self.topic_api_prefix}/topics", json=data)
        topic = body.get("topic") or {}
        return {**body, **topic}

    def get_topic(self, uuid: str) -> Dict[str, Any]:
        """Get a topic by UUID (unwraps the topic payload)"""
        result = self._request("GET", f"{self.topic_api_prefix}/topics/{uuid}")
        return result["topic"]

    def resolve_topic_tag(
        self,
        tag: Optional[str] = None,
        phrase: Optional[str] = None,
        language: Optional[str] = None,
        top_k: int = 10,
        create_if_missing: bool = False
    ) -> Dict[str, Any]:
        """Resolve a phrase/tag to candidate topics"""
        data = {
            "tag": tag,
            "phrase": phrase,
            "topK": top_k,
            "createIfMissing": create_if_missing
        }
        if language is not None:
            data["language"] = language
        return self._request("POST", f"{self.topic_api_prefix}/topics/resolve-tag", json=data)

    # ===== Object Categories (v0.2.2) =====

    def create_object_category(
        self,
        name: str,
        description: str = "",
        context: str = "object-category",
        parent_prototype_uuid: Optional[str] = None,
        parent_category_name: Optional[str] = None,
        properties: Optional[List[Dict[str, Any]]] = None,
        source: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create or resolve an object category prototype"""
        data = {
            "name": name,
            "description": description,
            "context": context,
            "parentPrototypeUuid": parent_prototype_uuid,
            "parentCategoryName": parent_category_name,
            "properties": properties or [],
            "source": source
        }
        return self._request("POST", "/api/object-categories", json=data)

    def upsert_object_category(
        self,
        name: str,
        description: str = "",
        context: str = "object-category",
        parent_prototype_uuid: Optional[str] = None,
        parent_category_name: Optional[str] = None,
        properties: Optional[List[Dict[str, Any]]] = None,
        source: Optional[str] = None,
        category_lineage_key: Optional[str] = None,
        hard_constraints: Optional[List[Any]] = None,
        soft_constraints: Optional[List[Any]] = None,
        min_score: Optional[float] = None,
        decision_policy: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new versioned object category"""
        data = {
            "name": name,
            "description": description,
            "context": context,
            "parentPrototypeUuid": parent_prototype_uuid,
            "parentCategoryName": parent_category_name,
            "properties": properties or [],
            "source": source,
            "categoryLineageKey": category_lineage_key,
            "hardConstraints": hard_constraints,
            "softConstraints": soft_constraints,
            "minScore": min_score,
            "decisionPolicy": decision_policy,
        }
        return self._request("POST", "/api/object-categories/upsert", json=data)

    def get_object_category(self, uuid: str) -> Dict[str, Any]:
        """Get an object category by UUID"""
        body = self._request("GET", f"/api/object-categories/{uuid}")
        category = body.get("category") or {}
        body["categoryPrototypeUuid"] = body.get("categoryPrototypeUuid") or category.get("uuid") or uuid
        return body

    def list_object_categories(self) -> List[Dict[str, Any]]:
        """List object categories with their object counts."""
        result = self._request("GET", "/api/object-categories")
        return result.get("categories", [])

    # ===== Objects (v0.2.2) =====

    def upsert_object(
        self,
        title: str,
        category_prototype_uuid: Optional[str] = None,
        category_name: Optional[str] = None,
        parent_category_name: Optional[str] = None,
        summary: str = "",
        tags: Optional[List[str]] = None,
        properties: Optional[List[Dict[str, Any]]] = None,
        previous_object_uuid: Optional[str] = None,
        object_lineage_key: Optional[str] = None,
        provenance: Optional[Dict[str, Any]] = None,
        knowledge_kind: str = "personal",
        sensitivity: str = "normal",
        privacy_override: Optional[Any] = None,
        private: Optional[bool] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Upsert a schema-backed object entity (new version)"""
        data = {
            "title": title,
            "categoryPrototypeUuid": category_prototype_uuid,
            "categoryName": category_name,
            "parentCategoryName": parent_category_name,
            "summary": summary,
            "tags": tags or [],
            "properties": properties or [],
            "previousObjectUuid": previous_object_uuid,
            "objectLineageKey": object_lineage_key,
            "provenance": provenance,
            "knowledgeKind": knowledge_kind,
            "sensitivity": sensitivity,
            "privacyOverride": privacy_override,
            "ownerUserId": owner_user_id,
            "agentSessionId": agent_session_id
        }
        if private is not None:
            data["private"] = private
        return self._request("POST", "/api/objects/upsert", json=data)

    def get_object(
        self,
        uuid: str,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        match_prototypes: bool = False,
        prototype_revision_uuid: Optional[str] = None,
        prototype_revision_uuids: Optional[Any] = None,
        infer: bool = False
    ) -> Dict[str, Any]:
        """Get an object entity by UUID. match_prototypes lazily evaluates match contracts."""
        params = {}
        if owner_user_id:
            params["ownerUserId"] = owner_user_id
        if agent_session_id:
            params["agentSessionId"] = agent_session_id
        if match_prototypes:
            params["matchPrototypes"] = True
        if prototype_revision_uuid:
            params["prototypeRevisionUuid"] = prototype_revision_uuid
        if prototype_revision_uuids:
            if isinstance(prototype_revision_uuids, (list, tuple)):
                params["prototypeRevisionUuids"] = ",".join(str(item) for item in prototype_revision_uuids)
            else:
                params["prototypeRevisionUuids"] = str(prototype_revision_uuids)
        if infer:
            params["infer"] = True
        return self._request("GET", f"/api/objects/{uuid}", params=params)

    def list_memory_roles(
        self, memory_api_prefix: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Role catalog for typed memory (mandate / schedule / rule / procedureDag)."""
        prefix = memory_api_prefix or self.prototype_api_prefix or "/api2.0"
        result = self._request("GET", f"{prefix}/memory/roles")
        return result.get("roles", [])

    def instantiate_memory(
        self,
        role: str,
        title: str,
        category_prototype_uuid: Optional[str] = None,
        category_name: Optional[str] = None,
        parent_category_name: Optional[str] = None,
        summary: str = "",
        tags: Optional[List[str]] = None,
        properties: Optional[List[Dict[str, Any]]] = None,
        previous_object_uuid: Optional[str] = None,
        object_lineage_key: Optional[str] = None,
        provenance: Optional[Dict[str, Any]] = None,
        knowledge_kind: str = "personal",
        sensitivity: str = "normal",
        privacy_override: Optional[Any] = None,
        private: Optional[bool] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        memory_api_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Role-typed create — same write path as upsert_object, plus claims."""
        prefix = memory_api_prefix or self.prototype_api_prefix or "/api2.0"
        data: Dict[str, Any] = {
            "role": role,
            "title": title,
            "categoryPrototypeUuid": category_prototype_uuid,
            "categoryName": category_name,
            "parentCategoryName": parent_category_name,
            "summary": summary,
            "tags": tags or [],
            "properties": properties or [],
            "previousObjectUuid": previous_object_uuid,
            "objectLineageKey": object_lineage_key,
            "provenance": provenance,
            "knowledgeKind": knowledge_kind,
            "sensitivity": sensitivity,
            "privacyOverride": privacy_override,
        }
        if private is not None:
            data["private"] = private
        if owner_user_id is not None:
            data["ownerUserId"] = owner_user_id
        if agent_session_id is not None:
            data["agentSessionId"] = agent_session_id
        return self._request(
            "POST",
            f"{prefix}/memory/instantiate",
            json=data,
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )

    def get_memory_object(
        self,
        uuid: str,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        memory_api_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Object snapshot + assertion claims + prototype lineage."""
        prefix = memory_api_prefix or self.prototype_api_prefix or "/api2.0"
        params: Dict[str, Any] = {}
        if owner_user_id or self.default_owner_user_id:
            params["ownerUserId"] = owner_user_id or self.default_owner_user_id
        if agent_session_id or self.default_agent_session_id:
            params["agentSessionId"] = agent_session_id or self.default_agent_session_id
        return self._request(
            "GET",
            f"{prefix}/memory/{uuid}",
            params=params or None,
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )

    def list_objects(
        self,
        category: Optional[str] = None,
        limit: int = 200,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List object entities, optionally filtered to one category.

        The server returns public objects plus the caller's own private ones,
        so identity matters here even for a read.
        """
        params: Dict[str, Any] = {"limit": limit}
        if category:
            params["category"] = category
        result = self._request(
            "GET",
            "/api/objects",
            params=params,
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )
        return result.get("objects", [])

    def resolve_object(
        self,
        object_lineage_key: Optional[str] = None,
        category_prototype_uuid: Optional[str] = None,
        title: Optional[str] = None,
        private: bool = False,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        evidence: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Resolve the latest object version by lineage key or title.

        ``evidence`` is ``{propertyName: value}`` (a string, or a concept uuid
        for a concept_ref property). When several objects bear the same title
        the server answers ``409 {status: "ambiguous", candidates}`` rather
        than pick the newest; evidence narrows it to the individual whose
        current values fit; evidence that fits nobody is ``404 {status: "none"}``.
        """
        data = {
            "objectLineageKey": object_lineage_key,
            "categoryPrototypeUuid": category_prototype_uuid,
            "title": title,
            "private": private,
            "ownerUserId": owner_user_id,
            "agentSessionId": agent_session_id
        }
        if isinstance(evidence, dict):
            data["evidence"] = evidence
        result = self._request("POST", "/api/objects/resolve", json=data)
        result["objectUuid"] = result.get("objectUuid") or result.get("selectedObjectUuid")
        return result

    def generalize_object(
        self,
        source_object_uuid: Optional[str] = None,
        source_object_lineage_key: Optional[str] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        target_category_prototype_uuid: Optional[str] = None,
        target_category_name: Optional[str] = None,
        target_parent_category_name: Optional[str] = None,
        target_title: Optional[str] = None,
        target_tags: Optional[List[str]] = None,
        include_properties: Optional[List[str]] = None,
        exclude_properties: Optional[List[str]] = None,
        mode: str = "safe",
        object_lineage_key: Optional[str] = None,
        publish_assertion: bool = False,
        assertion_predicate: str = "generalized_fact",
        assertion_truth: float = 0.9,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Generalize a concrete object into a reusable variant"""
        data = {
            "sourceObjectUuid": source_object_uuid,
            "sourceObjectLineageKey": source_object_lineage_key,
            "ownerUserId": owner_user_id,
            "agentSessionId": agent_session_id,
            "targetCategoryPrototypeUuid": target_category_prototype_uuid,
            "targetCategoryName": target_category_name,
            "targetParentCategoryName": target_parent_category_name,
            "targetTitle": target_title,
            "targetTags": target_tags or [],
            "includeProperties": include_properties,
            "excludeProperties": exclude_properties,
            "mode": mode,
            "objectLineageKey": object_lineage_key,
            "publishAssertion": publish_assertion,
            "assertionPredicate": assertion_predicate,
            "assertionTruth": assertion_truth,
            "provenance": provenance
        }
        return self._request("POST", "/api/objects/generalize", json=data)

    # ===== Procedures (v0.2.2) =====

    def list_procedures(
        self,
        limit: int = 100,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Every procedure the caller may read, newest first.

        A complete listing (``total``, ``truncated``), unlike
        ``search_procedures`` which is a top-K by meaning.
        """
        result = self._request(
            "GET",
            "/api/procedures",
            params={"limit": limit},
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )
        procedures = result.get("procedures") or []
        return {
            "procedures": procedures,
            "total": result.get("total", len(procedures)),
            "truncated": result.get("truncated") is True,
        }

    def create_procedure(
        self,
        title: str,
        description: str = "",
        steps: Optional[List[Dict[str, Any]]] = None,
        dependencies: Optional[List[List[int]]] = None,
        guards: Optional[Dict[str, Any]] = None,
        extra_props: Optional[Dict[str, Any]] = None,
        dag_json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a Procedure DAG with steps and dependencies (stores canonical dagJson)."""
        data = {
            "title": title,
            "description": description,
            "steps": steps or [],
            "dependencies": dependencies or []
        }
        if guards is not None:
            data["guards"] = guards
        if extra_props is not None:
            data["extraProps"] = extra_props
        if dag_json is not None:
            data["dagJson"] = dag_json
        return self._request("POST", "/api/procedures", json=data)

    def get_procedure(
        self,
        uuid: str,
        source: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get a Procedure DAG by UUID.

        source A/B load path: 'dagJson' | 'graph' | 'both' (default both; primary prefers dagJson).
        """
        if source is not None:
            return self._request("GET", f"/api/procedures/{uuid}", params={"source": source})
        return self._request("GET", f"/api/procedures/{uuid}")

    def put_procedure_dag(
        self,
        uuid: str,
        dag_json: Dict[str, Any],
        rematerialize: bool = True,
        provenance: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Update canonical dagJson (source of truth); optionally rematerialize next→ edges."""
        data: Dict[str, Any] = {
            "dagJson": dag_json,
            "rematerialize": rematerialize,
        }
        if provenance is not None:
            data["provenance"] = provenance
        return self._request("PUT", f"/api/procedures/{uuid}/dag", json=data)

    def add_procedure_step(
        self,
        procedure_uuid: str,
        title: str,
        payload: Optional[Dict[str, Any]] = None,
        tool: Optional[str] = None,
        guard_text: Optional[str] = None,
        guard: Optional[Any] = None,
        on_fail: Optional[Any] = None,
        after_step_uuid: Optional[str] = None,
        before_step_uuid: Optional[str] = None,
        order: Optional[int] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Insert a new step into an existing Procedure DAG"""
        data: Dict[str, Any] = {"title": title}
        if payload is not None:
            data["payload"] = payload
        if tool is not None:
            data["tool"] = tool
        if guard_text is not None:
            data["guard_text"] = guard_text
        if guard is not None:
            data["guard"] = guard
        if on_fail is not None:
            data["on_fail"] = on_fail
        if after_step_uuid is not None:
            data["afterStepUuid"] = after_step_uuid
        if before_step_uuid is not None:
            data["beforeStepUuid"] = before_step_uuid
        if order is not None:
            data["order"] = order
        if provenance is not None:
            data["provenance"] = provenance
        return self._request(
            "POST",
            f"/api/procedures/{procedure_uuid}/steps",
            json=data
        )

    def generalize_procedure(
        self,
        procedure_uuid: str,
        title: str,
        description: str = "",
        mode: str = "schema_only",
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a generalized reusable variant of a Procedure DAG"""
        data = {
            "title": title,
            "description": description,
            "mode": mode,
            "provenance": provenance
        }
        return self._request(
            "POST",
            f"/api/procedures/{procedure_uuid}/generalize",
            json=data
        )

    def repair_procedure_selector(
        self,
        procedure_uuid: str,
        step_uuid: str,
        form_element_uuid: str,
        repaired_selector: str,
        failed_selector: Optional[str] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Record a selector failure and repaired selector for a step"""
        data = {
            "stepUuid": step_uuid,
            "formElementUuid": form_element_uuid,
            "failedSelector": failed_selector,
            "repairedSelector": repaired_selector,
            "provenance": provenance
        }
        return self._request(
            "POST",
            f"/api/procedures/{procedure_uuid}/repair-selector",
            json=data
        )

    def search_procedures(
        self,
        query: str,
        top_k: int = 5,
        include: Union[str, List[str]] = "verified",
    ) -> List[Dict[str, Any]]:
        """Search for Procedure DAGs by semantic similarity.

        KSG-L1: only verified (replayable) procedures unless ``include`` opts in
        to ``"drafts"``, ``"retired"`` or ``"all"`` (or a list of them). Each hit
        carries its lifecycle ``status``.
        """
        inc = ",".join(include) if isinstance(include, (list, tuple)) else (include or "verified")
        result = self._request(
            "POST",
            "/api/procedures/search",
            json={"query": query, "topK": top_k, "include": inc}
        )
        return result["results"]

    def import_procedure_json(
        self,
        procedure: Dict[str, Any],
        form_element_category_prototype_uuid: Optional[str] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Import a naive JSON procedure definition into a linked DAG"""
        data = {
            "procedure": procedure,
            "formElementCategoryPrototypeUuid": form_element_category_prototype_uuid,
            "provenance": provenance
        }
        return self._request("POST", "/api/procedures/import-json", json=data)

    # ===== Concept Objects (v0.2.2) =====

    def suggest_concept_objects(
        self,
        text: Optional[str] = None,
        query: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        top_k: int = 10,
        create_tag_if_missing: bool = False
    ) -> Dict[str, Any]:
        """Suggest existing concept objects for a phrase/context"""
        text_input = text or query
        if not text_input or not str(text_input).strip():
            raise ValueError("text or query is required for suggest_concept_objects")
        data = {
            "text": text_input,
            "query": text_input,
            "context": context or {},
            "topK": top_k,
            "createTagIfMissing": create_tag_if_missing
        }
        body = self._request("POST", "/api/concept-objects/suggest", json=data)
        body["suggestions"] = body.get("suggestions") or body.get("candidates") or []
        return body

    def search_concept_objects(
        self,
        query: Optional[str] = None,
        text: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """Search concept objects by semantic similarity"""
        data = {
            "query": query,
            "text": text,
            "context": context or {},
            "topK": top_k
        }
        result = self._request("POST", "/api/concept-objects/search", json=data)
        return result["results"]

    def search_knowledge(
        self,
        query: str,
        top_k: int = 10,
        similarity_threshold: float = 0.55,
        categories: Optional[List[str]] = None,
        include_concepts: bool = True,
        include_objects: bool = True,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        knowledge_api_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Unified search over concepts (incl. episodic) + Document/typed objects."""
        prefix = knowledge_api_prefix or getattr(self, "prototype_api_prefix", None) or "/api2.0"
        data = {
            "query": query,
            "topK": top_k,
            "similarityThreshold": similarity_threshold,
            "categories": categories,
            "includeConcepts": include_concepts,
            "includeObjects": include_objects,
        }
        result = self._request(
            "POST",
            f"{prefix}/knowledge/search",
            json=data,
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )
        return {
            "ok": result.get("ok", True),
            "query": result.get("query", query),
            "count": result.get("count", len(result.get("results") or [])),
            "results": result.get("results") or [],
        }

    def semantic_remember(
        self,
        text: str,
        speaker: str = "user",
        source: str = "conversation",
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        session_id: Optional[str] = None,
        is_private: bool = True,
        plan: Optional[Dict[str, Any]] = None,
        provenance: Optional[Dict[str, Any]] = None,
        semantic_api_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Ingest a chat utterance into MemoryEvent + claims + associations."""
        prefix = semantic_api_prefix or getattr(self, "prototype_api_prefix", None) or "/api2.0"
        data = {
            "text": text,
            "speaker": speaker,
            "source": source,
            "ownerUserId": owner_user_id,
            "agentSessionId": agent_session_id,
            "sessionId": session_id,
            "private": is_private,
            "plan": plan,
            "provenance": provenance,
        }
        return self._request(
            "POST",
            f"{prefix}/semantic/remember",
            json=data,
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )

    def semantic_recall(
        self,
        query: str,
        top_k: int = 8,
        expand_depth: int = 1,
        similarity_threshold: float = 0.15,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        semantic_api_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        prefix = semantic_api_prefix or getattr(self, "prototype_api_prefix", None) or "/api2.0"
        return self._request(
            "POST",
            f"{prefix}/semantic/recall",
            json={
                "query": query,
                "topK": top_k,
                "expandDepth": expand_depth,
                "similarityThreshold": similarity_threshold,
                "ownerUserId": owner_user_id,
            },
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )

    def semantic_ask(
        self,
        subject: Optional[str] = None,
        predicate: Optional[str] = None,
        object: Optional[Any] = None,
        pattern: Optional[Dict[str, Any]] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        semantic_api_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        prefix = semantic_api_prefix or getattr(self, "prototype_api_prefix", None) or "/api2.0"
        body = pattern or {
            "subject": subject,
            "predicate": predicate,
            "object": object,
            "ownerUserId": owner_user_id,
        }
        return self._request(
            "POST",
            f"{prefix}/semantic/ask",
            json=body,
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )


    def ground(
        self,
        claim: Optional[Dict[str, Any]] = None,
        term: Optional[str] = None,
        role: Optional[str] = None,
        mentions: Optional[List[str]] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        semantic_api_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Ground a claim's terms, or one term, to concepts (``POST /api2.0/ground``,
        knowshowgo >= 0.2.24). Pass ``claim={"subject", "predicate", "object"}`` or
        ``term`` with ``role`` (``entity`` | ``class`` | ``predicate``). Each term comes back
        ``resolved`` (uuid, ``definedness``), ``ambiguous`` (``candidates``: ask which one),
        ``undefined`` (nothing is created) or ``literal``; the predicate in canonical form.
        ``mentions`` are concept uuids already in the conversation. Reads only."""
        if not claim and not term:
            raise ValueError("ground requires claim {subject, predicate, object} or term")
        prefix = semantic_api_prefix or getattr(self, "prototype_api_prefix", None) or "/api2.0"
        body: Dict[str, Any] = {"ownerUserId": owner_user_id}
        if claim:
            body["claim"] = claim
        else:
            body["term"] = term
            if role is not None:
                body["role"] = role
        if mentions is not None:
            body["mentions"] = mentions
        return self._request(
            "POST",
            f"{prefix}/ground",
            json=body,
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )

    def verify_answer(
        self,
        claims: List[Dict[str, Any]],
        text: Optional[str] = None,
        argument: Optional[Dict[str, Any]] = None,
        record: Optional[bool] = None,
        agent: Optional[str] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        semantic_api_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Verify an answer claim by claim against stored claims (``POST /api2.0/verify/answer``,
        knowshowgo >= 0.2.23). ``claims`` is the answer decomposed into
        ``{"subject", "predicate", "object"}`` triples; each comes back ``supported``,
        ``contradicted``, ``disputed``, ``competing`` (with the stored values) or ``unknown``,
        with evidence, plus a ``verdict`` for the answer. ``record=True`` remembers only the
        claims the graph did not speak against, at the ``inferred`` provenance tier."""
        if not isinstance(claims, list):
            raise ValueError("verify_answer requires claims: a list of {subject, predicate, object}")
        prefix = semantic_api_prefix or getattr(self, "prototype_api_prefix", None) or "/api2.0"
        body: Dict[str, Any] = {"claims": claims, "ownerUserId": owner_user_id}
        if text is not None:
            body["text"] = text
        if argument is not None:
            body["argument"] = argument
        if record is not None:
            body["record"] = record
        if agent is not None:
            body["agent"] = agent
        return self._request(
            "POST",
            f"{prefix}/verify/answer",
            json=body,
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )
    def semantic_correct(
        self,
        text: str,
        speaker: str = "user",
        source: str = "correction",
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
        session_id: Optional[str] = None,
        is_private: bool = True,
        plan: Optional[Dict[str, Any]] = None,
        provenance: Optional[Dict[str, Any]] = None,
        semantic_api_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        prefix = semantic_api_prefix or getattr(self, "prototype_api_prefix", None) or "/api2.0"
        return self._request(
            "POST",
            f"{prefix}/semantic/correct",
            json={
                "text": text,
                "speaker": speaker,
                "source": source,
                "ownerUserId": owner_user_id,
                "agentSessionId": agent_session_id,
                "sessionId": session_id,
                "private": is_private,
                "plan": plan,
                "provenance": provenance,
            },
            owner_user_id=owner_user_id,
            agent_session_id=agent_session_id,
        )

    def suggest_concept_object_prototypes(
        self,
        label: str = "",
        properties: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None,
        category_prototype_uuids: Optional[List[str]] = None,
        top_k: int = 5
    ) -> Dict[str, Any]:
        """Suggest category prototypes for a labelled property set"""
        props = properties or []
        if not props:
            raise ValueError("properties are required for suggest_concept_object_prototypes")
        data = {
            "label": label,
            "properties": props,
            "context": context or {},
            "categoryPrototypeUuids": category_prototype_uuids,
            "topK": top_k
        }
        body = self._request("POST", "/api/concept-objects/suggest-prototypes", json=data)
        body["suggestions"] = body.get("suggestions") or body.get("candidates") or []
        return body

    # ===== Composites (v0.2.2) =====

    def create_composite(
        self,
        category_prototype_uuid: str,
        title: str,
        summary: str = "",
        tags: Optional[List[str]] = None,
        properties: Optional[List[Dict[str, Any]]] = None,
        components: Optional[List[Dict[str, Any]]] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a composite object with components"""
        data = {
            "categoryPrototypeUuid": category_prototype_uuid,
            "title": title,
            "summary": summary,
            "tags": tags or [],
            "properties": properties or [],
            "components": components or [],
            "provenance": provenance
        }
        return self._request("POST", "/api/composites", json=data)

    def get_composite(self, uuid: str) -> Dict[str, Any]:
        """Get a composite object by UUID"""
        return self._request("GET", f"/api/composites/{uuid}")

    def update_composite_component(
        self,
        composite_uuid: str,
        component_uuid: str,
        title: Optional[str] = None,
        summary: Optional[str] = None,
        tags: Optional[List[str]] = None,
        properties: Optional[List[Dict[str, Any]]] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a new version of a composite component"""
        data = {
            "title": title,
            "summary": summary,
            "tags": tags or [],
            "properties": properties or [],
            "provenance": provenance
        }
        return self._request(
            "POST",
            f"/api/composites/{composite_uuid}/components/{component_uuid}/update",
            json=data
        )

    # ===== Logic / Syllogisms (v0.2.2) =====

    def create_syllogism(
        self,
        title: str,
        description: str = "",
        premises: Optional[List[Dict[str, Any]]] = None,
        conclusion: Optional[Dict[str, Any]] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a syllogism DAG with premises and a conclusion"""
        data = {
            "title": title,
            "description": description,
            "premises": premises or [],
            "conclusion": conclusion,
            "provenance": provenance
        }
        return self._request("POST", "/api/logic/syllogisms", json=data)

    def get_syllogism(self, uuid: str) -> Dict[str, Any]:
        """Get a compiled syllogism DAG by UUID"""
        return self._request("GET", f"/api/logic/syllogisms/{uuid}")

    # ===== Market Matching (v0.2.2) =====

    def register_market_match(
        self,
        kind: str,
        actor_id: str,
        object_uuid: Optional[str] = None,
        tags: Optional[List[str]] = None,
        properties: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Register an offer/want market intent"""
        data = {
            "kind": kind,
            "actorId": actor_id,
            "objectUuid": object_uuid,
            "tags": tags or [],
            "properties": properties or []
        }
        result = self._request("POST", "/api/market/matches/register", json=data)
        result["matchUuid"] = result.get("matchUuid") or result.get("intent_uuid")
        result["intent_uuid"] = result.get("intent_uuid") or result.get("matchUuid")
        return result

    def search_market_matches(
        self,
        kind: str,
        tags: Optional[List[str]] = None,
        properties: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """Search for counterparty market intents"""
        data = {
            "kind": kind,
            "tags": tags or [],
            "properties": properties or []
        }
        result = self._request("POST", "/api/market/matches/search", json=data)
        return result["matches"]

    # ===== Channels (v0.2.2) =====

    def subscribe_channel(
        self,
        channel_tag: str,
        actor_id: str
    ) -> Dict[str, Any]:
        """Subscribe an actor to a concept-tag channel"""
        data = {"channelTag": channel_tag, "actorId": actor_id}
        return self._request("POST", "/api/channels/subscribe", json=data)

    def post_channel_message(
        self,
        channel_tag: str,
        actor_id: str,
        message: str,
        tags: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Post a message to a concept-tag channel"""
        data = {
            "channelTag": channel_tag,
            "actorId": actor_id,
            "message": message,
            "tags": tags or []
        }
        return self._request("POST", "/api/channels/messages", json=data)

    def get_channel_feed(self, actor_id: str) -> List[Dict[str, Any]]:
        """Get the channel feed for an actor's subscriptions"""
        result = self._request(
            "GET",
            "/api/channels/feed",
            params={"actorId": actor_id}
        )
        return result["items"]

    # ===== Repeating Events (v0.2.2) =====

    def create_repeating_event(
        self,
        category_prototype_uuid: str,
        title: str,
        tags: Optional[List[str]] = None,
        properties: Optional[List[Dict[str, Any]]] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a public repeating event object"""
        data = {
            "categoryPrototypeUuid": category_prototype_uuid,
            "title": title,
            "tags": tags or [],
            "properties": properties or [],
            "provenance": provenance
        }
        return self._request("POST", "/api/events/repeating", json=data)

    # ===== Ratings (v0.2.2) =====

    def rate_entity(
        self,
        uuid: str,
        actor_id: str,
        value: float,
        metric: str = "overall",
        scale: float = 5,
        comment: str = ""
    ) -> Dict[str, Any]:
        """Record a rating assertion for an entity"""
        data = {
            "actorId": actor_id,
            "metric": metric,
            "value": value,
            "scale": scale,
            "comment": comment
        }
        return self._request("POST", f"/api/ratings/{uuid}", json=data)

    def get_ratings(self, uuid: str) -> Dict[str, Any]:
        """Get aggregated ratings for an entity"""
        return self._request("GET", f"/api/ratings/{uuid}")

    # ===== Legacy knode =====

    def create_knode(
        self,
        label: str,
        summary: str = "",
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Create a legacy knode document node"""
        data = {
            "label": label,
            "summary": summary,
            "tags": tags or [],
            "metadata": metadata or {}
        }
        result = self._request("POST", "/api/knodes", json=data)
        return result["uuid"]

    # ===== Graph query (devExtended) =====

    def query_graph(
        self,
        search: Optional[Dict[str, Any]] = None,
        traverse: Optional[Dict[str, Any]] = None,
        match_prototypes: bool = False,
        prototype_revision_uuids: Optional[Any] = None
    ) -> Dict[str, Any]:
        """Run ad-hoc graph search + traversal query"""
        payload = {"search": search, "traverse": traverse}
        if match_prototypes:
            payload["matchPrototypes"] = True
        if prototype_revision_uuids:
            payload["prototypeRevisionUuids"] = prototype_revision_uuids
        return self._request("POST", "/api/query", json=payload)

    # ===== Seeds =====

    def seed_osl_agent(self, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self._request("POST", "/api/seed/osl-agent", json=body or {})

    def seed_osl_oc_agent(self, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self._request("POST", "/api/seed/osl-oc-agent", json=body or {})

    def seed_openclaw_agent(self, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self._request("POST", "/api/seed/openclaw-agent", json=body or {})

    def seed_social_layer(self, api_prefix: str = "/api2.0") -> Dict[str, Any]:
        prefix = (api_prefix or "/api2.0").rstrip("/") or "/api2.0"
        return self._request("POST", f"{prefix}/seed/social-layer", json={})

    def seed_logic_ir_primitives(self, api_prefix: str = "/api2.0") -> Dict[str, Any]:
        prefix = (api_prefix or "/api2.0").rstrip("/") or "/api2.0"
        return self._request("POST", f"{prefix}/seed/logic-ir-primitives", json={})

    def logic_ir_prototypes(self) -> Dict[str, str]:
        """The seeded Logic IR prototypes as ``{name: uuid}``, without seeding.

        Seeding is the only way to learn these uuids today, and seeding is a
        write. On a deployment that sets ``KSG_REQUIRE_WRITE_TOKEN=1`` — which
        ``docs/PUBLIC-API.md`` says is on for the public API — that write is
        refused without write credentials, so a read-only caller cannot obtain
        the uuids at all. This reads them off ``GET /api/object-categories``
        instead, which the write gate does not cover.

        Re-seeding is otherwise cheap: it is idempotent, and an unchanged spec
        does not bump a category's version. The cost this avoids is the write
        itself, not version churn.

        Rows are selected by their ``category:logic-ir:`` lineage key rather
        than by name, so a caller's own category also called ``Concept`` is
        never mistaken for the primitive. The listing collapses to the head
        version per lineage, so these are the current revisions. Empty when
        nothing has been seeded yet.
        """
        prototypes: Dict[str, str] = {}
        for row in self.list_object_categories() or []:
            lineage = str((row or {}).get("categoryLineageKey") or "")
            uuid = (row or {}).get("uuid")
            if not lineage.startswith(LOGIC_IR_LINEAGE_PREFIX) or not uuid:
                continue
            name = (row or {}).get("name") or _logic_ir_name_from_lineage(lineage)
            if name:
                prototypes[name] = uuid
        return prototypes

    def seed_procedure_run_primitives(self, api_prefix: str = "/api2.0") -> Dict[str, Any]:
        prefix = (api_prefix or "/api2.0").rstrip("/") or "/api2.0"
        return self._request("POST", f"{prefix}/seed/procedure-run-primitives", json={})

    # ===== Experimental (dev preview) =====

    def create_vault(
        self,
        owner_user_id: str,
        agent_session_id: Optional[str] = None,
        title: str = "Personal vault",
        tags: Optional[List[str]] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        data = {
            "ownerUserId": owner_user_id,
            "agentSessionId": agent_session_id,
            "title": title,
            "tags": tags,
            "provenance": provenance
        }
        body = self._request("POST", "/api/vaults", json=data)
        body["vaultUuid"] = body.get("vaultUuid") or body.get("vault_uuid")
        return body

    def personal_remember(
        self,
        owner_user_id: str,
        title: str,
        agent_session_id: Optional[str] = None,
        vault_uuid: Optional[str] = None,
        category_name: Optional[str] = None,
        parent_category_name: str = "PersonalMemory",
        summary: str = "",
        tags: Optional[List[str]] = None,
        properties: Optional[List[Dict[str, Any]]] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        data = {
            "ownerUserId": owner_user_id,
            "agentSessionId": agent_session_id,
            "vaultUuid": vault_uuid,
            "categoryName": category_name,
            "parentCategoryName": parent_category_name,
            "title": title,
            "summary": summary,
            "tags": tags or [],
            "properties": properties or [],
            "provenance": provenance
        }
        return self._request("POST", "/api/personal/remember", json=data)

    def personal_recall(
        self,
        owner_user_id: str,
        query: str,
        vault_uuid: Optional[str] = None
    ) -> Dict[str, Any]:
        params = {"ownerUserId": owner_user_id, "query": query}
        if vault_uuid:
            params["vaultUuid"] = vault_uuid
        return self._request("GET", "/api/personal/recall", params=params)

    def ingest_private_payment(
        self,
        owner_user_id: str,
        agent_session_id: str,
        label: str,
        text: str
    ) -> Dict[str, Any]:
        data = {
            "ownerUserId": owner_user_id,
            "agentSessionId": agent_session_id,
            "label": label,
            "text": text
        }
        return self._request("POST", "/api/private/payment/ingest", json=data)

    def list_private_payments(
        self,
        owner_user_id: str,
        agent_session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        params = {"ownerUserId": owner_user_id}
        if agent_session_id:
            params["agentSessionId"] = agent_session_id
        return self._request("GET", "/api/private/payments", params=params)

    def get_private_payment(self, uuid: str, owner_user_id: str) -> Dict[str, Any]:
        return self._request(
            "GET",
            f"/api/private/payment/{uuid}",
            params={"ownerUserId": owner_user_id}
        )

    def lookup_private_payment(
        self,
        owner_user_id: str,
        agent_session_id: str
    ) -> Dict[str, Any]:
        data = {"ownerUserId": owner_user_id, "agentSessionId": agent_session_id}
        return self._request("POST", "/api/private/payment/lookup", json=data)

    # ===== Compatibility aliases =====

    def resolve_tag(self, **kwargs) -> Dict[str, Any]:
        return self.resolve_topic_tag(**kwargs)

    def repair_selector(self, procedure_uuid: str, **kwargs) -> Dict[str, Any]:
        return self.repair_procedure_selector(
            procedure_uuid,
            step_uuid=kwargs.get("step_uuid") or kwargs.get("stepUuid"),
            form_element_uuid=kwargs.get("form_element_uuid") or kwargs.get("formElementUuid"),
            failed_selector=kwargs.get("failed_selector") or kwargs.get("failedSelector"),
            repaired_selector=kwargs.get("repaired_selector") or kwargs.get("repairedSelector"),
            provenance=kwargs.get("provenance")
        )

    def suggest_prototypes(self, **kwargs) -> Dict[str, Any]:
        return self.suggest_concept_object_prototypes(
            label=kwargs.get("label", ""),
            properties=kwargs.get("properties"),
            context=kwargs.get("context"),
            category_prototype_uuids=kwargs.get("category_prototype_uuids")
            or kwargs.get("categoryPrototypeUuids"),
            top_k=kwargs.get("top_k", kwargs.get("topK", 5))
        )


# Alias for scp_alg_test compatibility
class KSGGroundTruth:
    """
    KnowShowGo ground truth adapter for scp_alg_test.
    
    Usage:
        gt = KSGGroundTruth()
        gt.add_verified_fact("Bell", "invented", "telephone")
        result = gt.check("Edison invented the telephone")
    """
    
    def __init__(self, url: str = "http://localhost:3000"):
        self.client = KnowShowGoClient(url)
    
    def add_verified_fact(
        self,
        subject: str,
        predicate: str,
        obj: str,
        sources: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        return self.client.add_verified_fact(subject, predicate, obj, sources)
    
    def add_facts_bulk(self, facts: List[tuple]) -> Dict[str, Any]:
        return self.client.store_facts_bulk(facts)
    
    def check(self, claim: str) -> Dict[str, Any]:
        return self.client.check(claim)
    
    def stats(self) -> Dict[str, Any]:
        return self.client.get_fact_stats()
    
    def health_check(self) -> bool:
        try:
            result = self.client.health_check()
            return result.get("status") == "ok"
        except Exception:
            return False


# Example usage
if __name__ == "__main__":
    client = KnowShowGoClient()

    # Health check
    print("Health:", client.health_check())

    # Create prototype
    proto_uuid = client.create_prototype(
        name="Person",
        description="A human individual",
        labels=["person", "human"]
    )
    print(f"Created prototype: {proto_uuid}")

    # Create concept
    concept_uuid = client.create_concept(
        prototype_uuid=proto_uuid,
        json_obj={"name": "John Doe", "email": "john@example.com"}
    )
    print(f"Created concept: {concept_uuid}")

    # Search
    results = client.search_concepts("person named John", top_k=5)
    print(f"Search results: {len(results)} found")

