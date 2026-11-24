import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "eventpulse-rag-agent"
    assert data["indexed_chunks"] > 0


def test_direct_rag_policy_query_with_citations():
    """Verify direct RAG query retrieves cancellation policy and provides citations."""
    req = {
        "question": "Can I cancel my ticket 5 days before the event, and how much refund do I get?",
        "top_k": 3,
    }
    response = client.post("/api/rag/query", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "cancellation" in data["answer"].lower() or "refund" in data["answer"].lower()
    assert len(data["citations"]) > 0
    assert data["sources_count"] > 0
    # Check that answer contains citation brackets
    assert "[" in data["answer"] and "]" in data["answer"]


def test_direct_rag_venue_guidelines():
    """Verify venue rules and bag policy retrieval."""
    req = {
        "question": "What is the bag policy and what items are prohibited at the venue?",
        "top_k": 3,
    }
    response = client.post("/api/rag/query", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "bag" in data["answer"].lower() or "prohibited" in data["answer"].lower()
    assert len(data["citations"]) > 0


def test_direct_rag_seat_hold_rules():
    """Verify 10-minute seat hold timer policy retrieval."""
    req = {
        "question": "How long are seats held while checking out?",
        "top_k": 3,
    }
    response = client.post("/api/rag/query", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "10" in data["answer"] or "hold" in data["answer"].lower()
    assert len(data["citations"]) > 0
