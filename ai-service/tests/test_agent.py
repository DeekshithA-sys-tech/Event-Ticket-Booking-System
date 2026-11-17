"""
Automated tests for EventPulse AI Microservice.
Verifies health, intent parsing, tool dispatching, RBAC, and two-phase confirmations.
"""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.models.schemas import ChatRequest, ConfirmationState, UserContext

client = TestClient(app)


def test_health_check():
    """Verify /health returns ok status and service identity."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "eventpulse-ai-agent"


def test_default_greeting():
    """Verify standard greetings return grounded capability guidance."""
    req = {
        "conversation_id": "test-conv-1",
        "message": "Hello, who are you and what can you do?",
        "user": {"role": "customer"},
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "EventPulse AI Assistant" in data["message"]
    assert data["requires_confirmation"] is False
    assert len(data["tool_calls_used"]) == 0


@pytest.mark.asyncio
async def test_search_events_tool_dispatch():
    """Verify event search triggers search_events tool and synthesizes response."""
    mock_events = [
        {
            "_id": "60d5ec49f1b24c1d88b42001",
            "title": "Bangalore Tech Summit 2026",
            "date": "2026-12-01T10:00:00.000Z",
            "venue": {"city": "Bangalore"},
            "price": 499,
        }
    ]

    with patch("app.utils.http_client.express_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": {"events": mock_events},
        }

        req = {
            "conversation_id": "test-search-1",
            "message": "Find tech events in Bangalore",
            "user": {"role": "customer"},
        }
        response = client.post("/api/chat", json=req)
        assert response.status_code == 200
        data = response.json()
        assert len(data["tool_calls_used"]) > 0
        assert data["tool_calls_used"][0]["name"] == "search_events"
        assert "Bangalore Tech Summit 2026" in data["message"]


@pytest.mark.asyncio
async def test_seat_availability_tool():
    """Verify seat availability query triggers get_seat_availability."""
    mock_seat_data = {
        "eventId": "507f1f77bcf86cd799439011",
        "title": "Arijit Singh Live",
        "totalSeats": 100,
        "availableSeats": 42,
        "lockedSeats": 5,
        "bookedSeats": 53,
    }

    with patch("app.utils.http_client.express_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": mock_seat_data,
        }

        req = {
            "conversation_id": "test-seats-1",
            "message": "Show seats for 507f1f77bcf86cd799439011",
            "user": {"role": "customer"},
        }
        response = client.post("/api/chat", json=req)
        assert response.status_code == 200
        data = response.json()
        assert "Available Seats" in data["message"]
        assert "42 / 100" in data["message"]


def test_booking_requires_human_confirmation():
    """Verify booking state change halts and requests explicit confirmation."""
    req = {
        "conversation_id": "test-book-confirm-1",
        "message": "Book seat A-1 for event 507f1f77bcf86cd799439011",
        "user": {"role": "customer"},
        "auth_token": "mock-jwt-token",
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["requires_confirmation"] is True
    assert data["pending_action"] is not None
    assert data["pending_action"]["action"] == "create_booking"
    assert "A-1" in data["pending_action"]["summary"]


@pytest.mark.asyncio
async def test_confirmed_booking_executes():
    """Verify that providing confirmed: true executes the booking."""
    with patch("app.utils.http_client.express_client.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = {
            "success": True,
            "message": "Booking confirmed successfully",
            "data": {"booking": {"_id": "bkg_12345", "status": "confirmed"}},
        }

        req = {
            "conversation_id": "test-book-execute-1",
            "message": "Yes, confirm my booking",
            "user": {"role": "customer"},
            "auth_token": "mock-jwt-token",
            "confirmation_state": {
                "confirmed": True,
                "action": "create_booking",
                "payload": {"event_id": "507f1f77bcf86cd799439011", "seat_ids": ["A-1"]},
            },
        }
        response = client.post("/api/chat", json=req)
        assert response.status_code == 200
        data = response.json()
        assert data["requires_confirmation"] is False


def test_cancellation_requires_human_confirmation():
    """Verify ticket cancellation halts and requests explicit confirmation."""
    req = {
        "conversation_id": "test-cancel-confirm-1",
        "message": "Cancel booking 507f1f77bcf86cd799439012",
        "user": {"role": "customer"},
        "auth_token": "mock-jwt-token",
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["requires_confirmation"] is True
    assert data["pending_action"] is not None
    assert data["pending_action"]["action"] == "cancel_booking"


def test_rbac_customer_denied_organizer_analytics():
    """Verify regular customer cannot access organizer analytics."""
    req = {
        "conversation_id": "test-rbac-1",
        "message": "Show sales analytics and revenue",
        "user": {"role": "customer"},
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "only accessible to event organizers" in data["message"]


@pytest.mark.asyncio
async def test_rbac_organizer_accesses_analytics():
    """Verify organizer role successfully retrieves analytics."""
    mock_analytics = {
        "totalRevenue": 150000.0,
        "totalTicketsSold": 320,
        "totalEvents": 4,
    }

    with patch("app.utils.http_client.express_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": mock_analytics,
        }

        req = {
            "conversation_id": "test-organizer-analytics",
            "message": "Show sales analytics and revenue",
            "user": {"role": "organizer"},
            "auth_token": "organizer-jwt-token",
        }
        response = client.post("/api/chat", json=req)
        assert response.status_code == 200
        data = response.json()
        assert "Organizer Dashboard Overview" in data["message"]
        assert len(data["tool_calls_used"]) > 0
        assert data["tool_calls_used"][0]["name"] == "get_organizer_analytics"


@pytest.mark.asyncio
async def test_get_my_bookings_with_dict_seats():
    """Verify get_my_bookings formats safely when seats are list of subdocument dicts."""
    mock_bookings = [
        {
            "_id": "60d5ec49f1b24c1d88b42002",
            "bookingId": "TKT-20261117-ABC12",
            "event": {"title": "Neon Cyber Symphony 2026"},
            "status": "confirmed",
            "seats": [
                {"seatId": "A-3", "row": "A", "seatNumber": 3},
                {"seatId": "A-4", "row": "A", "seatNumber": 4},
            ],
            "totalAmount": 3000,
        }
    ]

    with patch("app.utils.http_client.express_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": mock_bookings,
        }

        req = {
            "conversation_id": "test-my-bookings-dict-seats",
            "message": "Show my bookings",
            "user": {"role": "customer"},
            "auth_token": "mock-jwt-token",
        }
        response = client.post("/api/chat", json=req)
        assert response.status_code == 200
        data = response.json()
        assert "Your Bookings" in data["message"]
        assert "Neon Cyber Symphony 2026" in data["message"]
        assert "A-3, A-4" in data["message"]
        assert "TKT-20261117-ABC12" in data["message"]

