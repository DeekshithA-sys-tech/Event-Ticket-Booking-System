"""
Unit tests for AI Tools and Registry.
"""
import pytest
from unittest.mock import AsyncMock, patch
from app.tools.registry import tool_registry
from app.tools.search_tools import handle_search_events, handle_get_event_details
from app.tools.seat_tools import handle_get_seat_availability
from app.tools.booking_tools import handle_get_user_bookings, handle_create_booking, handle_cancel_booking


def test_registry_role_filtering():
    """Verify tool filtering based on user roles."""
    customer_tools = [t["name"] for t in tool_registry.get_tools_for_role("customer")]
    organizer_tools = [t["name"] for t in tool_registry.get_tools_for_role("organizer")]
    admin_tools = [t["name"] for t in tool_registry.get_tools_for_role("admin")]

    assert "search_events" in customer_tools
    assert "get_seat_availability" in customer_tools
    assert "get_user_bookings" in customer_tools
    assert "get_organizer_analytics" not in customer_tools

    assert "get_organizer_analytics" in organizer_tools
    assert "get_organizer_analytics" in admin_tools


@pytest.mark.asyncio
async def test_search_events_handler():
    with patch("app.utils.http_client.express_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"success": True, "data": []}
        res = await handle_search_events({"search": "rock", "city": "Mumbai", "category": "music"})
        assert res["success"] is True
        mock_get.assert_called_once()
        args, kwargs = mock_get.call_args
        assert args[0] == "search/events"
        assert kwargs["params"]["q"] == "rock"
        assert kwargs["params"]["city"] == "Mumbai"
        assert kwargs["params"]["category"] == "music"


@pytest.mark.asyncio
async def test_seat_availability_handler_cached_and_fallback():
    # Case 1: cached endpoint works
    with patch("app.utils.http_client.express_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = {"success": True, "data": {"available": 10}}
        res = await handle_get_seat_availability({"event_id": "507f1f77bcf86cd799439011"})
        assert res["success"] is True
        assert res["data"]["available"] == 10

    # Case 2: cached endpoint fails, falls back to direct event data
    with patch("app.utils.http_client.express_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = [
            {"success": False},  # first call to search/events/.../seats fails
            {                     # second call to events/... succeeds
                "success": True,
                "data": {
                    "title": "Fallback Concert",
                    "seats": [
                        {"status": "available"},
                        {"status": "locked"},
                        {"status": "booked"},
                    ],
                },
            },
        ]
        res = await handle_get_seat_availability({"event_id": "507f1f77bcf86cd799439011"})
        assert res["success"] is True
        assert res["data"]["availableSeats"] == 1
        assert res["data"]["lockedSeats"] == 1
        assert res["data"]["bookedSeats"] == 1


@pytest.mark.asyncio
async def test_auth_enforcement_in_booking_tools():
    # Calling booking tools without token returns auth error
    bookings_res = await handle_get_user_bookings({}, auth_token=None)
    assert bookings_res["success"] is False
    assert "Authentication required" in bookings_res["message"]

    create_res = await handle_create_booking({"event_id": "123", "seat_ids": ["A-1"]}, auth_token=None)
    assert create_res["success"] is False
    assert "Authentication required" in create_res["message"]

    cancel_res = await handle_cancel_booking({"booking_id": "123"}, auth_token=None)
    assert cancel_res["success"] is False
    assert "Authentication required" in cancel_res["message"]
