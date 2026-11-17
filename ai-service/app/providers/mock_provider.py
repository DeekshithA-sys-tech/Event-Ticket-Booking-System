"""
Offline Mock Provider for zero-credit, deterministic intent parsing and tool invocation.
Enables full development, testing, and CI/CD without external API keys.
"""
import re
import uuid
from typing import Any, Dict, List, Optional
from app.models.schemas import ChatMessage
from app.providers.base import BaseAIProvider


class MockProvider(BaseAIProvider):
    """
    Offline Rule-Based AI Provider that simulates LLM reasoning and function calling.
    """

    async def generate_response(
        self,
        messages: List[ChatMessage],
        tools: List[Dict[str, Any]],
        system_prompt: str,
        user_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        # Check if the last message was a tool result
        if messages and messages[-1].role == "tool":
            return self._synthesize_tool_result(messages)

        # Get latest user message
        user_msg = ""
        for m in reversed(messages):
            if m.role == "user":
                user_msg = m.content
                break

        user_text = user_msg.lower().strip()
        role = (user_context or {}).get("role", "customer").lower()

        # 1. Search & Discovery Intent
        if any(w in user_text for w in ["find", "search", "show me events", "upcoming", "concert", "comedy", "conference", "music", "workshop", "events"]):
            if not any(w in user_text for w in ["my bookings", "my tickets", "cancel", "analytic", "revenue", "seat"]):
                args = self._extract_search_args(user_text)
                return {
                    "content": f"Searching for events matching your criteria...",
                    "tool_calls": [
                        {
                            "id": f"call_{uuid.uuid4().hex[:8]}",
                            "name": "search_events",
                            "args": args,
                        }
                    ],
                }

        # 2. Cancel Booking Intent
        if "cancel" in user_text and ("booking" in user_text or "ticket" in user_text or re.search(r"\b[a-f0-9]{24}\b", user_text)):
            booking_match = re.search(r"\b([a-f0-9]{24})\b", user_text)
            booking_id = booking_match.group(1) if booking_match else "placeholder_booking_id"
            return {
                "content": f"I can help you cancel booking `{booking_id}`. Cancellation is irreversible and triggers a mock refund.",
                "tool_calls": [
                    {
                        "id": f"call_{uuid.uuid4().hex[:8]}",
                        "name": "cancel_booking",
                        "args": {"booking_id": booking_id, "reason": "User requested via AI assistant"},
                    }
                ],
            }

        # 3. Book Tickets Intent
        if re.search(r"\b(book|reserve)\b", user_text) and not ("cancel" in user_text):
            event_match = re.search(r"\b([a-f0-9]{24})\b", user_text)
            event_id = event_match.group(1) if event_match else None
            seats_raw = re.findall(r"\b([A-Za-z]-[0-9]+|[A-Za-z][0-9]+)\b", user_text)
            seats = [s.upper() for s in seats_raw] if seats_raw else ["A-1"]

            if event_id:
                return {
                    "content": f"Preparing booking for event {event_id} with seats: {', '.join(seats)}.",
                    "tool_calls": [
                        {
                            "id": f"call_{uuid.uuid4().hex[:8]}",
                            "name": "create_booking",
                            "args": {"event_id": event_id, "seat_ids": seats},
                        }
                    ],
                }

        # 4. Check Seat Availability Intent (only when not booking/canceling)
        if ("seat" in user_text or "seats" in user_text) and not any(w in user_text for w in ["book", "reserve", "cancel"]):
            seat_match = re.search(r"seat[s]?\s*(?:for|in)?\s*([a-f0-9]{24})", user_text)
            event_id = seat_match.group(1) if seat_match else None
            if not event_id:
                # Look for 24-char hex in text
                hex_match = re.search(r"\b([a-f0-9]{24})\b", user_text)
                if hex_match:
                    event_id = hex_match.group(1)

            if event_id:
                return {
                    "content": f"Checking live seat availability for event {event_id}...",
                    "tool_calls": [
                        {
                            "id": f"call_{uuid.uuid4().hex[:8]}",
                            "name": "get_seat_availability",
                            "args": {"event_id": event_id},
                        }
                    ],
                }

        # 5. User Bookings Intent
        if any(w in user_text for w in ["my booking", "my ticket", "my reservation", "tickets booked", "what did i book"]):
            return {
                "content": "Retrieving your booking history...",
                "tool_calls": [
                    {
                        "id": f"call_{uuid.uuid4().hex[:8]}",
                        "name": "get_user_bookings",
                        "args": {},
                    }
                ],
            }

        # 6. Analytics Intent (Organizer / Admin)
        if any(w in user_text for w in ["analytic", "revenue", "sales", "how many tickets sold", "overview statistics"]):
            if role in ["organizer", "admin"]:
                return {
                    "content": "Fetching your organizer dashboard overview...",
                    "tool_calls": [
                        {
                            "id": f"call_{uuid.uuid4().hex[:8]}",
                            "name": "get_organizer_analytics",
                            "args": {},
                        }
                    ],
                }
            else:
                return {
                    "content": "Organizer analytics are only accessible to event organizers and platform administrators. Please sign in with an organizer account.",
                    "tool_calls": [],
                }

        # 7. Default Greeting & Capabilities
        return {
            "content": (
                "👋 Hello! I am your **EventPulse AI Assistant**.\n\n"
                "Here is what I can do for you:\n"
                "- 🔍 **Discover Events**: Search by city, category, or keywords (e.g. *'Find comedy shows in Mumbai'*)\n"
                "- 💺 **Check Seats**: Live real-time seat availability (e.g. *'Check seats for event <ID>'*)\n"
                "- 🎫 **Manage Bookings**: View your tickets (e.g. *'Show my bookings'*)\n"
                "- 💳 **Book & Cancel**: Reserve seats or cancel bookings with two-phase human confirmation\n"
                + ("- 📊 **Organizer Analytics**: View revenue and ticket performance\n" if role in ["organizer", "admin"] else "")
                + "\nHow can I help you today?"
            ),
            "tool_calls": [],
        }

    def _extract_search_args(self, text: str) -> Dict[str, Any]:
        args: Dict[str, Any] = {}

        # City matching
        cities = ["bangalore", "mumbai", "delhi", "hyderabad", "chennai", "pune", "kolkata"]
        for city in cities:
            if city in text:
                args["city"] = city.capitalize()
                break

        # Category matching
        categories = ["music", "comedy", "tech", "sports", "art", "theatre", "conference", "workshop"]
        for cat in categories:
            if cat in text:
                args["category"] = cat
                break

        # Keywords
        cleaned = text
        for token in ["find", "search", "show", "me", "events", "in", "upcoming", "for"]:
            cleaned = re.sub(rf"\b{token}\b", "", cleaned, flags=re.IGNORECASE)
        query = cleaned.strip()
        if query and query not in [args.get("city", "").lower(), args.get("category", "").lower()]:
            args["search"] = query

        return args

    def _synthesize_tool_result(self, messages: List[ChatMessage]) -> Dict[str, Any]:
        last_tool_msg = messages[-1]
        raw_result = last_tool_msg.content

        # Simple structured parsing if result was json string or dict
        import json
        data = None
        try:
            data = json.loads(raw_result)
        except Exception:
            data = raw_result

        # Identify which tool called from prior assistant message
        tool_name = "unknown"
        for m in reversed(messages[:-1]):
            if m.tool_calls:
                tool_name = m.tool_calls[0].get("name", "unknown")
                break

        if tool_name == "search_events":
            events = []
            if isinstance(data, dict):
                events = data.get("data", {}).get("events", []) if isinstance(data.get("data"), dict) else data.get("data", [])
            elif isinstance(data, list):
                events = data

            if not events:
                return {
                    "content": "🔍 I searched for events matching your query, but no matching events were found. Try searching for a different city, category, or date range!",
                    "tool_calls": [],
                }

            lines = [f"Found **{len(events)}** upcoming event(s):\n"]
            for ev in events[:5]:
                title = ev.get("title", "Untitled Event")
                date = str(ev.get("date", "TBD"))[:10]
                venue = ev.get("venue", {}).get("city", "Online") if isinstance(ev.get("venue"), dict) else ev.get("venue", "TBD")
                price = ev.get("price") or ev.get("basePrice") or "Free"
                ev_id = ev.get("_id", "")
                lines.append(f"- **{title}** | 📅 {date} | 📍 {venue} | 🏷️ ₹{price}\n  *(ID: `{ev_id}`)*")

            lines.append("\nWould you like me to check seat availability or help you book tickets for any of these?")
            return {"content": "\n".join(lines), "tool_calls": []}

        elif tool_name == "get_seat_availability":
            seat_info = data.get("data") if isinstance(data, dict) and "data" in data else data
            if isinstance(seat_info, dict):
                total = seat_info.get("totalSeats", seat_info.get("total", "N/A"))
                available = seat_info.get("availableSeats", seat_info.get("available", "N/A"))
                locked = seat_info.get("lockedSeats", seat_info.get("locked", 0))
                booked = seat_info.get("bookedSeats", seat_info.get("booked", 0))
                return {
                    "content": (
                        f"### 💺 Seat Availability Summary\n\n"
                        f"- **Available Seats**: {available} / {total}\n"
                        f"- **Currently Held (Locked)**: {locked}\n"
                        f"- **Already Booked**: {booked}\n\n"
                        "To book, simply tell me which seat IDs you'd like to reserve (e.g. *'Book seat A-1'*)."
                    ),
                    "tool_calls": [],
                }
            return {"content": f"Seat availability details:\n```json\n{raw_result}\n```", "tool_calls": []}

        elif tool_name == "get_user_bookings":
            bookings = []
            if isinstance(data, dict):
                bookings = data.get("data", {}).get("bookings", []) if isinstance(data.get("data"), dict) else data.get("data", [])
            elif isinstance(data, list):
                bookings = data

            if not bookings:
                return {
                    "content": "🎟️ You have no active or past bookings. Check out upcoming events to reserve your first ticket!",
                    "tool_calls": [],
                }

            lines = [f"### 🎟️ Your Bookings ({len(bookings)})\n"]
            for b in bookings[:5]:
                ev_title = b.get("event", {}).get("title", "Event") if isinstance(b.get("event"), dict) else "Event"
                status = b.get("status", "CONFIRMED").upper()
                seats = ", ".join(b.get("seats", [])) if isinstance(b.get("seats"), list) else str(b.get("seats", ""))
                total = b.get("totalAmount", b.get("amount", "N/A"))
                b_id = b.get("_id", "")
                lines.append(f"- **{ev_title}** [{status}]\n  - Seats: `{seats}` | Total: ₹{total} | ID: `{b_id}`")

            return {"content": "\n".join(lines), "tool_calls": []}

        elif tool_name == "get_organizer_analytics":
            overview = data.get("data") if isinstance(data, dict) and "data" in data else data
            if isinstance(overview, dict):
                revenue = overview.get("totalRevenue", overview.get("revenue", 0))
                tickets = overview.get("totalTicketsSold", overview.get("ticketsSold", 0))
                events_count = overview.get("totalEvents", overview.get("activeEvents", 0))
                return {
                    "content": (
                        f"### 📊 Organizer Dashboard Overview\n\n"
                        f"- 💰 **Total Revenue**: ₹{revenue:,.2f} if isinstance({revenue}, (int, float)) else f'₹{revenue}'\n"
                        f"- 🎟️ **Tickets Sold**: {tickets}\n"
                        f"- 🎪 **Total Events**: {events_count}\n"
                    ),
                    "tool_calls": [],
                }
            return {"content": f"Analytics report:\n```json\n{raw_result}\n```", "tool_calls": []}

        # Generic summary
        return {
            "content": f"I processed the requested information:\n\n{raw_result}",
            "tool_calls": [],
        }
