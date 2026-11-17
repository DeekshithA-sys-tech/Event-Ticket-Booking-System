"""
Seat Availability AI Tools.
"""
from typing import Any, Dict, Optional
from app.tools.registry import tool_registry
from app.utils.http_client import express_client


async def handle_get_seat_availability(args: Dict[str, Any], auth_token: Optional[str] = None, user_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    event_id = args.get("event_id")
    if not event_id:
        return {"success": False, "message": "Event ID is required"}

    # First attempt the cached search seats endpoint
    resp = await express_client.get(f"search/events/{event_id}/seats", token=auth_token)
    if resp.get("success") and resp.get("data"):
        return resp

    # Fallback to direct event query
    event_resp = await express_client.get(f"events/{event_id}", token=auth_token)
    if not event_resp.get("success"):
        return event_resp

    event_data = event_resp.get("data", {})
    seats = event_data.get("seats", [])
    
    total = len(seats)
    available = sum(1 for s in seats if s.get("status") == "available")
    locked = sum(1 for s in seats if s.get("status") == "locked")
    booked = sum(1 for s in seats if s.get("status") == "booked")

    return {
        "success": True,
        "message": "Seat availability calculated successfully.",
        "data": {
            "eventId": event_id,
            "title": event_data.get("title", ""),
            "totalSeats": total,
            "availableSeats": available,
            "lockedSeats": locked,
            "bookedSeats": booked,
        },
    }


# Register tool
tool_registry.register(
    name="get_seat_availability",
    description="Check real-time seat availability, held seats, and booked seats for an event.",
    parameters={
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "The 24-character hexadecimal MongoDB ID of the event"},
        },
        "required": ["event_id"],
    },
    handler=handle_get_seat_availability,
    allowed_roles=["customer", "organizer", "admin"],
)
