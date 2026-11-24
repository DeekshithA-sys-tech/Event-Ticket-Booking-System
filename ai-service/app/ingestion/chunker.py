import re
from typing import Any, Dict, List
from app.ingestion.cleaner import clean_text, redact_pii


class TextChunk:
    def __init__(
        self,
        chunk_id: str,
        doc_id: str,
        text: str,
        context_header: str,
        metadata: Dict[str, Any],
    ):
        self.chunk_id = chunk_id
        self.doc_id = doc_id
        self.text = text
        self.context_header = context_header
        self.metadata = metadata

    @property
    def full_content(self) -> str:
        """Combines context header and content for embedding & BM25 indexing."""
        if self.context_header:
            return f"{self.context_header}\n\n{self.text}"
        return self.text

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "doc_id": self.doc_id,
            "text": self.text,
            "context_header": self.context_header,
            "full_content": self.full_content,
            "metadata": self.metadata,
        }


def chunk_markdown_by_headings(
    doc_id: str,
    title: str,
    content: str,
    source_type: str,
    base_metadata: Dict[str, Any],
) -> List[TextChunk]:
    """
    Splits markdown content into semantic chunks based on H1, H2, and H3 headers.
    Prepends context header: 'Document: <title> | Section: <heading>'.
    """
    cleaned_content = clean_text(content)
    lines = cleaned_content.split("\n")
    chunks: List[TextChunk] = []

    current_section = "General Overview"
    current_lines: List[str] = []
    chunk_index = 0

    for line in lines:
        header_match = re.match(r"^(#{1,3})\s+(.+)$", line)
        if header_match:
            # If we already have lines accumulated, finalize the chunk
            if current_lines:
                chunk_text = "\n".join(current_lines).strip()
                if len(chunk_text) > 30:
                    context_hdr = f"Document: {title} | Section: {current_section}"
                    c_id = f"{doc_id}_chunk_{chunk_index}"
                    meta = {
                        **base_metadata,
                        "title": title,
                        "section": current_section,
                        "source_type": source_type,
                        "chunk_index": chunk_index,
                    }
                    chunks.append(
                        TextChunk(
                            chunk_id=c_id,
                            doc_id=doc_id,
                            text=chunk_text,
                            context_header=context_hdr,
                            metadata=meta,
                        )
                    )
                    chunk_index += 1
                current_lines = []
            current_section = header_match.group(2).strip()
        else:
            if line.strip():
                current_lines.append(line.strip())

    # Finalize remaining text
    if current_lines:
        chunk_text = "\n".join(current_lines).strip()
        if len(chunk_text) > 20:
            context_hdr = f"Document: {title} | Section: {current_section}"
            c_id = f"{doc_id}_chunk_{chunk_index}"
            meta = {
                **base_metadata,
                "title": title,
                "section": current_section,
                "source_type": source_type,
                "chunk_index": chunk_index,
            }
            chunks.append(
                TextChunk(
                    chunk_id=c_id,
                    doc_id=doc_id,
                    text=chunk_text,
                    context_header=context_hdr,
                    metadata=meta,
                )
            )

    return chunks


def chunk_event_document(event: Dict[str, Any]) -> List[TextChunk]:
    """
    Creates logical section chunks for an event:
    1. Overview & Description
    2. Venue, Location, and Schedule
    3. Pricing, Capacity, and Tier Information
    """
    event_id = str(event.get("_id") or event.get("id", ""))
    title = event.get("title", "Event")
    city = event.get("city", "")
    venue = event.get("venue", "")
    date_str = str(event.get("date", ""))
    time_str = str(event.get("time", ""))
    price = event.get("ticketPrice", 0)
    category_data = event.get("category", {})
    category_name = (
        category_data.get("name", "")
        if isinstance(category_data, dict)
        else str(category_data)
    )
    status = event.get("status", "published")

    chunks: List[TextChunk] = []

    base_meta = {
        "event_id": event_id,
        "title": title,
        "city": city,
        "venue": venue,
        "category": category_name,
        "price": price,
        "date": date_str,
        "status": status,
        "source_type": "event",
        "access_level": "public",
    }

    # Chunk 1: Overview & Description
    desc = clean_text(event.get("description", ""))
    if desc:
        ctx_hdr = f"Event: {title} | City: {city} | Category: {category_name} | Section: Overview"
        chunks.append(
            TextChunk(
                chunk_id=f"event_{event_id}_overview",
                doc_id=f"event_{event_id}",
                text=f"{title}: {desc}",
                context_header=ctx_hdr,
                metadata={**base_meta, "section": "Overview"},
            )
        )

    # Chunk 2: Venue & Schedule
    venue_text = (
        f"Venue: {venue}, City: {city}. "
        f"Date: {date_str} at {time_str}. "
        f"Duration: {event.get('duration', 'N/A')} minutes. "
        f"Address: {event.get('address', venue)}."
    )
    ctx_hdr = f"Event: {title} | City: {city} | Section: Venue & Schedule"
    chunks.append(
        TextChunk(
            chunk_id=f"event_{event_id}_venue",
            doc_id=f"event_{event_id}",
            text=venue_text,
            context_header=ctx_hdr,
            metadata={**base_meta, "section": "Venue & Schedule"},
        )
    )

    # Chunk 3: Pricing & Capacity
    total_seats = event.get("totalSeats", 0)
    rating_data = event.get("rating", {})
    avg_rating = rating_data.get("average", 4.8) if isinstance(rating_data, dict) else 4.8
    pricing_text = (
        f"Ticket Base Price: ₹{price}. Total Capacity: {total_seats} seats. "
        f"Average Rating: {avg_rating}/5. Available for online booking."
    )
    ctx_hdr = f"Event: {title} | City: {city} | Section: Pricing & Capacity"
    chunks.append(
        TextChunk(
            chunk_id=f"event_{event_id}_pricing",
            doc_id=f"event_{event_id}",
            text=pricing_text,
            context_header=ctx_hdr,
            metadata={**base_meta, "section": "Pricing & Capacity"},
        )
    )

    return chunks


def chunk_review_digest(event_title: str, event_id: str, reviews: List[Dict[str, Any]]) -> List[TextChunk]:
    """Aggregates unflagged reviews into a clean review digest chunk with PII redacted."""
    if not reviews:
        return []

    unflagged = [r for r in reviews if not r.get("isFlagged", False)]
    if not unflagged:
        return []

    review_lines = []
    ratings = []
    for r in unflagged[:10]:
        rating = r.get("rating", 5)
        ratings.append(rating)
        body = redact_pii(clean_text(r.get("comment", "") or r.get("body", "")))
        if body:
            review_lines.append(f"- Rating {rating}/5: \"{body}\"")

    if not review_lines:
        return []

    avg_score = sum(ratings) / len(ratings) if ratings else 5.0
    text = (
        f"Attendee Reviews for {event_title} (Average: {avg_score:.1f}/5 across {len(ratings)} reviews):\n"
        + "\n".join(review_lines)
    )

    ctx_hdr = f"Event: {event_title} | Section: Reviews & Attendee Feedback"
    return [
        TextChunk(
            chunk_id=f"event_{event_id}_reviews",
            doc_id=f"event_{event_id}",
            text=text,
            context_header=ctx_hdr,
            metadata={
                "event_id": event_id,
                "title": event_title,
                "source_type": "review",
                "access_level": "public",
                "section": "Reviews",
            },
        )
    ]
