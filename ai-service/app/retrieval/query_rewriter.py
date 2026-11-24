import re
from typing import Any, Dict, List, Tuple
from app.models.schemas import ChatMessage


def extract_structured_filters(query: str) -> Dict[str, Any]:
    """
    Extracts structured query filters (city, max_price, category) from user text.
    These map directly to event metadata.
    """
    filters: Dict[str, Any] = {}
    q_lower = query.lower()

    # Extract Cities
    cities = ["bangalore", "bengaluru", "mysuru", "mysore", "mumbai", "delhi", "pune", "hyderabad"]
    for city in cities:
        if city in q_lower:
            filters["city"] = "Bangalore" if "bengaluru" in city else city.title()
            break

    # Extract Max Price (e.g., "under 500", "below 1000", "less than 600 rupees")
    price_match = re.search(r"(?:under|below|less than|within)\s*(?:₹|rs\.?|inr)?\s*(\d+)", q_lower)
    if price_match:
        try:
            filters["max_price"] = float(price_match.group(1))
        except ValueError:
            pass

    # Extract Categories
    if any(k in q_lower for k in ["music", "concert", "orchestral", "dj", "band", "synthwave"]):
        filters["category"] = "Music & Concerts"
    elif any(k in q_lower for k in ["comedy", "standup", "stand-up", "theater", "theatre", "drama"]):
        filters["category"] = "Comedy & Theater"
    elif any(k in q_lower for k in ["tech", "summit", "conference"]):
        filters["category"] = "Tech & Innovation"

    return filters


def rewrite_query_with_history(query: str, history: List[ChatMessage]) -> str:
    """
    Resolves conversational follow-ups into standalone search queries using conversation context.
    For example:
      User: "Tell me about Neon Cyber Symphony"
      Assistant: "..."
      User: "Can I cancel my ticket?"
      -> Rewritten: "Can I cancel ticket for Neon Cyber Symphony?"
    """
    if not history:
        return query.strip()

    q_lower = query.lower().strip()
    pronouns = ["it", "this", "that", "this event", "the event", "there", "them"]

    needs_context = any(
        re.search(rf"\b{re.escape(p)}\b", q_lower) for p in pronouns
    ) or len(query.split()) < 4

    if not needs_context:
        return query.strip()

    # Look back at user messages to find referenced event titles or topics
    referenced_subject = ""
    for msg in reversed(history):
        if msg.role in ["user", "assistant"]:
            # Check for title-like words
            for token in ["Neon Cyber Symphony", "Mysuru Heritage Comedy", "Mumbai Jazz", "Jazz", "Symphony", "Comedy"]:
                if token.lower() in msg.content.lower():
                    referenced_subject = token
                    break
        if referenced_subject:
            break

    if referenced_subject and referenced_subject.lower() not in q_lower:
        return f"{query} regarding {referenced_subject}"

    return query.strip()
