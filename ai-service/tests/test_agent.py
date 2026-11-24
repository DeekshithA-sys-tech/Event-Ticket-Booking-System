import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_default_greeting():
    req = {
        "conversation_id": "test-greeting",
        "message": "Hello! What can you do?",
        "user": {"role": "customer"},
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "EventPulse AI Assistant" in data["message"]
    assert data["requires_confirmation"] is False


def test_grounded_policy_query_via_chat():
    """Verify conversational questions about policy trigger hybrid RAG and provide citations."""
    req = {
        "conversation_id": "test-policy",
        "message": "Can I cancel my booking and what is the refund timeline?",
        "user": {"role": "customer"},
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["is_rag_grounded"] is True
    assert len(data["citations"]) > 0
    assert "[" in data["message"] and "]" in data["message"]


@pytest.mark.asyncio
async def test_search_events_tool_dispatch():
    mock_events = [
        {
            "_id": "60d5ec49f1b24c1d88b42001",
            "title": "Neon Cyber Symphony 2026",
            "city": "Bangalore",
            "venue": "Electronic City Amphitheatre",
            "date": "2026-12-15T18:00:00.000Z",
            "ticketPrice": 1200,
            "availableSeats": 120,
        }
    ]

    with patch("app.agent.http_client.express_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {"events": mock_events},
        }

        req = {
            "conversation_id": "test-search-events",
            "message": "Find events in Bangalore under 1500",
            "user": {"role": "customer"},
        }
        response = client.post("/api/chat", json=req)
        assert response.status_code == 200
        data = response.json()
        assert "Upcoming Live Events Found" in data["message"]
        assert len(data["event_cards"]) > 0
        assert data["event_cards"][0]["title"] == "Neon Cyber Symphony 2026"


@pytest.mark.asyncio
async def test_get_my_bookings_with_nested_dict_seats():
    """Regression test: verify seat subdocuments do not throw sequence item string error."""
    mock_bookings = [
        {
            "_id": "60d5ec49f1b24c1d88b42002",
            "bookingId": "TKT-20261117-XYZ99",
            "event": {"title": "Neon Cyber Symphony 2026"},
            "status": "confirmed",
            "seats": [
                {"seatId": "A-3", "row": "A", "seatNumber": 3},
                {"seatId": "A-4", "row": "A", "seatNumber": 4},
            ],
            "totalAmount": 2400,
        }
    ]

    with patch("app.agent.http_client.express_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": mock_bookings,
        }

        req = {
            "conversation_id": "test-my-bookings",
            "message": "Show my bookings",
            "user": {"role": "customer"},
            "auth_token": "mock-jwt-token",
        }
        response = client.post("/api/chat", json=req)
        assert response.status_code == 200
        data = response.json()
        assert "Your Bookings" in data["message"]
        assert "A-3, A-4" in data["message"]
        assert "TKT-20261117-XYZ99" in data["message"]


def test_two_phase_confirmation_on_cancellation():
    """Verify cancellation requests halt and prompt for human confirmation."""
    req = {
        "conversation_id": "test-cancel-confirm",
        "message": "Cancel booking TKT-20261117-XYZ99",
        "user": {"role": "customer"},
        "auth_token": "mock-jwt-token",
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["requires_confirmation"] is True
    assert data["pending_action"] is not None
    assert data["pending_action"]["action"] == "cancel_booking"
    assert "TKT-20261117-XYZ99" in data["pending_action"]["summary"]


@pytest.mark.asyncio
async def test_execute_confirmed_cancellation():
    """Verify executing confirmed cancellation triggers the backend cancellation route."""
    with patch("app.agent.http_client.express_client.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = {
            "success": True,
            "message": "Booking cancelled and seats released successfully.",
        }

        req = {
            "conversation_id": "test-confirm-execution",
            "message": "Yes, proceed with cancel",
            "user": {"role": "customer"},
            "auth_token": "mock-jwt-token",
            "confirmation_state": {
                "confirmed": True,
                "action": "cancel_booking",
                "payload": {"booking_id": "TKT-20261117-XYZ99"},
            },
        }
        response = client.post("/api/chat", json=req)
        assert response.status_code == 200
        data = response.json()
        assert "Booking Cancelled Successfully" in data["message"]
        assert data["requires_confirmation"] is False


def test_rbac_denies_customer_organizer_analytics():
    """Verify customer role cannot access organizer analytics."""
    req = {
        "conversation_id": "test-rbac-denied",
        "message": "Show sales analytics and revenue",
        "user": {"role": "customer"},
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "Access restricted" in data["message"]


@pytest.mark.asyncio
async def test_rbac_permits_organizer_analytics():
    """Verify organizer role retrieves organizer analytics."""
    mock_analytics = {
        "totalRevenue": 240000.0,
        "totalTicketsSold": 480,
        "totalEvents": 5,
    }

    with patch("app.agent.http_client.express_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": mock_analytics,
        }

        req = {
            "conversation_id": "test-rbac-allowed",
            "message": "Show sales analytics and revenue",
            "user": {"role": "organizer"},
            "auth_token": "organizer-jwt-token",
        }
        response = client.post("/api/chat", json=req)
        assert response.status_code == 200
        data = response.json()
        assert "Organizer Dashboard Overview" in data["message"]
        assert "240,000.00" in data["message"]
