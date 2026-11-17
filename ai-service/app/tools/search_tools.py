"""
Search and Event Discovery AI Tools.
"""
from typing import Any, Dict, Optional
from app.tools.registry import tool_registry
from app.utils.http_client import express_client


async def handle_search_events(args: Dict[str, Any], auth_token: Optional[str] = None, user_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    params = {}
    if args.get("search"):
        params["q"] = args["search"]
    if args.get("city"):
        params["city"] = args["city"]
    if args.get("category"):
        params["category"] = args["category"]
    if args.get("min_price") is not None:
        params["minPrice"] = args["min_price"]
    if args.get("max_price") is not None:
        params["maxPrice"] = args["max_price"]

    # Express /search/events endpoint
    resp = await express_client.get("search/events", params=params, token=auth_token)
    return resp


async def handle_get_event_details(args: Dict[str, Any], auth_token: Optional[str] = None, user_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    event_id = args.get("event_id")
    if not event_id:
        return {"success": False, "message": "Event ID is required"}
    resp = await express_client.get(f"events/{event_id}", token=auth_token)
    return resp


# Register tools
tool_registry.register(
    name="search_events",
    description="Search for upcoming events by keyword, city, category, or price range.",
    parameters={
        "type": "object",
        "properties": {
            "search": {"type": "string", "description": "Free-text search query (title or description)"},
            "city": {"type": "string", "description": "Filter by city name (e.g. Bangalore, Mumbai)"},
            "category": {"type": "string", "description": "Filter by category slug (e.g. music, comedy, tech)"},
            "min_price": {"type": "number", "description": "Minimum ticket price in INR"},
            "max_price": {"type": "number", "description": "Maximum ticket price in INR"},
        },
    },
    handler=handle_search_events,
    allowed_roles=["customer", "organizer", "admin"],
)

tool_registry.register(
    name="get_event_details",
    description="Fetch full details for a specific event by its ID.",
    parameters={
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "The 24-character hexadecimal MongoDB ID of the event"},
        },
        "required": ["event_id"],
    },
    handler=handle_get_event_details,
    allowed_roles=["customer", "organizer", "admin"],
)
