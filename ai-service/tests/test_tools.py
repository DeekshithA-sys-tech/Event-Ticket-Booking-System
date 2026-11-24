import pytest
from app.agent.tool_registry import tool_registry
from app.models.schemas import UserContext


def test_tool_registry_contains_required_tools():
    expected_tools = [
        "search_events",
        "check_availability",
        "get_my_bookings",
        "get_organizer_analytics",
        "lock_seats",
        "confirm_booking",
        "cancel_booking",
    ]
    for tool_name in expected_tools:
        assert tool_name in tool_registry.tools


def test_tool_registry_role_filtering():
    customer_user = UserContext(role="customer")
    organizer_user = UserContext(role="organizer")

    customer_tools = [t.name for t in tool_registry.get_allowed_tools_for_user(customer_user)]
    organizer_tools = [t.name for t in tool_registry.get_allowed_tools_for_user(organizer_user)]

    # Customers cannot access organizer analytics
    assert "get_organizer_analytics" not in customer_tools
    # Organizers can access organizer analytics
    assert "get_organizer_analytics" in organizer_tools


def test_write_action_classification():
    assert tool_registry.is_write_action("lock_seats") is True
    assert tool_registry.is_write_action("confirm_booking") is True
    assert tool_registry.is_write_action("cancel_booking") is True
    assert tool_registry.is_write_action("search_events") is False
    assert tool_registry.is_write_action("check_availability") is False


def test_confirmation_summary_generation():
    summary = tool_registry.build_confirmation_summary(
        "cancel_booking", {"booking_id": "TKT-20261117-ABC12"}
    )
    assert "TKT-20261117-ABC12" in summary
    assert "cancel" in summary.lower()
