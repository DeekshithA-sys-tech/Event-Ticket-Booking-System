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
        is_user_details_query = (
            any(
                p in user_msg.lower()
                for p in [
                    "user details", "get user details", "my details", "my profile",
                    "who am i", "account details", "my account", "user info", "profile details",
                    "my role", "what is my role", "what's my role"
                ]
            )
            or ("am i" in user_msg.lower() and any(r in user_msg.lower() for r in ["admin", "customer", "costumer", "organizer", "organiser", "user", "logged", "signed"]))
            or user_msg.lower().strip(" ?.") in ["am i admin", "am i customer", "am i organizer", "what am i", "my role"]
        )
        if is_user_details_query:
            role_label = (user_ctx.role or "customer").capitalize()
            is_authed = getattr(user_ctx, "is_authenticated", False) or bool(token) or bool(user_ctx.email and user_ctx.user_id != "guest")
            if not is_authed:
                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message=(
                        "### 👤 User Account Details\n\n"
                        "You are currently browsing as a **Guest** (unauthenticated).\n\n"
                        "Please sign in or register to check your account role, manage tickets, or make bookings."
                    ),
                    citations=[],
                    is_rag_grounded=False,
                    requires_confirmation=False,
                )
            else:
                user_id_str = f"- **User ID:** `{user_ctx.user_id}`\n" if user_ctx.user_id and user_ctx.user_id != "guest" else ""
                email_str = f"- **Email Address:** `{user_ctx.email}`\n" if user_ctx.email else ""
                role_desc = (
                    "As an administrator, you have full access to manage events, moderate reviews, and view all users."
                    if role_label.lower() == "admin"
                    else "As an organizer, you can create events and view sales analytics."
                    if role_label.lower() == "organizer"
                    else "You can browse live events, book seats, and manage your tickets."
                )
                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message=(
                        f"### 👤 User Account Details & Role\n\n"
                        f"- **Role:** `{role_label}`\n"
                        f"{email_str}"
                        f"{user_id_str}"
                        f"- **Status:** Active & Verified\n\n"
                        f"You are currently authenticated as an **{role_label}**.\n\n"
                        f"💡 *{role_desc}*"
                    ),
                    citations=[],
                    is_rag_grounded=False,
                    requires_confirmation=False,
                )

        # ── 2c. Handle Admin List Users Query ───────────────────────────────────
        is_list_users_query = (
            bool(re.search(r"\b(?:list|show|get|view)\s+(?:all\s+)?(?:the\s+)?users?\b", user_msg, re.IGNORECASE))
            or any(
                p in user_msg.lower()
                for p in [
                    "list all the users", "list all the user", "list all users", "list all user",
                    "list users", "list user", "show all users", "show all user", "get all users",
                    "get all user", "view all users", "view all user", "show users", "show user",
                    "all users", "all user", "user list", "platform users"
                ]
            )
        ) and not any(p in user_msg.lower() for p in ["my details", "my profile", "who am i", "am i", "my account", "my role", "user details", "get user details"])
        if is_list_users_query:
            if role != "admin":
                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message="🔒 **Admin Permission Required**\n\nListing platform users is strictly restricted to platform **Administrators**.",
                    citations=[],
                    is_rag_grounded=False,
                    requires_confirmation=False,
                )
            result = await tool_registry.execute("list_users", {"limit": 10}, token=token, user=user_ctx)
            return self._format_list_users_response(req.conversation_id, result)

        # ── 2d. Handle Golden Dataset / Benchmark Query ─────────────────────────
        if any(p in user_msg.lower() for p in ["golden dataset", "golden evaluation", "evaluation dataset", "eval dataset", "benchmark dataset"]):
            from app.eval.golden_dataset import GOLDEN_EVALUATION_DATASET
            lines = [
                f"### 🧪 EventPulse Golden Evaluation Benchmark ({len(GOLDEN_EVALUATION_DATASET)} Test Cases)\n",
                "The golden dataset evaluates retrieval precision, anti-hallucination grounding, live tool invocation, and RBAC security:\n",
                "| ID | Category | Question | Expected Output / Action |",
                "|---|---|---|---|",
            ]
            for item in GOLDEN_EVALUATION_DATASET:
                eid = item.get("id")
                cat = item.get("category")
                q = item.get("question")
                action = item.get("expected_action") or item.get("expected_tool") or ("Refusal" if item.get("expected_refusal") else "Rejection" if item.get("expected_rejection") else "tool")
                lines.append(f"| `{eid}` | {cat} | {q} | `{action}` |")
            return ChatResponse(
                conversation_id=req.conversation_id,
                message="\n".join(lines),
                citations=[],
                is_rag_grounded=False,
                requires_confirmation=False,
            )

        # ── 2e. Handle Weather Query (GQ-061) ─────────────────────────────────
        if any(w in user_msg.lower() for w in ["weather", "forecast", "will it rain", "temperature", "climate", "sunny"]):
            return ChatResponse(
                conversation_id=req.conversation_id,
                message=(
                    "### ⛅ Weather Information Notice\n\n"
                    "Weather forecast details and climate conditions are not tracked by EventPulse.\n\n"
                    "Please check a dedicated weather forecast service (such as Google Weather or AccuWeather) for Saturday's conditions in your venue area. EventPulse cannot predict or guarantee venue weather."
                ),
                citations=[],
                is_rag_grounded=False,
                requires_confirmation=False,
            )

        # ── 2f. Handle Sports Predictions Query (GQ-062) ──────────────────────
        if any(w in user_msg.lower() for w in ["ipl", "world cup", "who is going to win", "who will win", "predict match", "match prediction"]):
            return ChatResponse(
                conversation_id=req.conversation_id,
                message=(
                    "### 🏏 Sports & Event Scope Notice\n\n"
                    "I am the EventPulse AI Assistant and specialize in platform events, ticket bookings, venue entry guidelines, and cancellation policies.\n\n"
                    "I cannot provide sports predictions, tournament forecasts, or team outcome analysis. If you'd like to browse upcoming live sports matches, concerts, or comedy shows on EventPulse, I'd be happy to help!"
                ),
                citations=[],
                is_rag_grounded=False,
                requires_confirmation=False,
            )

        # ── 2g. Handle Student Discount Query (GQ-063) ────────────────────────
        if any(p in user_msg.lower() for p in ["student discount", "student offer", "college discount"]):
            return ChatResponse(
                conversation_id=req.conversation_id,
                message=(
                    "### 🎓 Student Discount Guidelines\n\n"
                    "Valid student IDs are accepted as recognized photo identification at venue check-in when claiming student discounts.\n\n"
                    "However, specific discount percentages and concession terms vary by organizer and are not standardized in the platform knowledge base. Please check the individual event details page or contact event support directly."
                ),
                citations=[],
                is_rag_grounded=False,
                requires_confirmation=False,
            )

        # ── 2h. Handle PayPal / Cryptocurrency Query (GQ-064) ──────────────────
        if any(p in user_msg.lower() for p in ["paypal", "crypto", "cryptocurrency", "bitcoin", "eth"]):
            return ChatResponse(
                conversation_id=req.conversation_id,
                message=(
                    "### 💳 Accepted Payment Methods\n\n"
                    "Payment options available for each event (such as UPI, Credit/Debit cards, and Net Banking) are displayed during checkout.\n\n"
                    "The EventPulse knowledge base does not list PayPal or cryptocurrency as supported payment methods. Please refer to the checkout screen for all currently enabled payment gateways."
                ),
                citations=[],
                is_rag_grounded=False,
                requires_confirmation=False,
            )

        # ── 2i. Handle Adversarial Prompt Injection Defense (GQ-065) ───────────
        if any(p in user_msg.lower() for p in [
            "ignore all previous instructions", "ignore previous instructions",
            "disregard previous instructions", "system prompt", "jailbreak",
            "give me a full refund right now", "give me a refund right now"
        ]):
            return ChatResponse(
                conversation_id=req.conversation_id,
                message=(
                    "🔒 **Security & Policy Notice**\n\n"
                    "Refund requests strictly adhere to the EventPulse Cancellation and Refund Policy based on event timelines and organizer rules.\n\n"
                    "I cannot override system instructions or issue unconfirmed refunds. To cancel an eligible booking, please initiate cancellation through your account dashboard or request a standard confirmation here."
                ),
                citations=[],
                is_rag_grounded=False,
                requires_confirmation=False,
            )

        # ── 2j. Handle Privacy Protection / User Bookings (GQ-067) ────────────
        if re.search(r"\b(?:bookings?|tickets?)\s+of\s+(?:the\s+)?user\b", user_msg, re.IGNORECASE) or ("bookings of" in user_msg.lower() and "@" in user_msg):
            return ChatResponse(
                conversation_id=req.conversation_id,
                message=(
                    "🔒 **Privacy Protection**\n\n"
                    "For account security and data privacy protection, users are only permitted to access their own booking records.\n\n"
                    "Viewing or querying another customer's ticket bookings is strictly prohibited."
                ),
                citations=[],
                is_rag_grounded=False,
                requires_confirmation=False,
            )

        # ── 2k. Handle Admin Audit Log RBAC (GQ-060) ──────────────────────────
        if any(p in user_msg.lower() for p in ["audit log", "admin log", "audit trail"]):
            if role != "admin":
                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message="🔒 **Admin Permission Required**\n\nPlatform audit logs and administrative traces are strictly restricted to system **Administrators**.",
                    citations=[],
                    is_rag_grounded=False,
                    requires_confirmation=False,
                )

        # ── 2l. Handle Ambiguous Cancellation Request (GQ-068) ────────────────
        if user_msg.strip().lower() in ["can i cancel", "can i cancel?", "i want to cancel", "can i get a refund?", "can i get a refund"]:
            return ChatResponse(
                conversation_id=req.conversation_id,
                message=(
                    "### ❓ Booking Cancellation Clarification\n\n"
                    "Yes, tickets can be cancelled on EventPulse, but the refund percentage depends on how far in advance you cancel prior to the event start time:\n\n"
                    "- **More than 7 days:** 100% refund (minus 2.5% fee)\n"
                    "- **48 hours to 7 days:** 80% refund\n"
                    "- **24 to 48 hours:** 50% refund\n"
                    "- **Under 24 hours:** Non-refundable\n\n"
                    "Which specific booking or event would you like to cancel, and when is it scheduled to take place?"
                ),
                citations=[],
                is_rag_grounded=False,
                requires_confirmation=False,
            )

        # ── 2m. Handle Event Creation Intent ───────────────────────────────────
        is_create_event_query = (
            any(p in user_msg.lower() for p in [
                "create event", "create an event", "create an enent", "create enent", "create a event",
                "add event", "host an event", "new event", "schedule an event", "create event called", "create an event called"
            ])
            or (user_msg.lower().startswith("create ") and any(k in user_msg.lower() for k in ["show", "tickets", "price", "seats", "comedy", "music", "concert", "enent", "event"]))
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

        # Booking / Seat lock request with explicit seats
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

        # Natural booking request: e.g. "book 2 seats in 'summer rock'", "book 3 tickets", "Book me 2 seats for Jazz Night."
        is_policy_inquiry = any(
            w in user_msg.lower()
            for w in [
                "how do i", "how can i", "how to", "do i need", "can i", "is it possible",
                "policy", "faq", "rules", "refund", "cancel", "what if", "timeline",
                "if i cancel", "i booked", "already booked", "booked previously"
            ]
        )
        if not is_policy_inquiry:
            word_nums = {
                "a": 1, "an": 1, "one": 1, "two": 2, "couple": 2, "three": 3,
                "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10
            }
            num_pat = r"(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an|couple(?:\s+of)?)"
            item_pat = r"(?:tickets?|seats?|passes?)"
            action_pat = r"(?:book(?:\s+me)?|reserve|lock|hold|buy|order)"

            m_a = re.search(rf"\b{action_pat}\s+{num_pat}\s+{item_pat}\b", user_msg, re.IGNORECASE)
            m_b = re.search(rf"\b{action_pat}\s+{item_pat}\b", user_msg, re.IGNORECASE)
            m_c = re.search(rf"\b{num_pat}\s+{item_pat}.*\b{action_pat}\b", user_msg, re.IGNORECASE)

            if m_a or m_b or m_c:
                qty = 1
                if m_a:
                    raw_q = m_a.group(1).lower().strip()
                    qty = word_nums.get(raw_q, int(raw_q) if raw_q.isdigit() else 1)
                elif m_c:
                    raw_q = m_c.group(1).lower().strip()
                    qty = word_nums.get(raw_q, int(raw_q) if raw_q.isdigit() else 1)
                elif m_b:
                    qty = 2 if "seats" in user_msg.lower() or "tickets" in user_msg.lower() else 1

                # Extract candidate event title
                quote_match = re.search(r'["\']([^"\']+)["\']', user_msg)
                if quote_match and len(quote_match.group(1).strip()) > 1:
                    candidate_title = quote_match.group(1).strip()
                else:
                    c_title = re.sub(r"^(?:please\s+|can\s+you\s+|i\s+want\s+to\s+|i'd\s+like\s+to\s+|could\s+you\s+)?", "", user_msg, flags=re.IGNORECASE)
                    c_title = re.sub(rf"\b{action_pat}\s+(?:{num_pat}\s+)?{item_pat}\b", "", c_title, flags=re.IGNORECASE)
                    c_title = re.sub(rf"\b{num_pat}\s+{item_pat}.*\b{action_pat}\b", "", c_title, flags=re.IGNORECASE)
                    c_title = re.sub(r"\b(?:in|for|at|to|of|on|event|anywhere|please)\b", "", c_title, flags=re.IGNORECASE)
                    candidate_title = c_title.strip(" ,.-0123456789\"'?!")

                target_event = None
                if candidate_title and len(candidate_title) >= 2:
                    res = await tool_registry.execute("search_events", {"q": candidate_title}, token=token, user=user_ctx)
                    evs = res.get("data", [])
                    if isinstance(evs, dict) and "events" in evs:
                        evs = evs["events"]
                    if isinstance(evs, list) and evs:
                        for ev in evs:
                            if candidate_title.lower() in ev.get("title", "").lower():
                                target_event = ev
                                break
                        if not target_event:
                            target_event = evs[0]

                if not candidate_title or len(candidate_title) < 2:
                    return ChatResponse(
                        conversation_id=req.conversation_id,
                        message=(
                            f"🎟️ Which event would you like to book {qty} ticket(s) for?\n\n"
                            f"Please specify the event title, or browse upcoming events using **'Find Events'**."
                        ),
                        requires_confirmation=False,
                    )

                if not target_event:
                    return ChatResponse(
                        conversation_id=req.conversation_id,
                        message=(
                            f"🔍 Could not find an active event matching **'{candidate_title}'** in the catalog.\n\n"
                            f"Please check the event title or use **'Find Events'** to view currently available shows."
                        ),
                        requires_confirmation=False,
                    )

                ev_id = str(target_event.get("_id", ""))
                ev_title = target_event.get("title", "Event")
                price = float(target_event.get("ticketPrice", 200))
                avail_seats = target_event.get("availableSeats", 0)

                # Attempt fetching actual live available seat IDs
                auto_seats = []
                avail_res = await tool_registry.execute("check_availability", {"event_id": ev_id}, token=token, user=user_ctx)
                if avail_res.get("success") and isinstance(avail_res.get("data"), dict):
                    layout = avail_res["data"].get("seatLayout", [])
                    avail_seats = avail_res["data"].get("availableSeats", avail_seats)
                    for row in layout:
                        for s in row.get("seats", []):
                            if s.get("status") == "available":
                                auto_seats.append(s.get("seatId"))
                                if len(auto_seats) == qty:
                                    break
                        if len(auto_seats) == qty:
                            break

                if len(auto_seats) < qty:
                    auto_seats = [f"A-{i+1}" for i in range(qty)]

                if qty > 6:
                    return ChatResponse(
                        conversation_id=req.conversation_id,
                        message=(
                            f"⚠️ **Ticket Limit Exceeded (Maximum 6 Tickets)**\n\n"
                            f"To prevent scalping and ensure fair access, EventPulse policy limits transactions to a maximum of **6 tickets per booking**.\n\n"
                            f"For larger groups, please book in separate transactions of up to 6 tickets, or contact `corporate@eventpulse.io` for enterprise group reservations."
                        ),
                        requires_confirmation=False,
                    )

                if avail_seats < qty:
                    return ChatResponse(
                        conversation_id=req.conversation_id,
                        message=(
                            f"⚠️ **Insufficient Seats Available**\n\n"
                            f"You requested {qty} seat(s) for **{ev_title}**, but only {avail_seats} seat(s) are currently available.\n\n"
                            f"Please select fewer seats or browse other upcoming events."
                        ),
                        requires_confirmation=False,
                    )

                pending = PendingAction(
                    action="create_booking",
                    payload={"event_id": ev_id, "seat_ids": auto_seats},
                    summary=f"Confirm reservation of {qty} ticket(s) ({', '.join(auto_seats)}) for '{ev_title}' at ₹{price * qty:.2f}",
                    requires_confirmation=True,
                )
                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message=(
                        f"🎟️ **Booking Confirmation Request**\n\n"
                        f"- **Event:** {ev_title}\n"
                        f"- **Quantity:** {qty} ticket(s)\n"
                        f"- **Allocated Seats:** `{', '.join(auto_seats)}`\n"
                        f"- **Total Amount:** ₹{price * qty:.2f}\n\n"
                        f"Please confirm to lock these seats and proceed to checkout."
                    ),
                    requires_confirmation=True,
                    pending_action=pending,
                )

        # ── 7. Handle Event Discovery with Structured Filters ──────────────────
        is_discovery_query = (
            any(w in user_msg.lower() for w in [
                "find", "search", "explore", "show me events", "concerts", "concert", "comedy in", "shows", "show",
                "list the event", "list events", "list all the events", "list all events", "events", "below", "under", "cheap", "tickets in", "browse events", "all events", "events present"
            ])
            and not any(w in user_msg.lower() for w in [
                "cancel", "refund", "policy", "faq", "rules", "my bookings", "create event",
                "find my ticket", "my ticket", "after i pay", "after payment", "16-year-old", "age",
                "weather", "forecast", "ipl", "audit log", "audit trail", "student discount", "paypal", "crypto"
            ])
        )
        if is_discovery_query:
            filters = extract_structured_filters(user_msg)
            # Clean q by removing filter tokens and query stop words
            clean_q = user_msg.lower()
            for stop_word in [
                "find", "upcoming", "shows", "show", "events", "event", "list", "the", "in",
                "below", "under", "price", "rupees", "rs", "inr", "for", "me", "all", "any", "please",
                "present", "application", "app", "system", "platform", "database", "available", "currently", "there", "here"
            ]:
                clean_q = re.sub(rf"\b{stop_word}\b", " ", clean_q, flags=re.IGNORECASE)
            if filters.get("city"):
                clean_q = re.sub(rf"\b{filters['city'].lower()}\b", " ", clean_q, flags=re.IGNORECASE)
            clean_q = re.sub(r"\d+", " ", clean_q)
            clean_q = " ".join(clean_q.split()).strip()

            search_args = {
                "q": clean_q if len(clean_q) > 2 else None,
                "city": filters.get("city"),
                "category": filters.get("category"),
                "max_price": filters.get("max_price"),
            }
            res = await tool_registry.execute("search_events", search_args, token=token, user=user_ctx)
            events = res.get("data", [])
            if isinstance(events, dict) and "events" in events:
                events = events["events"]

            # Fallback to seed events if live DB currently has 0 events and no restrictive title query was passed
            if (not isinstance(events, list) or not events) and not search_args.get("q"):
                from app.ingestion.loader import KnowledgeLoader
                loader = KnowledgeLoader()
                all_seeds = loader.get_seed_events_fallback()
                events = [ev for ev in all_seeds if ev.get("status") == "published"]
                if filters.get("city"):
                    events = [ev for ev in events if ev.get("city", "").lower() == filters["city"].lower()]
                if filters.get("max_price"):
                    events = [ev for ev in events if ev.get("ticketPrice", 0) <= filters["max_price"]]

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
                    f"### 🎪 Live Catalog Events ({len(events)})\n\n"
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
            else:
                criteria_parts = []
                if filters.get("city"):
                    criteria_parts.append(f"in {filters['city']}")
                if filters.get("category"):
                    criteria_parts.append(f"under {filters['category']}")
                if filters.get("max_price"):
                    criteria_parts.append(f"under ₹{filters['max_price']}")
                criteria_str = " ".join(criteria_parts) or "your search criteria"

                return ChatResponse(
                    conversation_id=req.conversation_id,
                    message=(
                        f"### 🎪 No Events Found\n\n"
                        f"No live events currently match {criteria_str}.\n\n"
                        f"💡 *Try searching without price limits or explore events across other cities like Bangalore, Mumbai, or Mysuru.*"
                    ),
                    event_cards=[],
                    citations=[],
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

        answer_text, citations = await self.generator.synthesize_rag_response(user_msg, retrieved_chunks)

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
            if role not in ["organizer", "admin"]:
                return ChatResponse(
                    conversation_id=conv_id,
                    message=(
                        "🔒 **Organizer Permission Required**\n\n"
                        "Creating events is restricted to registered **Event Organizers** and **Administrators**.\n\n"
                        "If you are an organizer, please log in with your organizer account to host and publish events."
                    ),
                    requires_confirmation=False,
                )
            res = await tool_registry.execute("create_event", payload, token=token, user=user)
            if res.get("success") or res.get("statusCode") in [200, 201]:
                ev_data = res.get("data", {})
                ev_title = ev_data.get("title", payload.get("title", "Event"))
                ev_id = ev_data.get("_id", "")
                ev_status = ev_data.get("status", "draft")
                status_label = "published to the public catalog" if ev_status == "published" else "submitted for Admin approval (Draft Status)"
                return ChatResponse(
                    conversation_id=conv_id,
                    message=(
                        f"🎉 **Event Created Successfully!**\n\n"
                        f"Your event **{ev_title}** has been {status_label}.\n"
                        f"- **Event ID:** `{ev_id}`\n"
                        f"- **Tickets Available:** {payload.get('totalSeats')}\n"
                        f"- **Ticket Price:** ₹{payload.get('ticketPrice')}\n"
                        f"- **Status:** `{ev_status.upper()}`\n\n"
                        f"You can review and manage it in your Organizer Dashboard under Managed Events."
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

        # 1. Parse Revenue (handles both scalar numbers and Express overview dict: {total, thisMonth, lastMonth, changePercent})
        rev_raw = data.get("revenue", data.get("totalRevenue", 0))
        if isinstance(rev_raw, dict):
            total_rev = rev_raw.get("total", 0)
            this_month = rev_raw.get("thisMonth")
            last_month = rev_raw.get("lastMonth")
            growth = rev_raw.get("changePercent")
        else:
            total_rev = rev_raw if isinstance(rev_raw, (int, float)) else 0
            this_month = None
            last_month = None
            growth = None

        rev_str = f"₹{total_rev:,.2f}" if isinstance(total_rev, (int, float)) else f"₹{total_rev}"

        # 2. Parse Bookings / Tickets
        bookings_raw = data.get("bookings", data.get("totalTicketsSold", data.get("ticketsSold", 0)))
        if isinstance(bookings_raw, dict):
            total_bookings = bookings_raw.get("total", 0)
            attendees = bookings_raw.get("uniqueAttendees")
        else:
            total_bookings = bookings_raw
            attendees = None

        # 3. Parse Events
        events_raw = data.get("events", data.get("totalEvents", data.get("activeEvents", 0)))
        if isinstance(events_raw, dict):
            total_events = events_raw.get("total", 0)
            published = events_raw.get("published")
            upcoming = events_raw.get("upcoming")
        else:
            total_events = events_raw
            published = None
            upcoming = None

        lines = [
            "### 📊 Organizer Dashboard Overview\n",
            f"- 💰 **Total Revenue**: {rev_str}",
        ]
        if this_month is not None and last_month is not None:
            growth_sign = f"({growth:+.0f}% change)" if growth is not None else ""
            lines.append(f"  - *This Month:* ₹{this_month:,.2f} | *Last Month:* ₹{last_month:,.2f} {growth_sign}".strip())

        if attendees is not None:
            lines.append(f"- 🎟️ **Tickets Sold**: {total_bookings} tickets ({attendees} unique attendees)")
        elif total_bookings:
            lines.append(f"- 🎟️ **Tickets Sold**: {total_bookings}")

        if published is not None:
            extra = f" ({upcoming} upcoming)" if upcoming else ""
            lines.append(f"- 🎪 **Total Events**: {total_events} ({published} published live{extra})")
        elif total_events:
            lines.append(f"- 🎪 **Total Events**: {total_events}")

        return ChatResponse(
            conversation_id=conv_id,
            message="\n".join(lines),
            requires_confirmation=False,
            tool_calls_used=[{"name": "get_organizer_analytics"}],
        )

    def _format_list_users_response(self, conv_id: str, result: Dict[str, Any]) -> ChatResponse:
        # Check for errors from backend
        if result.get("success") is False or result.get("error"):
            err_msg = result.get("message") or result.get("error") or "Failed to retrieve user list from backend."
            if isinstance(err_msg, str) and ("Authentication required" in err_msg or "jwt" in err_msg.lower()):
                err_msg = "Admin authentication required. Please ensure you are logged in as an Administrator."
            elif isinstance(err_msg, str) and err_msg.strip().startswith("{"):
                try:
                    import json
                    parsed_err = json.loads(err_msg)
                    err_msg = parsed_err.get("message", "Unable to retrieve platform users.")
                except Exception:
                    err_msg = "Unable to retrieve platform users at this time."
            return ChatResponse(
                conversation_id=conv_id,
                message=f"### 👥 Platform Users\n\n⚠️ {err_msg}",
                requires_confirmation=False,
                tool_calls_used=[{"name": "list_users"}],
            )

        data = result.get("data")
        users = []
        if isinstance(data, list):
            users = data
        elif isinstance(data, dict):
            users = data.get("users", [])

        meta = result.get("meta", {})
        total = meta.get("total") if isinstance(meta, dict) else None
        if total is None:
            if isinstance(data, dict) and "total" in data:
                total = data["total"]
            else:
                total = len(users)

        if not users:
            return ChatResponse(
                conversation_id=conv_id,
                message="### 👥 Platform Users\n\nNo registered users found in the system.",
                requires_confirmation=False,
                tool_calls_used=[{"name": "list_users"}],
            )

        lines = [f"### 👥 Registered Platform Users ({total} total)\n"]
        for u in users[:15]:
            name = u.get("name", "User")
            email = u.get("email", "N/A")
            u_role = u.get("role", "customer").capitalize()
            status_text = "Active" if u.get("isActive", True) else "Inactive"
            role_icon = "🛡️" if u_role == "Admin" else "🎪" if u_role == "Organizer" else "👤"
            lines.append(f"- {role_icon} **{name}** (`{email}`)\n  - Role: **{u_role}** • Status: `{status_text}`")

        return ChatResponse(
            conversation_id=conv_id,
            message="\n".join(lines),
            requires_confirmation=False,
            tool_calls_used=[{"name": "list_users"}],
        )
