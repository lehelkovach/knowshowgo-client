"""
KnowShowGo Python REST API Client

Provides a Python client for the KnowShowGo REST API.
"""

import requests
from typing import Dict, Any, List, Optional
import json


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

    # ===== Health Check =====

    def health_check(self) -> Dict[str, Any]:
        """Check API health"""
        return self._request("GET", "/health")


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

