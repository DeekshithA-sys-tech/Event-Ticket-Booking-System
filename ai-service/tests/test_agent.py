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


def test_user_details_query_authenticated():
    """Verify authenticated user asking for details receives their account profile."""
    req = {
        "conversation_id": "test-user-details",
        "message": "get the user details",
        "user": {
            "user_id": "usr_123456",
            "email": "organizer@eventpulse.com",
            "role": "organizer",
            "is_authenticated": True,
        },
        "auth_token": "valid-jwt-token",
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "User Account Details" in data["message"]
    assert "organizer@eventpulse.com" in data["message"]
    assert "Organizer" in data["message"]
    assert data["is_rag_grounded"] is False


def test_user_details_query_guest():
    """Verify unauthenticated guest asking for details is prompted to sign in."""
    req = {
        "conversation_id": "test-user-guest",
        "message": "who am i and get user details",
        "user": {"role": "customer", "is_authenticated": False},
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "Guest" in data["message"]
    assert "Please sign in" in data["message"]
    assert data["is_rag_grounded"] is False


def test_create_event_denied_for_customer():
    """Verify customer role is told organizer permissions are required to create events."""
    req = {
        "conversation_id": "test-create-event-customer",
        "message": 'create an event called "laugh" comedy show in banglore with 250 tickets each ticket price is 200',
        "user": {"role": "customer"},
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "Organizer Permission Required" in data["message"]
    assert data["requires_confirmation"] is False


def test_create_event_organizer_prepares_confirmation():
    """Verify organizer role asking to create event prepares PendingAction with parsed slots."""
    req = {
        "conversation_id": "test-create-event-organizer",
        "message": 'create an event called "laugh" comedy show in banglore with 250 tickets each ticket price is 200',
        "user": {
            "user_id": "usr_org999",
            "email": "comedy@bangalore.org",
            "role": "organizer",
            "is_authenticated": True,
        },
        "auth_token": "valid-organizer-jwt",
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["requires_confirmation"] is True
    assert data["pending_action"] is not None
    assert data["pending_action"]["action"] == "create_event"

    payload = data["pending_action"]["payload"]
    assert "Laugh" in payload["title"]
    assert payload["category"] == "Comedy"
    assert payload["city"] == "Bangalore"
    assert payload["totalSeats"] == 250
    assert payload["ticketPrice"] == 200.0


def test_unrelated_query_gracefully_refused_no_hallucinated_citations():
    """Verify completely out-of-scope query refuses gracefully without dumping random policy chunks."""
    req = {
        "conversation_id": "test-unrelated",
        "message": "how do I bake a chocolate cake?",
        "user": {"role": "customer"},
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "I could not find specific documentation" in data["message"]
    assert data["is_rag_grounded"] is False
    assert len(data["citations"]) == 0


@pytest.mark.asyncio
async def test_llm_client_with_gemini():
    """Verify LLM client formats and triggers Gemini API when GEMINI_API_KEY is configured."""
    from app.generation.llm_client import LLMClient
    from unittest.mock import MagicMock

    with patch.dict("os.environ", {"GEMINI_API_KEY": "fake-gemini-key"}):
        llm = LLMClient()
        assert llm.is_available() is True

        with patch("google.genai.Client") as mock_genai_cls:
            mock_client = MagicMock()
            mock_genai_cls.return_value = mock_client
            mock_response = MagicMock()
            mock_response.text = "You can cancel up to 24 hours in advance [1] for an 80% refund [2]."
            mock_client.models.generate_content.return_value = mock_response

            result = await llm.generate_grounded_response(
                question="Can I cancel?",
                context_text="[1] (Refund Policy): Cancel up to 24 hours prior.",
            )
            assert result is not None
            assert "[1]" in result
            assert "80%" in result


@pytest.mark.asyncio
async def test_admin_list_users_tool_dispatch():
    mock_users_data = {
        "users": [
            {"name": "Admin User", "email": "admin@eventpulse.com", "role": "admin", "isActive": True},
            {"name": "Regular User", "email": "customer@eventpulse.com", "role": "customer", "isActive": True},
        ],
        "total": 2,
    }

    with patch("app.agent.http_client.express_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {
            "success": True,
            "data": mock_users_data,
        }

        req = {
            "conversation_id": "test-list-users",
            "message": "list all the users",
            "user": {"role": "admin", "is_authenticated": True, "email": "admin@eventpulse.com"},
            "auth_token": "admin-jwt-token",
        }
        response = client.post("/api/chat", json=req)
        assert response.status_code == 200
        data = response.json()
        assert "Registered Platform Users" in data["message"]
        assert "admin@eventpulse.com" in data["message"]


def test_admin_list_users_forbidden_for_customer():
    req = {
        "conversation_id": "test-list-users-customer",
        "message": "list all the users",
        "user": {"role": "customer", "is_authenticated": True, "email": "customer@eventpulse.com"},
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "Admin Permission Required" in data["message"]


def test_user_role_intent_handling():
    req = {
        "conversation_id": "test-role-intent",
        "message": "am i admin or costumer or organiser ?",
        "user": {"role": "admin", "email": "admin@eventpulse.com", "is_authenticated": True},
        "auth_token": "valid-token",
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "Admin" in data["message"]
    assert "Active & Verified" in data["message"]


def test_golden_dataset_query_intent():
    req = {
        "conversation_id": "test-golden-dataset",
        "message": "list all the golden dataset",
        "user": {"role": "customer"},
    }
    response = client.post("/api/chat", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "Golden Evaluation Benchmark" in data["message"]
    assert "eval_pol_01" in data["message"]



