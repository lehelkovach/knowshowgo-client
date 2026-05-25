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
        return quote(str(value), safe="")

    # ===== Topic Registry / Phrase Tags =====

    def create_topic(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create or resolve a semantic topic."""
        return self._request("POST", "/api/topics", json=payload)

    def get_topic(self, uuid: str) -> Dict[str, Any]:
        """Get a semantic topic by UUID."""
        return self._request("GET", f"/api/topics/{self._quote(uuid)}")

    def resolve_topic_tag(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Resolve a phrase/tag to canonical topic candidates."""
        return self._request("POST", "/api/topics/resolve-tag", json=payload)

    def resolve_topic(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for resolve_topic_tag."""
        return self.resolve_topic_tag(payload)

    # ===== Object Categories / Prototypes =====

    def create_category(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create an object category prototype."""
        return self._request("POST", "/api/object-categories", json=payload)

    def create_object_category(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for create_category."""
        return self.create_category(payload)

    def upsert_category(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create a versioned object category prototype."""
        return self._request("POST", "/api/object-categories/upsert", json=payload)

    def upsert_object_category(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for upsert_category."""
        return self.upsert_category(payload)

    def get_category(self, uuid: str) -> Dict[str, Any]:
        """Get an object category prototype."""
        return self._request("GET", f"/api/object-categories/{self._quote(uuid)}")

    def get_object_category(self, uuid: str) -> Dict[str, Any]:
        """Alias for get_category."""
        return self.get_category(uuid)

    # ===== Semantic Object Instances =====

    def upsert_object(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create or version a semantic object."""
        return self._request("POST", "/api/objects/upsert", json=payload)

    def get_object(
        self,
        uuid: str,
        owner_user_id: Optional[str] = None,
        agent_session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get a semantic object by UUID."""
        params = {}
        if owner_user_id:
            params["ownerUserId"] = owner_user_id
        if agent_session_id:
            params["agentSessionId"] = agent_session_id
        return self._request("GET", f"/api/objects/{self._quote(uuid)}", params=params)

    def resolve_object(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Resolve the latest object by lineage key or title."""
        return self._request("POST", "/api/objects/resolve", json=payload)

    def generalize_object(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Generalize a source object into reusable public knowledge."""
        return self._request("POST", "/api/objects/generalize", json=payload)

    # ===== ConceptObject Suggestion / Search =====

    def suggest_concept_objects(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Suggest ConceptObjects for autocomplete or fuzzy tag lookup."""
        return self._request("POST", "/api/concept-objects/suggest", json=payload)

    def search_concept_objects(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Search ConceptObjects."""
        return self._request("POST", "/api/concept-objects/search", json=payload)

    def suggest_prototypes(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Suggest category prototypes for object-like property sets."""
        return self._request("POST", "/api/concept-objects/suggest-prototypes", json=payload)

    def suggest_concept_object_prototypes(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for suggest_prototypes."""
        return self.suggest_prototypes(payload)

    # ===== Composite ConceptObjects =====

    def create_composite(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create a composite object and component objects."""
        return self._request("POST", "/api/composites", json=payload)

    def get_composite(self, uuid: str) -> Dict[str, Any]:
        """Get a composite object."""
        return self._request("GET", f"/api/composites/{self._quote(uuid)}")

    def update_composite_component(
        self,
        composite_uuid: str,
        component_uuid: str,
        payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new component version within a composite."""
        endpoint = (
            f"/api/composites/{self._quote(composite_uuid)}"
            f"/components/{self._quote(component_uuid)}/update"
        )
        return self._request("POST", endpoint, json=payload)

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
            f"/api/associations/{uuid}",
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

    # ===== Procedure DAGs =====

    def create_procedure(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create a procedure DAG."""
        return self._request("POST", "/api/procedures", json=payload)

    def get_procedure(self, uuid: str) -> Dict[str, Any]:
        """Get a compiled procedure DAG."""
        return self._request("GET", f"/api/procedures/{self._quote(uuid)}")

    def insert_procedure_step(self, uuid: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Insert a step into a procedure DAG."""
        return self._request("POST", f"/api/procedures/{self._quote(uuid)}/steps", json=payload)

    def generalize_procedure(self, uuid: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create a generalized reusable procedure variant."""
        return self._request("POST", f"/api/procedures/{self._quote(uuid)}/generalize", json=payload)

    def import_procedure_json(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Import a JSON procedure definition."""
        return self._request("POST", "/api/procedures/import-json", json=payload)

    def import_json_procedure(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for import_procedure_json."""
        return self.import_procedure_json(payload)

    def repair_procedure_selector(self, uuid: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Record repaired selector evidence for a procedure step."""
        return self._request("POST", f"/api/procedures/{self._quote(uuid)}/repair-selector", json=payload)

    def search_procedures(
        self,
        query: Any,
        top_k: Optional[int] = None
    ) -> Dict[str, Any]:
        """Search procedure DAGs."""
        payload = query.copy() if isinstance(query, dict) else {"query": query}
        if top_k is not None:
            payload["topK"] = top_k
        return self._request("POST", "/api/procedures/search", json=payload)

    # ===== Logic DAGs =====

    def create_syllogism(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create a predicate-logic syllogism DAG."""
        return self._request("POST", "/api/logic/syllogisms", json=payload)

    def get_syllogism(self, uuid: str) -> Dict[str, Any]:
        """Get a compiled syllogism DAG."""
        return self._request("GET", f"/api/logic/syllogisms/{self._quote(uuid)}")

    # ===== App Scenario Primitives =====

    def register_market_match(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Register a market offer/want intent."""
        return self._request("POST", "/api/market/matches/register", json=payload)

    def search_market_matches(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Search matching market intents."""
        return self._request("POST", "/api/market/matches/search", json=payload)

    def subscribe_channel(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Subscribe an actor to a concept-tag channel."""
        return self._request("POST", "/api/channels/subscribe", json=payload)

    def post_channel_message(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Post a message to a concept-tag channel."""
        return self._request("POST", "/api/channels/messages", json=payload)

    def get_channel_feed(self, actor_id: str) -> Dict[str, Any]:
        """Get a channel feed for an actor."""
        return self._request("GET", "/api/channels/feed", params={"actorId": actor_id})

    def create_repeating_event(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create a repeating event object."""
        return self._request("POST", "/api/events/repeating", json=payload)

    def rate_entity(self, uuid: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Rate a ConceptObject."""
        return self._request("POST", f"/api/ratings/{self._quote(uuid)}", json=payload)

    def get_ratings(self, uuid: str) -> Dict[str, Any]:
        """Get rating summary and evidence for a ConceptObject."""
        return self._request("GET", f"/api/ratings/{self._quote(uuid)}")

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
        strength: Optional[float] = None,
        vote_score: Optional[float] = None,
        source_rel: Optional[str] = None,
        status: Optional[str] = None,
        prev_assertion_id: Optional[str] = None,
        provenance: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create an assertion"""
        data = {
            "subject": subject,
            "predicate": predicate,
            "object": obj,
            "truth": truth,
            "source": source,
            "strength": strength,
            "voteScore": vote_score,
            "sourceRel": source_rel,
            "status": status,
            "prevAssertionId": prev_assertion_id,
            "provenance": provenance
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

    def vote_assertion(self, assertion_id: str, delta: float = 1) -> Dict[str, Any]:
        """Adjust vote score for an assertion."""
        return self._request(
            "POST",
            f"/api/assertions/{self._quote(assertion_id)}/vote",
            json={"delta": delta}
        )

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

    def explain_entity(
        self,
        entity_id: str,
        predicate: Optional[str] = None
    ) -> Dict[str, Any]:
        """Explain resolved values for an entity."""
        params = {}
        if predicate:
            params["predicate"] = predicate
        return self._request(
            "GET",
            f"/api/entities/{self._quote(entity_id)}/explain",
            params=params
        )

    def get_explain(
        self,
        entity_id: str,
        predicate: Optional[str] = None
    ) -> Dict[str, Any]:
        """Alias for explain_entity."""
        return self.explain_entity(entity_id, predicate)

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

