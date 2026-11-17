"""
Analytics AI Tools for Organizers and Administrators.
"""
from typing import Any, Dict, Optional
from app.tools.registry import tool_registry
from app.utils.http_client import express_client


async def handle_get_organizer_analytics(args: Dict[str, Any], auth_token: Optional[str] = None, user_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not auth_token:
        return {"success": False, "message": "Authentication required. Please sign in with an organizer account."}
    return await express_client.get("analytics/overview", token=auth_token)


async def handle_get_event_analytics(args: Dict[str, Any], auth_token: Optional[str] = None, user_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not auth_token:
        return {"success": False, "message": "Authentication required."}
    event_id = args.get("event_id")
    if not event_id:
        return {"success": False, "message": "Event ID is required."}
    return await express_client.get(f"analytics/events/{event_id}", token=auth_token)


# Register tools
tool_registry.register(
    name="get_organizer_analytics",
    description="Retrieve high-level sales overview, total revenue, tickets sold, and active event metrics.",
    parameters={"type": "object", "properties": {}},
    handler=handle_get_organizer_analytics,
    allowed_roles=["organizer", "admin"],
)

tool_registry.register(
    name="get_event_analytics",
    description="Retrieve detailed analytics for a specific event including ticket velocity and revenue breakdown.",
    parameters={
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "The 24-character hexadecimal MongoDB ID of the event"},
        },
        "required": ["event_id"],
    },
    handler=handle_get_event_analytics,
    allowed_roles=["organizer", "admin"],
)
