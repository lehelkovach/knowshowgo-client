"""
KnowShowGo Python REST API Client

Provides a Python client for the KnowShowGo REST API.
"""

import requests
from typing import Dict, Any, List, Optional
import json


class KnowShowGoClient:
    """Python client for KnowShowGo REST API"""

    def __init__(
        self,
        base_url: str = "http://localhost:3000",  # pragma: allowlist secret
        prototype_api_prefix: str = "/api2.0",
        enforce_contract: bool = False,
        default_owner_user_id: Optional[str] = None,
        default_agent_session_id: Optional[str] = None,
    ):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        # New features live under the /api2.0 namespace by default; set this to
        # "/api" to fall back to the retained backward-compatible alias.
        self.prototype_api_prefix = prototype_api_prefix
        self.default_owner_user_id = default_owner_user_id
        self.default_agent_session_id = default_agent_session_id
        self._contract = None
        self._enforce_contract = enforce_contract

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
        prefix = path.split('/:')[0] if '/:' in path else path
        allowed = any(
            entry.get('method') == method
            and (entry.get('path') == path or entry.get('path', '').startswith(prefix))
            for entry in self._contract
        )
        if not allowed:
            raise ValueError(f'endpoint not in dev contract: {method} {path}')

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

        headers = dict(kwargs.pop("headers", None) or {})
        if owner_user_id:
            headers["X-KSG-Owner"] = str(owner_user_id)
        if agent_session_id:
            headers["X-KSG-Session"] = str(agent_session_id)
        if headers:
            kwargs["headers"] = headers

        params = dict(kwargs.get("params") or {})
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

    def connect(
        self,
        expected_channel: str = 'dev',
        expected_release: str = 'v0.2.5-dev',
        enforce_contract: bool = False
    ) -> Dict[str, Any]:
        """Verify dev channel/release and optionally cache contract for path guard"""
        manifest = self.get_release_manifest()
        if expected_channel and manifest.get('channel') != expected_channel:
            raise ValueError(f"expected channel {expected_channel}, got {manifest.get('channel')}")
        if expected_release and manifest.get('release') != expected_release:
            raise ValueError(f"expected release {expected_release}, got {manifest.get('release')}")
        self._contract = (manifest.get('surfaces') or {}).get('clientContract')
        self._enforce_contract = enforce_contract
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
        similarity_threshold: float = 0.7,
        prototype_filter: Optional[str] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Search for concepts by semantic similarity"""
        data = {
            "query": query,
            "topK": top_k,
            "similarityThreshold": similarity_threshold,
            "prototypeFilter": prototype_filter
        }
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
        threshold: float = 0.0
    ) -> List[Dict[str, Any]]:
        """Rank existing prototypes by how typical the item is of each."""
        data = {"text": text, "embedding": embedding, "topK": top_k, "threshold": threshold}
        result = self._request("POST", f"{self.prototype_api_prefix}/prototypes/match", json=data)
        return result["matches"]

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

    # ===== Node with Document Methods =====

    def create_node_with_document(
        self,
        label: str,
        summary: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        associations: Optional[List[Dict[str, Any]]] = None,
        prototype_uuid: Optional[str] = None
    ) -> str:
        """Create a node with document metadata and tags"""
        data = {
            "label": label,
            "summary": summary,
            "tags": tags or [],
            "metadata": metadata or {},
            "associations": associations or [],
            "prototypeUuid": prototype_uuid
        }
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
        source: str = "user"
    ) -> Dict[str, Any]:
        """Create an assertion"""
        data = {
            "subject": subject,
            "predicate": predicate,
            "object": obj,
            "truth": truth,
            "source": source
        }
        return self._request("POST", "/api/assertions", json=data)

    def get_assertions(
        self,
        subject: Optional[str] = None,
        predicate: Optional[str] = None,
        obj: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """Get assertions with optional filters"""
        params = {}
        if subject:
            params["subject"] = subject
        if predicate:
            params["predicate"] = predicate
        if obj is not None:
            params["object"] = obj
        result = self._request("GET", "/api/assertions", params=params)
        return result["assertions"]

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
        body = self._request("POST", "/api/topics", json=data)
        topic = body.get("topic") or {}
        return {**body, **topic}

    def get_topic(self, uuid: str) -> Dict[str, Any]:
        """Get a topic by UUID (unwraps the topic payload)"""
        result = self._request("GET", f"/api/topics/{uuid}")
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
        return self._request("POST", "/api/topics/resolve-tag", json=data)

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
        category_lineage_key: Optional[str] = None
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
            "categoryLineageKey": category_lineage_key
        }
        return self._request("POST", "/api/object-categories/upsert", json=data)

    def get_object_category(self, uuid: str) -> Dict[str, Any]:
        """Get an object category by UUID"""
        body = self._request("GET", f"/api/object-categories/{uuid}")
        category = body.get("category") or {}
        body["categoryPrototypeUuid"] = body.get("categoryPrototypeUuid") or category.get("uuid") or uuid
        return body

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
        agent_session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get an object entity by UUID"""
        params = {}
        if owner_user_id:
            params["ownerUserId"] = owner_user_id
        if agent_session_id:
            params["agentSessionId"] = agent_session_id
        return self._request("GET", f"/api/objects/{uuid}", params=params)

    def resolve_object(
        self,
        object_lineage_key: Optional[str] = None,
        category_prototype_uuid: Optional[str] = None,
        title: Optional[str] = None,
        private: bool = False,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Resolve the latest object version by lineage key or title"""
        data = {
            "objectLineageKey": object_lineage_key,
            "categoryPrototypeUuid": category_prototype_uuid,
            "title": title,
            "private": private,
            "ownerUserId": owner_user_id,
            "agentSessionId": agent_session_id
        }
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

    def create_procedure(
        self,
        title: str,
        description: str = "",
        steps: Optional[List[Dict[str, Any]]] = None,
        dependencies: Optional[List[List[int]]] = None,
        guards: Optional[Dict[str, Any]] = None,
        extra_props: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a Procedure DAG with steps and dependencies"""
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
        return self._request("POST", "/api/procedures", json=data)

    def get_procedure(self, uuid: str) -> Dict[str, Any]:
        """Get a compiled Procedure DAG by UUID"""
        return self._request("GET", f"/api/procedures/{uuid}")

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
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """Search for Procedure DAGs by semantic similarity"""
        result = self._request(
            "POST",
            "/api/procedures/search",
            json={"query": query, "topK": top_k}
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
        traverse: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Run ad-hoc graph search + traversal query"""
        return self._request("POST", "/api/query", json={"search": search, "traverse": traverse})

    # ===== Seeds =====

    def seed_osl_agent(self, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self._request("POST", "/api/seed/osl-agent", json=body or {})

    def seed_openclaw_agent(self, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self._request("POST", "/api/seed/openclaw-agent", json=body or {})

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

