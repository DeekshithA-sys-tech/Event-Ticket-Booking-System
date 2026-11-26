from typing import Any, Dict, List, Optional
from app.agent.http_client import express_client
from app.core.logging import logger
from app.models.schemas import PendingAction, UserContext


class ToolDefinition:
    def __init__(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        required_role: Optional[str] = None,
        is_write_action: bool = False,
    ):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.required_role = required_role
        self.is_write_action = is_write_action


class ToolRegistry:
    """
    Central registry for live tools calling Express domain routes with user JWT.
    Enforces RBAC and two-phase human confirmation on write actions.
    """

    def __init__(self):
        self.tools: Dict[str, ToolDefinition] = {}
        self._register_default_tools()

    def _register_default_tools(self):
        # 1. Search Events
        self.register(
            ToolDefinition(
                name="search_events",
                description="Search published events by query keyword, city, category, or price range.",
                parameters={
                    "q": "Optional search keyword or artist name",
                    "city": "Optional city name (e.g. Bangalore, Mumbai, Mysuru)",
                    "category": "Optional category name",
                    "max_price": "Optional maximum ticket price",
                },
                required_role=None,
                is_write_action=False,
            )
        )

        # 2. Check Live Seat Availability
        self.register(
            ToolDefinition(
                name="check_availability",
                description="Fetch real-time live seat layout and availability counts for a specific event.",
                parameters={"event_id": "Event ID string"},
                required_role=None,
                is_write_action=False,
            )
        )

        # 3. Get User Bookings
        self.register(
            ToolDefinition(
                name="get_my_bookings",
                description="Retrieve the authenticated user's ticket booking passes and orders.",
                parameters={"limit": "Maximum number of bookings (default 5)"},
                required_role="customer",
                is_write_action=False,
            )
        )

        # 4. Get Organizer Analytics
        self.register(
            ToolDefinition(
                name="get_organizer_analytics",
                description="Retrieve revenue metrics, ticket sales volume, and attendee stats for organizers.",
                parameters={},
                required_role="organizer",
                is_write_action=False,
            )
        )

        # 5. Lock Seats (Write)
        self.register(
            ToolDefinition(
                name="lock_seats",
                description="Place a temporary 10-minute hold lock on selected seat IDs for an event.",
                parameters={
                    "event_id": "Event ID string",
                    "seat_ids": "List of seat IDs to lock (e.g. ['A-1', 'A-2'])",
                },
                required_role="customer",
                is_write_action=True,
            )
        )

        # 6. Confirm Booking (Write)
        self.register(
            ToolDefinition(
                name="confirm_booking",
                description="Confirm and pay for locked seats, generating a confirmed booking pass.",
                parameters={
                    "event_id": "Event ID string",
                    "seat_ids": "List of seat IDs",
                    "payment_method": "Payment method (upi, card, mock)",
                },
                required_role="customer",
                is_write_action=True,
            )
        )

        # 7. Cancel Booking (Write)
        self.register(
            ToolDefinition(
                name="cancel_booking",
                description="Cancel an existing booking and initiate refund processing.",
                parameters={
                    "booking_id": "Booking ID string (e.g. TKT-20261117-ABC12)",
                    "reason": "Cancellation reason string",
                },
                required_role="customer",
                is_write_action=True,
            )
        )

        # 8. Create Event (Write - Organizer/Admin)
        self.register(
            ToolDefinition(
                name="create_event",
                description="Create and publish a new event with seat layout, pricing, and venue details.",
                parameters={
                    "title": "Event title",
                    "description": "Event description",
                    "category": "Category name or ID (e.g. Comedy, Music, Theater)",
                    "city": "City name (e.g. Bangalore, Mumbai)",
                    "venue": "Venue name",
                    "ticketPrice": "Ticket price in INR",
                    "totalSeats": "Total seat capacity",
                    "date": "Event date in YYYY-MM-DD format",
                    "time": "Event time in HH:MM format",
                },
                required_role="organizer",
                is_write_action=True,
            )
        )

        # 9. List Users (Admin only)
        self.register(
            ToolDefinition(
                name="list_users",
                description="List registered platform users, roles, and account status (Admin only).",
                parameters={
                    "role": "Optional filter by role (customer, organizer, admin)",
                    "search": "Optional search term for name or email",
                    "limit": "Maximum results to return (default 10)",
                },
                required_role="admin",
                is_write_action=False,
            )
        )

    def register(self, tool_def: ToolDefinition):
        self.tools[tool_def.name] = tool_def

    def get_allowed_tools_for_user(self, user: Optional[UserContext]) -> List[ToolDefinition]:
        role = user.role if user else "customer"
        allowed = []
        for tool in self.tools.values():
            if not tool.required_role:
                allowed.append(tool)
            elif tool.required_role == "customer":
                allowed.append(tool)
            elif tool.required_role == "organizer" and role in ["organizer", "admin"]:
                allowed.append(tool)
            elif tool.required_role == "admin" and role == "admin":
                allowed.append(tool)
        return allowed

    def is_write_action(self, tool_name: str) -> bool:
        tool = self.tools.get(tool_name)
        return tool.is_write_action if tool else False

    def build_confirmation_summary(self, tool_name: str, payload: Dict[str, Any]) -> str:
        """Constructs a clear human-readable summary of the proposed write action."""
        if tool_name == "lock_seats":
            ev_id = payload.get("event_id", "Event")
            seat_ids = payload.get("seat_ids", [])
            seats_str = ", ".join(
                [s.get("seatId", str(s)) if isinstance(s, dict) else str(s) for s in seat_ids]
            )
            return f"Please confirm locking {len(seat_ids)} seat(s) ({seats_str}) for 10 minutes."

        elif tool_name == "confirm_booking":
            ev_id = payload.get("event_id", "Event")
            seat_ids = payload.get("seat_ids", [])
            seats_str = ", ".join(
                [s.get("seatId", str(s)) if isinstance(s, dict) else str(s) for s in seat_ids]
            )
            return f"Please confirm reservation and payment for {len(seat_ids)} seat(s) ({seats_str})."

        elif tool_name == "cancel_booking":
            b_id = payload.get("booking_id", "Booking")
            return (
                f"Please confirm cancellation of booking #{b_id}. "
                f"Seats will be released immediately and a refund will be processed per platform policy."
            )

        elif tool_name == "create_event":
            t = payload.get("title", "Event")
            c = payload.get("city", "")
            p = payload.get("ticketPrice", "")
            s = payload.get("totalSeats", "")
            cat = payload.get("category", "")
            return f"Please confirm creating event '{t}' ({cat}) in {c} with {s} seats at ₹{p}."

        return f"Please confirm action: {tool_name} with parameters: {payload}"

    async def execute(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        token: Optional[str] = None,
        user: Optional[UserContext] = None,
    ) -> Dict[str, Any]:
        """Dispatches tool execution to the appropriate Express gateway endpoint."""
        logger.info(f"[ToolRegistry] Executing tool '{tool_name}' with args {arguments}")

        # Check role permission
        tool_def = self.tools.get(tool_name)
        if not tool_def:
            return {"success": False, "error": f"Tool '{tool_name}' is not registered."}

        role = user.role if user else "customer"
        if tool_def.required_role == "admin" and role != "admin":
            return {
                "success": False,
                "error": f"Access denied: '{tool_name}' requires admin role permissions.",
            }
        elif tool_def.required_role == "organizer" and role not in ["organizer", "admin"]:
            return {
                "success": False,
                "error": f"Access denied: '{tool_name}' requires organizer role permissions.",
            }

        # 1. Search Events
        if tool_name == "search_events":
            params = {}
            if arguments.get("q"):
                params["search"] = arguments["q"]
            if arguments.get("city"):
                params["city"] = arguments["city"]
            if arguments.get("category"):
                params["category"] = arguments["category"]
            if arguments.get("max_price"):
                params["maxPrice"] = arguments["max_price"]
            return await express_client.get("/search/events", token=token, params=params)

        # 2. Check Live Seat Availability
        elif tool_name == "check_availability":
            ev_id = arguments.get("event_id")
            if not ev_id:
                return {"success": False, "error": "event_id parameter is required."}
            return await express_client.get(f"/search/events/{ev_id}/seats", token=token)

        # 3. Get User Bookings
        elif tool_name == "get_my_bookings":
            limit = arguments.get("limit", 5)
            return await express_client.get("/bookings/my-bookings", token=token, params={"limit": limit})

        # 4. Get Organizer Analytics
        elif tool_name == "get_organizer_analytics":
            return await express_client.get("/analytics/overview", token=token)

        # 5. Lock Seats (Write)
        elif tool_name == "lock_seats":
            body = {
                "eventId": arguments.get("event_id"),
                "seatIds": arguments.get("seat_ids", []),
            }
            return await express_client.post("/bookings/lock-seats", body=body, token=token)

        # 6. Confirm Booking (Write)
        elif tool_name == "confirm_booking":
            body = {
                "eventId": arguments.get("event_id"),
                "seatIds": arguments.get("seat_ids", []),
                "paymentMethod": arguments.get("payment_method", "mock"),
            }
            # Attempt locking seats first to ensure lock ownership
            await express_client.post("/bookings/lock-seats", body=body, token=token)
            return await express_client.post("/bookings/confirm", body=body, token=token)

        # 7. Cancel Booking (Write)
        elif tool_name == "cancel_booking":
            booking_id = arguments.get("booking_id")
            reason = arguments.get("reason", "Cancelled by customer via AI Assistant")
            return await express_client.post(
                f"/bookings/{booking_id}/cancel", body={"reason": reason}, token=token
            )

        # 8. Create Event (Write)
        elif tool_name == "create_event":
            body = {
                "title": arguments.get("title", "Live Event"),
                "description": arguments.get("description") or f"{arguments.get('title')} live event",
                "category": arguments.get("category", "Comedy"),
                "city": arguments.get("city", "Bangalore"),
                "venue": arguments.get("venue", "EventPulse Arena"),
                "ticketPrice": float(arguments.get("ticketPrice", 200)),
                "totalSeats": int(arguments.get("totalSeats", 50)),
                "date": arguments.get("date", "2026-12-01"),
                "time": arguments.get("time", "19:00"),
                "duration": int(arguments.get("duration", 120)),
                "status": "published",
            }
            return await express_client.post("/events", body=body, token=token)

        # 9. List Users (Admin only)
        elif tool_name == "list_users":
            params = {}
            if arguments.get("role"):
                params["role"] = arguments["role"]
            if arguments.get("search"):
                params["search"] = arguments["search"]
            if arguments.get("limit"):
                params["limit"] = arguments["limit"]
            return await express_client.get("/users", token=token, params=params)

        return {"success": False, "error": f"Unhandled tool: {tool_name}"}


tool_registry = ToolRegistry()
