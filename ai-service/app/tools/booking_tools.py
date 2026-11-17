"""
Booking Management AI Tools with Two-Phase Human Confirmation.
"""
from typing import Any, Dict, Optional
from app.tools.registry import tool_registry
from app.utils.http_client import express_client


async def handle_get_user_bookings(args: Dict[str, Any], auth_token: Optional[str] = None, user_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not auth_token:
        return {"success": False, "message": "Authentication required. Please sign in to view your bookings."}
    return await express_client.get("bookings/my-bookings", token=auth_token)


async def handle_create_booking(args: Dict[str, Any], auth_token: Optional[str] = None, user_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not auth_token:
        return {"success": False, "message": "Authentication required to book tickets."}

    event_id = args.get("event_id")
    seat_ids = args.get("seat_ids", [])
    if not event_id or not seat_ids:
        return {"success": False, "message": "Event ID and at least one seat ID are required."}

    # Step 1: Lock Seats in Redis (10-minute hold)
    lock_resp = await express_client.post("bookings/lock-seats", json_data={"eventId": event_id, "seatIds": seat_ids}, token=auth_token)
    if not lock_resp.get("success"):
        return {"success": False, "message": f"Could not lock seats: {lock_resp.get('message', 'Lock failed')}"}

    # Step 2: Confirm Booking in MongoDB
    confirm_resp = await express_client.post("bookings/confirm", json_data={"eventId": event_id, "seatIds": seat_ids}, token=auth_token)
    return confirm_resp


async def handle_cancel_booking(args: Dict[str, Any], auth_token: Optional[str] = None, user_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not auth_token:
        return {"success": False, "message": "Authentication required to cancel a booking."}

    booking_id = args.get("booking_id")
    if not booking_id:
        return {"success": False, "message": "Booking ID is required."}

    reason = args.get("reason", "Cancelled via EventPulse AI Assistant")
    return await express_client.post(f"bookings/{booking_id}/cancel", json_data={"reason": reason}, token=auth_token)


# Register tools
tool_registry.register(
    name="get_user_bookings",
    description="List active and past ticket bookings for the currently authenticated user.",
    parameters={"type": "object", "properties": {}},
    handler=handle_get_user_bookings,
    allowed_roles=["customer", "organizer", "admin"],
)

tool_registry.register(
    name="create_booking",
    description="Reserve seats and confirm ticket booking for an event. Requires user confirmation before execution.",
    parameters={
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "The 24-character hexadecimal MongoDB ID of the event"},
            "seat_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of seat IDs to book (e.g. ['A-1', 'A-2'])",
            },
        },
        "required": ["event_id", "seat_ids"],
    },
    handler=handle_create_booking,
    allowed_roles=["customer", "organizer", "admin"],
    requires_confirmation=True,
)

tool_registry.register(
    name="cancel_booking",
    description="Cancel an existing ticket booking and initiate refund. Requires user confirmation before execution.",
    parameters={
        "type": "object",
        "properties": {
            "booking_id": {"type": "string", "description": "The 24-character hexadecimal MongoDB ID of the booking to cancel"},
            "reason": {"type": "string", "description": "Optional cancellation reason"},
        },
        "required": ["booking_id"],
    },
    handler=handle_cancel_booking,
    allowed_roles=["customer", "organizer", "admin"],
    requires_confirmation=True,
)
