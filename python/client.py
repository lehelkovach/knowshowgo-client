"""
KnowShowGo Python REST API Client

Provides a Python client for the KnowShowGo REST API.
"""

import requests
from typing import Dict, Any, List, Optional
import json
from urllib.parse import quote


class KnowShowGoClient:
    """Python client for KnowShowGo REST API"""

    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make HTTP request to API"""
        url = f"{self.base_url}{endpoint}"
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _quote(value: str) -> str:
        """Quote path parameters without allowing slash traversal."""
        return quote(str(value), safe="")

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
        return self._request("GET", f"/api/prototypes/{self._quote(uuid)}")

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
        return self._request("GET", f"/api/concepts/{self._quote(uuid)}")

    def search_concepts(
        self,
        query: str,
        top_k: int = 10,
        similarity_threshold: float = 0.7,
        prototype_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Search for concepts by semantic similarity"""
        data = {
            "query": query,
            "topK": top_k,
            "similarityThreshold": similarity_threshold,
            "prototypeFilter": prototype_filter
        }
        result = self._request("POST", "/api/concepts/search", json=data)
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
            f"/api/associations/{self._quote(uuid)}",
            params={"direction": direction}
        )
        return result["associations"]

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
        self._request("POST", f"/api/nodes/{self._quote(uuid)}/embedding")

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
            f"/api/orm/{self._quote(prototype_name)}/create",
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
            f"/api/orm/{self._quote(prototype_name)}/{self._quote(uuid)}"
        )

    # ===== Topics / Tags =====

    def resolve_tag(
        self,
        tag: Optional[str] = None,
        phrase: Optional[str] = None,
        language: str = "und",
        top_k: int = 10,
        create_if_missing: bool = False
    ) -> Dict[str, Any]:
        """Resolve a phrase/tag to canonical tag and topic candidates."""
        data = {
            "tag": tag,
            "phrase": phrase,
            "language": language,
            "topK": top_k,
            "createIfMissing": create_if_missing
        }
        return self._request("POST", "/api/topics/resolve-tag", json=data)

    def create_topic(
        self,
        label: Optional[str] = None,
        phrase: Optional[str] = None,
        summary: str = "",
        aliases: Optional[List[str]] = None,
        kind: str = "topic",
        language: str = "und",
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create or resolve a semantic topic."""
        data = {
            "label": label,
            "phrase": phrase,
            "summary": summary,
            "aliases": aliases or [],
            "kind": kind,
            "language": language,
            "provenance": provenance
        }
        return self._request("POST", "/api/topics", json=data)

    def get_topic(self, uuid: str) -> Dict[str, Any]:
        """Get a semantic topic by UUID."""
        return self._request("GET", f"/api/topics/{self._quote(uuid)}")

    # ===== Object Categories =====

    def create_category(
        self,
        name: str,
        description: str = "",
        context: str = "object-category",
        parent_prototype_uuid: Optional[str] = None,
        parent_category_name: Optional[str] = None,
        properties: Optional[List[Dict[str, Any]]] = None,
        source: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create or resolve an object category prototype."""
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

    def upsert_category(
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
        """Create a versioned object category or update its latest version."""
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

    def get_category(self, uuid: str) -> Dict[str, Any]:
        """Get an object category by UUID."""
        return self._request("GET", f"/api/object-categories/{self._quote(uuid)}")

    # ===== Objects / ConceptObjects =====

    def upsert_object(
        self,
        title: str,
        category_prototype_uuid: Optional[str] = None,
        category_name: Optional[str] = None,
        parent_category_name: Optional[str] = None,
        summary: str = "",
        tags: Optional[List[Any]] = None,
        default_tag_language: str = "und",
        properties: Optional[List[Dict[str, Any]]] = None,
        previous_object_uuid: Optional[str] = None,
        object_lineage_key: Optional[str] = None,
        provenance: Optional[Dict[str, Any]] = None,
        knowledge_kind: str = "personal",
        sensitivity: str = "normal",
        privacy_override: Optional[Dict[str, Any]] = None,
        private: Optional[bool] = None,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new object version with tags and property assertions."""
        data = {
            "categoryPrototypeUuid": category_prototype_uuid,
            "categoryName": category_name,
            "parentCategoryName": parent_category_name,
            "title": title,
            "summary": summary,
            "tags": tags or [],
            "defaultTagLanguage": default_tag_language,
            "properties": properties or [],
            "previousObjectUuid": previous_object_uuid,
            "objectLineageKey": object_lineage_key,
            "provenance": provenance,
            "knowledgeKind": knowledge_kind,
            "sensitivity": sensitivity,
            "privacyOverride": privacy_override,
            "private": private,
            "ownerUserId": owner_user_id,
            "agentSessionId": agent_session_id
        }
        return self._request("POST", "/api/objects/upsert", json=data)

    def get_object(self, uuid: str) -> Dict[str, Any]:
        """Get an object with resolved property JSON."""
        return self._request("GET", f"/api/objects/{self._quote(uuid)}")

    def resolve_object(
        self,
        object_lineage_key: Optional[str] = None,
        category_prototype_uuid: Optional[str] = None,
        title: Optional[str] = None,
        private: bool = False,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Resolve the latest object version by lineage key or title."""
        data = {
            "objectLineageKey": object_lineage_key,
            "categoryPrototypeUuid": category_prototype_uuid,
            "title": title,
            "private": private,
            "ownerUserId": owner_user_id,
            "agentSessionId": agent_session_id
        }
        return self._request("POST", "/api/objects/resolve", json=data)

    def suggest(
        self,
        text: Optional[str] = None,
        query: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        top_k: int = 10,
        create_tag_if_missing: bool = False
    ) -> Dict[str, Any]:
        """Suggest concept objects for smart-tag autocomplete."""
        data = {
            "text": text,
            "query": query,
            "context": context or {},
            "topK": top_k,
            "createTagIfMissing": create_tag_if_missing
        }
        return self._request("POST", "/api/concept-objects/suggest", json=data)

    def suggest_concept_objects(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        """Alias for suggest."""
        return self.suggest(*args, **kwargs)

    def search_concept_objects(
        self,
        query: str,
        text: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        top_k: int = 10
    ) -> Dict[str, Any]:
        """Search concept objects by semantic query or tag."""
        data = {
            "query": query,
            "text": text,
            "context": context or {},
            "topK": top_k
        }
        return self._request("POST", "/api/concept-objects/search", json=data)

    # ===== Procedures =====

    def create_procedure(
        self,
        title: str,
        description: str = "",
        steps: Optional[List[Dict[str, Any]]] = None,
        dependencies: Optional[List[List[int]]] = None,
        guards: Optional[Dict[str, Any]] = None,
        extra_props: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a procedure DAG."""
        data = {
            "title": title,
            "description": description,
            "steps": steps or [],
            "dependencies": dependencies or [],
            "guards": guards,
            "extraProps": extra_props
        }
        return self._request("POST", "/api/procedures", json=data)

    def get_procedure(self, uuid: str) -> Dict[str, Any]:
        """Get a compiled procedure DAG."""
        return self._request("GET", f"/api/procedures/{self._quote(uuid)}")

    def insert_procedure_step(
        self,
        uuid: str,
        title: str,
        payload: Optional[Any] = None,
        tool: Optional[str] = None,
        guard_text: Optional[str] = None,
        guard: Optional[Any] = None,
        on_fail: Optional[Any] = None,
        after_step_uuid: Optional[str] = None,
        before_step_uuid: Optional[str] = None,
        order: Optional[int] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Insert a new step into an existing procedure DAG."""
        data = {
            "title": title,
            "payload": payload,
            "tool": tool,
            "guard_text": guard_text,
            "guard": guard,
            "on_fail": on_fail,
            "afterStepUuid": after_step_uuid,
            "beforeStepUuid": before_step_uuid,
            "order": order,
            "provenance": provenance
        }
        return self._request("POST", f"/api/procedures/{self._quote(uuid)}/steps", json=data)

    def generalize_procedure(
        self,
        uuid: str,
        title: str,
        description: str = "",
        mode: str = "schema_only",
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a generalized reusable procedure variant."""
        data = {
            "title": title,
            "description": description,
            "mode": mode,
            "provenance": provenance
        }
        return self._request("POST", f"/api/procedures/{self._quote(uuid)}/generalize", json=data)

    def search_procedures(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Search procedure nodes."""
        result = self._request("POST", "/api/procedures/search", json={"query": query, "topK": top_k})
        return result["results"]

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

    def get_snapshot(self, entity_id: str) -> Dict[str, Any]:
        """Get resolved values for an entity"""
        result = self._request("GET", f"/api/entities/{self._quote(entity_id)}/snapshot")
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
            f"/api/entities/{self._quote(entity_id)}/evidence",
            params=params
        )
        return result["evidence"]

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
        return self._request("POST", "/api/verify", json=data)

    def get_fact_stats(self) -> Dict[str, Any]:
        """Get statistics about stored facts"""
        return self._request("GET", "/api/facts/stats")

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

