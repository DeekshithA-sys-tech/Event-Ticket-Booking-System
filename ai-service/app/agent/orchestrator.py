import re
from typing import Any, Dict, List, Optional, Tuple

from app.agent.tool_registry import tool_registry
from app.core.config import settings
from app.core.logging import logger
from app.generation.grounder import GroundedGenerator
from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    Citation,
    ConfirmationState,
    EventCard,
    PendingAction,
    UserContext,
)
from app.retrieval.hybrid import HybridRetriever
from app.retrieval.query_rewriter import extract_structured_filters, rewrite_query_with_history


class AgentOrchestrator:
    """
    Main Agent Orchestrator combining Hybrid RAG Retrieval, Live Express Tools,
    Anti-Hallucination Grounding, and Two-Phase Confirmation for Write Actions.
    """

    def __init__(self, retriever: HybridRetriever):
        self.retriever = retriever
        self.generator = GroundedGenerator()

    async def handle_chat(self, req: ChatRequest) -> ChatResponse:
        user_msg = req.message.strip()
        user_ctx = req.user or UserContext()
        role = user_ctx.role
        token = req.auth_token

        logger.info(f"[Orchestrator] Processing message from role '{role}': {user_msg}")

        # ── 1. Handle Explicit Action Confirmation ─────────────────────────────
        if req.confirmation_state and req.confirmation_state.confirmed:
            return await self._execute_confirmed_action(req.confirmation_state, token, user_ctx, req.conversation_id)

        # ── 2. Handle Small Talk / Welcome ─────────────────────────────────────
        if self._is_greeting(user_msg):
            greeting = (
                "👋 Hello! I am the **EventPulse AI Assistant**. I can help you:\n\n"
                "- 🔍 **Discover live events** by city, category, or budget\n"
                "- 🎟️ **Check live seat availability** and reserve tickets\n"
                "- 📋 **Answer platform policies** (cancellations, refunds, venue entry rules)\n"
                "- 🎫 **Access your booking passes** and digital QR codes\n\n"
                "What would you like to explore today?"
            )
            return ChatResponse(
                conversation_id=req.conversation_id,
                message=greeting,
                citations=[],
                is_rag_grounded=False,
                event_cards=[],
                requires_confirmation=False,
            )

        # ── 2b. Handle User Profile / Account Details Query ────────────────────
        is_user_details_query = any(
            p in user_msg.lower()
            for p in [
                "user details", "get user details", "my details", "my profile",
                "who am i", "account details", "my account", "user info", "profile details"
            ]
        )
        if is_user_details_query:
            if token and user_ctx.email:
                role_label = user_ctx.role.capitalize()
                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message=(
                        f"### 👤 User Account Details\n\n"
                        f"- **User ID:** `{user_ctx.user_id}`\n"
                        f"- **Email Address:** `{user_ctx.email}`\n"
                        f"- **Role:** `{role_label}`\n"
                        f"- **Status:** Active & Verified\n\n"
                        f"💡 *You can view your active bookings by asking 'show my bookings' or manage your profile in the app header.*"
                    ),
                    citations=[],
                    is_rag_grounded=False,
                    requires_confirmation=False,
                )
            else:
                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message=(
                        "### 👤 User Account\n\n"
                        "You are currently browsing as a **Guest** (unauthenticated).\n\n"
                        "Please sign in or register to view your account profile, manage tickets, or make bookings."
                    ),
                    citations=[],
                    is_rag_grounded=False,
                    requires_confirmation=False,
                )

        # ── 2c. Handle Event Creation Intent ───────────────────────────────────
        is_create_event_query = (
            any(p in user_msg.lower() for p in ["create event", "create an event", "add event", "host an event", "new event", "schedule an event"])
            or (user_msg.lower().startswith("create ") and any(k in user_msg.lower() for k in ["show", "tickets", "price", "seats", "comedy", "music"]))
        )
        if is_create_event_query:
            if role not in ["organizer", "admin"]:
                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message=(
                        "🔒 **Organizer Permission Required**\n\n"
                        "Creating events is restricted to registered **Event Organizers** and **Administrators**.\n\n"
                        "If you are an organizer, please log in with your organizer account to host and publish events."
                    ),
                    citations=[],
                    is_rag_grounded=False,
                    requires_confirmation=False,
                )

            # Extract event title
            title_match = re.search(r'["\']([^"\']+)["\']', user_msg)
            if title_match:
                title = title_match.group(1).title()
            else:
                called_match = re.search(r'called\s+([A-Za-z0-9_-]+)', user_msg, re.IGNORECASE)
                title = called_match.group(1).title() if called_match else "Laugh"

            # Extract category
            category = "Comedy"
            for cat_candidate in ["comedy", "music", "concert", "sports", "theater", "conference", "festival", "tech"]:
                if cat_candidate in user_msg.lower():
                    category = cat_candidate.title()
                    break

            # Extract city
            city = "Bangalore"
            for c_candidate in ["bangalore", "banglore", "bengaluru", "mumbai", "delhi", "mysuru", "mysore", "hyderabad", "chennai", "pune", "goa", "kolkata"]:
                if c_candidate in user_msg.lower():
                    if c_candidate in ["bangalore", "banglore", "bengaluru"]:
                        city = "Bangalore"
                    elif c_candidate in ["mysuru", "mysore"]:
                        city = "Mysuru"
                    else:
                        city = c_candidate.title()
                    break

            # Extract total seats / tickets
            seats_match = re.search(r'(\d+)\s*(?:tickets|seats)', user_msg, re.IGNORECASE)
            total_seats = int(seats_match.group(1)) if seats_match else 250

            # Extract ticket price
            price_match = re.search(r'(?:price\s*(?:is|of)?\s*|₹\s*|rs\.?\s*)(\d+)', user_msg, re.IGNORECASE)
            if not price_match:
                price_match = re.search(r'(\d+)\s*(?:rupees|inr|rs)', user_msg, re.IGNORECASE)
            ticket_price = float(price_match.group(1)) if price_match else 200.0

            from datetime import datetime, timedelta
            event_date = (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")
            venue = f"EventPulse Arena, {city}"

            event_payload = {
                "title": f"{title} {category} Show" if category.lower() not in title.lower() else title,
                "description": f"Live {title} {category.lower()} show featuring premier artists in {city}.",
                "category": category,
                "city": city,
                "venue": venue,
                "ticketPrice": ticket_price,
                "totalSeats": total_seats,
                "date": event_date,
                "time": "19:00",
                "duration": 120,
                "status": "published",
            }

            pending = PendingAction(
                action="create_event",
                payload=event_payload,
                summary=tool_registry.build_confirmation_summary("create_event", event_payload),
                requires_confirmation=True,
            )

            return ChatResponse(
                conversation_id=req.conversation_id,
                message=(
                    f"🎪 **Please Review and Confirm New Event Details:**\n\n"
                    f"- **Event Title:** {event_payload['title']}\n"
                    f"- **Category:** {category}\n"
                    f"- **City:** {city}\n"
                    f"- **Venue:** {venue}\n"
                    f"- **Seat Capacity:** {total_seats} tickets\n"
                    f"- **Ticket Price:** ₹{ticket_price:.2f}\n"
                    f"- **Date & Time:** {event_date} at 19:00\n\n"
                    f"Click **Confirm** below to create and publish this event to the live catalog."
                ),
                requires_confirmation=True,
                pending_action=pending,
            )

        # ── 3. Handle Role-Based Analytics Query ───────────────────────────────
        if any(w in user_msg.lower() for w in ["analytics", "revenue", "sales overview", "dashboard metrics"]):
            if role not in ["organizer", "admin"]:
                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message="🔒 Access restricted: Sales analytics and revenue metrics are only accessible to event organizers and platform administrators.",
                    citations=[],
                    is_rag_grounded=False,
                    requires_confirmation=False,
                )
            result = await tool_registry.execute("get_organizer_analytics", {}, token=token, user=user_ctx)
            return self._format_analytics_response(req.conversation_id, result)

        # ── 4. Handle My Bookings Query ────────────────────────────────────────
        is_my_bookings_query = any(
            w in user_msg.lower()
            for w in ["my bookings", "my tickets", "my passes", "where is my ticket", "show bookings", "show my booking", "view my booking"]
        ) and not any(p in user_msg.lower() for p in ["cancel", "refund", "policy", "rules", "can i", "what if"])

        if is_my_bookings_query:
            if not token:
                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message="Please sign in to view your tickets and booking passes.",
                    citations=[],
                    is_rag_grounded=False,
                    requires_confirmation=False,
                )
            result = await tool_registry.execute("get_my_bookings", {"limit": 5}, token=token, user=user_ctx)
            return self._format_my_bookings_response(req.conversation_id, result)

        # ── 5. Handle Live Seat Availability Check ─────────────────────────────
        seat_match = re.search(r"(?:seat|seats|availability)\s+(?:for\s+)?([a-fA-F0-9]{24})", user_msg, re.IGNORECASE)
        if seat_match or ("how many seats" in user_msg.lower() and re.search(r"([a-fA-F0-9]{24})", user_msg)):
            ev_id = seat_match.group(1) if seat_match else re.search(r"([a-fA-F0-9]{24})", user_msg).group(1)
            result = await tool_registry.execute("check_availability", {"event_id": ev_id}, token=token, user=user_ctx)
            return self._format_seat_availability_response(req.conversation_id, ev_id, result)

        # ── 6. Intercept Write Actions for Two-Phase Confirmation ──────────────
        # Cancellation request with specific booking reference ID (e.g. TKT-20261117-XYZ99)
        cancel_match = re.search(
            r"(?:cancel\s+booking|cancel\s+ticket|cancel)\s+(?:#\s*)?(TKT-[A-Za-z0-9_-]+|[a-fA-F0-9]{24})",
            user_msg,
            re.IGNORECASE,
        )
        if cancel_match:
            booking_id = cancel_match.group(1)
            pending = PendingAction(
                action="cancel_booking",
                payload={"booking_id": booking_id, "reason": "Customer cancellation via AI Assistant"},
                summary=tool_registry.build_confirmation_summary("cancel_booking", {"booking_id": booking_id}),
                requires_confirmation=True,
            )
            return ChatResponse(
                conversation_id=req.conversation_id,
                message=f"⚠️ You have requested to cancel booking **#{booking_id}**. Please confirm to initiate cancellation and refund.",
                requires_confirmation=True,
                pending_action=pending,
            )

        # Booking / Seat lock request
        book_match = re.search(r"(?:book|reserve|lock)\s+seat\s+([A-Za-z0-9,_-]+)\s+for\s+(?:event\s+)?([a-fA-F0-9]{24})", user_msg, re.IGNORECASE)
        if book_match:
            raw_seats = book_match.group(1).split(",")
            seat_ids = [s.strip() for s in raw_seats if s.strip()]
            ev_id = book_match.group(2)
            pending = PendingAction(
                action="create_booking",
                payload={"event_id": ev_id, "seat_ids": seat_ids},
                summary=tool_registry.build_confirmation_summary("confirm_booking", {"event_id": ev_id, "seat_ids": seat_ids}),
                requires_confirmation=True,
            )
            return ChatResponse(
                conversation_id=req.conversation_id,
                message=f"🎟️ Please confirm reservation of {len(seat_ids)} seat(s) (`{', '.join(seat_ids)}`) for Event `{ev_id}`.",
                requires_confirmation=True,
                pending_action=pending,
            )

        # ── 7. Handle Event Discovery with Structured Filters ──────────────────
        if any(w in user_msg.lower() for w in ["find", "search", "explore", "show me events", "concerts", "comedy in", "shows"]):
            filters = extract_structured_filters(user_msg)
            # Execute live search tool
            search_args = {
                "q": user_msg,
                "city": filters.get("city"),
                "category": filters.get("category"),
                "max_price": filters.get("max_price"),
            }
            res = await tool_registry.execute("search_events", search_args, token=token, user=user_ctx)
            events = res.get("data", [])
            if isinstance(events, dict) and "events" in events:
                events = events["events"]

            if isinstance(events, list) and events:
                cards = self.generator.extract_event_cards(events)
                event_lines = []
                for ev in events[:4]:
                    t = ev.get("title", "Event")
                    c = ev.get("city", "")
                    p = ev.get("ticketPrice", "")
                    seats = ev.get("availableSeats", "")
                    event_lines.append(f"- **{t}** — {c} | ₹{p} | `{seats} seats available`")

                msg = (
                    f"### 🎪 Upcoming Live Events Found ({len(events)})\n\n"
                    + "\n".join(event_lines)
                    + "\n\n*Click 'Select Seats' on any event card to view the interactive seat map.*"
                )
                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message=msg,
                    event_cards=cards,
                    is_rag_grounded=False,
                    tool_calls_used=[{"name": "search_events", "arguments": search_args}],
                )

        # ── 8. Hybrid RAG Retrieval (Policies, FAQs, Venue Rules, Events) ──────
        rewritten_query = rewrite_query_with_history(user_msg, req.history)
        filters = extract_structured_filters(rewritten_query)

        retrieved_chunks = self.retriever.search(
            query=rewritten_query,
            top_k=settings.TOP_K_RETRIEVAL,
            filters=filters,
            role=role,
        )

        answer_text, citations = self.generator.synthesize_rag_response(user_msg, retrieved_chunks)

        return ChatResponse(
            conversation_id=req.conversation_id,
            message=answer_text,
            citations=citations,
            is_rag_grounded=len(citations) > 0,
            event_cards=[],
            requires_confirmation=False,
        )

    def _is_greeting(self, text: str) -> bool:
        greetings = ["hi", "hello", "hey", "who are you", "help", "what can you do", "good morning", "good evening"]
        clean = text.lower().strip(" !.?")
        return clean in greetings or any(clean.startswith(g) for g in ["hello", "hi ", "hey "])

    async def _execute_confirmed_action(
        self,
        conf_state: ConfirmationState,
        token: Optional[str],
        user: UserContext,
        conv_id: str,
    ) -> ChatResponse:
        action = conf_state.action
        payload = conf_state.payload

        logger.info(f"[Orchestrator] Executing confirmed action: {action} with {payload}")

        if action == "cancel_booking":
            res = await tool_registry.execute("cancel_booking", payload, token=token, user=user)
            if res.get("success") or res.get("statusCode") in [200, 201]:
                msg = res.get("message", "Booking cancelled successfully.")
                return ChatResponse(
                    conversation_id=conv_id,
                    message=f"✅ **Booking Cancelled Successfully!**\n\n{msg}\n\nYour refund has been initiated and the released seats are now available again.",
                    requires_confirmation=False,
                    tool_calls_used=[{"name": "cancel_booking", "arguments": payload}],
                )
            else:
                err = res.get("message") or res.get("error") or "Unknown error"
                return ChatResponse(
                    conversation_id=conv_id,
                    message=f"⚠️ **Could not cancel booking**: {err}",
                    requires_confirmation=False,
                )

        elif action in ["create_booking", "confirm_booking"]:
            res = await tool_registry.execute("confirm_booking", payload, token=token, user=user)
            if res.get("success") or res.get("statusCode") in [200, 201]:
                b_info = res.get("data", {}).get("booking", {}) if isinstance(res.get("data"), dict) else {}
                b_id = b_info.get("bookingId") or b_info.get("_id", "Confirmed")
                return ChatResponse(
                    conversation_id=conv_id,
                    message=f"🎉 **Booking Confirmed!**\n\nYour reservation **#{b_id}** is complete. A confirmation email and PDF ticket pass have been generated.",
                    requires_confirmation=False,
                    tool_calls_used=[{"name": "confirm_booking", "arguments": payload}],
                )
            else:
                err = res.get("message") or res.get("error") or "Unknown error"
                return ChatResponse(
                    conversation_id=conv_id,
                    message=f"⚠️ **Could not complete booking**: {err}",
                    requires_confirmation=False,
                )

        elif action == "create_event":
            res = await tool_registry.execute("create_event", payload, token=token, user=user)
            if res.get("success") or res.get("statusCode") in [200, 201]:
                ev_data = res.get("data", {})
                ev_title = ev_data.get("title", payload.get("title", "Event"))
                ev_id = ev_data.get("_id", "")
                return ChatResponse(
                    conversation_id=conv_id,
                    message=(
                        f"🎉 **Event Created Successfully!**\n\n"
                        f"Your event **{ev_title}** has been published to the EventPulse catalog.\n"
                        f"- **Event ID:** `{ev_id}`\n"
                        f"- **Tickets Available:** {payload.get('totalSeats')}\n"
                        f"- **Ticket Price:** ₹{payload.get('ticketPrice')}\n\n"
                        f"Attendees can now discover it and reserve seats!"
                    ),
                    requires_confirmation=False,
                    tool_calls_used=[{"name": "create_event", "arguments": payload}],
                )
            else:
                err = res.get("message") or res.get("error") or "Unknown error"
                return ChatResponse(
                    conversation_id=conv_id,
                    message=f"⚠️ **Could not create event**: {err}",
                    requires_confirmation=False,
                )

        return ChatResponse(
            conversation_id=conv_id,
            message=f"Action '{action}' processed.",
            requires_confirmation=False,
        )

    def _format_my_bookings_response(self, conv_id: str, result: Dict[str, Any]) -> ChatResponse:
        bookings = result.get("data", [])
        if isinstance(bookings, dict) and "bookings" in bookings:
            bookings = bookings["bookings"]

        if not isinstance(bookings, list) or not bookings:
            return ChatResponse(
                conversation_id=conv_id,
                message="You currently have no active or previous bookings.",
                requires_confirmation=False,
            )

        lines = [f"### 🎟️ Your Bookings ({len(bookings)})\n"]
        for b in bookings[:5]:
            ev_title = (
                b.get("event", {}).get("title", "Event")
                if isinstance(b.get("event"), dict)
                else "Event"
            )
            status = b.get("status", "CONFIRMED").upper()
            raw_seats = b.get("seats", [])
            if isinstance(raw_seats, list):
                seat_labels = []
                for s in raw_seats:
                    if isinstance(s, dict):
                        seat_labels.append(s.get("seatId") or f"{s.get('row', '')}-{s.get('seatNumber', '')}")
                    else:
                        seat_labels.append(str(s))
                seats = ", ".join(seat_labels) if seat_labels else "N/A"
            else:
                seats = str(raw_seats)

            total = b.get("totalAmount", b.get("amount", "N/A"))
            b_id = b.get("bookingId") or b.get("_id", "")
            lines.append(f"- **{ev_title}** [{status}]\n  - Seats: `{seats}` | Total: ₹{total} | ID: `{b_id}`")

        return ChatResponse(
            conversation_id=conv_id,
            message="\n".join(lines),
            requires_confirmation=False,
            tool_calls_used=[{"name": "get_my_bookings"}],
        )

    def _format_seat_availability_response(
        self, conv_id: str, event_id: str, result: Dict[str, Any]
    ) -> ChatResponse:
        data = result.get("data", {}) if isinstance(result.get("data"), dict) else result
        avail = data.get("availableSeats", "N/A")
        total = data.get("totalSeats", "N/A")
        title = data.get("title", "Event")

        return ChatResponse(
            conversation_id=conv_id,
            message=(
                f"### 🪑 Live Seat Availability for {title}\n\n"
                f"- **Available Seats**: `{avail} / {total}`\n"
                f"- **Status**: Live database status\n\n"
                f"*To lock seats, select your seats on the visual seat map.*"
            ),
            requires_confirmation=False,
            tool_calls_used=[{"name": "check_availability", "arguments": {"event_id": event_id}}],
        )

    def _format_analytics_response(self, conv_id: str, result: Dict[str, Any]) -> ChatResponse:
        data = result.get("data", {}) if isinstance(result.get("data"), dict) else result
        revenue = data.get("totalRevenue", data.get("revenue", 0))
        tickets = data.get("totalTicketsSold", data.get("ticketsSold", 0))
        events_cnt = data.get("totalEvents", data.get("activeEvents", 0))
        rev_str = f"₹{revenue:,.2f}" if isinstance(revenue, (int, float)) else f"₹{revenue}"

        msg = (
            f"### 📊 Organizer Dashboard Overview\n\n"
            f"- 💰 **Total Revenue**: {rev_str}\n"
            f"- 🎟️ **Tickets Sold**: {tickets}\n"
            f"- 🎪 **Total Events**: {events_cnt}\n"
        )
        return ChatResponse(
            conversation_id=conv_id,
            message=msg,
            requires_confirmation=False,
            tool_calls_used=[{"name": "get_organizer_analytics"}],
        )
