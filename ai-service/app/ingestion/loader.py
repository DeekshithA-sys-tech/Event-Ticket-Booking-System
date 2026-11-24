from pathlib import Path
from typing import Any, Dict, List
import httpx

from app.core.config import settings
from app.core.logging import logger
from app.ingestion.chunker import (
    TextChunk,
    chunk_markdown_by_headings,
    chunk_event_document,
    chunk_review_digest,
)


class KnowledgeLoader:
    def __init__(self, knowledge_dir: Path = settings.KNOWLEDGE_DIR):
        self.knowledge_dir = knowledge_dir

    def load_local_knowledge_files(self) -> List[TextChunk]:
        """Loads all markdown files in the knowledge/ folder and chunks them by headings."""
        chunks: List[TextChunk] = []

        if not self.knowledge_dir.exists():
            logger.warn(f"Knowledge directory {self.knowledge_dir} does not exist.")
            return chunks

        for file_path in self.knowledge_dir.glob("*.md"):
            try:
                content = file_path.read_text(encoding="utf-8")
                doc_name = file_path.stem
                title = doc_name.replace("_", " ").title()

                source_type = "policy"
                if "faq" in doc_name:
                    source_type = "faq"
                elif "venue" in doc_name or "entry" in doc_name:
                    source_type = "venue_rules"

                base_meta = {
                    "source_file": file_path.name,
                    "source_type": source_type,
                    "access_level": "public",
                    "title": title,
                }

                file_chunks = chunk_markdown_by_headings(
                    doc_id=doc_name,
                    title=title,
                    content=content,
                    source_type=source_type,
                    base_metadata=base_meta,
                )
                chunks.extend(file_chunks)
                logger.info(f"Loaded {len(file_chunks)} chunks from {file_path.name}")
            except Exception as e:
                logger.error(f"Failed to load knowledge file {file_path}: {e}")

        return chunks

    async def fetch_events_from_express(
        self, express_url: str = settings.EXPRESS_BASE_URL
    ) -> List[Dict[str, Any]]:
        """Fetches published events from Express backend."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{express_url.rstrip('/')}/events?limit=50&status=published")
                if res.status_code == 200:
                    data = res.json()
                    events = data.get("data", [])
                    if isinstance(events, dict) and "events" in events:
                        events = events["events"]
                    return events if isinstance(events, list) else []
        except Exception as e:
            logger.warn(f"Could not fetch events from Express ({e}); using local fallback.")
        return []

    def get_seed_events_fallback(self) -> List[Dict[str, Any]]:
        """High-fidelity seed events for instant offline / test operation."""
        return [
            {
                "_id": "60d5ec49f1b24c1d88b42001",
                "title": "Neon Cyber Symphony 2026",
                "description": (
                    "An immersive electronic and synthwave orchestral concert featuring cutting-edge "
                    "laser visual mapping, ambient electronic soundscapes, and live synth performances."
                ),
                "city": "Bangalore",
                "venue": "Electronic City Amphitheatre",
                "address": "Gate 4, Cyber Park, Phase 1, Electronic City, Bangalore",
                "date": "2026-12-15T18:00:00.000Z",
                "time": "18:00",
                "duration": 180,
                "ticketPrice": 1200,
                "totalSeats": 500,
                "availableSeats": 120,
                "status": "published",
                "category": {"name": "Music & Concerts"},
                "rating": {"average": 4.9, "count": 84},
            },
            {
                "_id": "60d5ec49f1b24c1d88b42002",
                "title": "Mysuru Heritage Comedy Night",
                "description": (
                    "A relaxed evening of standup comedy featuring India's top touring comedians. "
                    "Clean humor, acoustic seating, and regional storytelling."
                ),
                "city": "Mysuru",
                "venue": "Kalamandira Cultural Auditorium",
                "address": "Vinoba Road, CFTRI Campus, Mysuru",
                "date": "2026-12-20T19:30:00.000Z",
                "time": "19:30",
                "duration": 120,
                "ticketPrice": 450,
                "totalSeats": 350,
                "availableSeats": 95,
                "status": "published",
                "category": {"name": "Comedy & Theater"},
                "rating": {"average": 4.7, "count": 42},
            },
            {
                "_id": "60d5ec49f1b24c1d88b42003",
                "title": "Mumbai Jazz & Soul Sunset Festival",
                "description": (
                    "A soulful weekend jazz festival overlooking the Arabian Sea, featuring legendary "
                    "saxophone quartets, contemporary fusion bands, and gourmet food stalls."
                ),
                "city": "Mumbai",
                "venue": "Bandra Seaside Arena",
                "address": "Bandstand Promenade, Bandra West, Mumbai",
                "date": "2026-12-28T17:00:00.000Z",
                "time": "17:00",
                "duration": 240,
                "ticketPrice": 1800,
                "totalSeats": 800,
                "availableSeats": 210,
                "status": "published",
                "category": {"name": "Music & Concerts"},
                "rating": {"average": 4.8, "count": 115},
            },
        ]

    async def load_all_chunks(self) -> List[TextChunk]:
        """Loads both markdown knowledge files and published events into chunk representations."""
        all_chunks: List[TextChunk] = []

        # 1. Load Knowledge Markdown Chunks
        kb_chunks = self.load_local_knowledge_files()
        all_chunks.extend(kb_chunks)

        # 2. Load Events from Express, fallback to seed
        events = await self.fetch_events_from_express()
        if not events:
            events = self.get_seed_events_fallback()

        for event in events:
            if event.get("status") == "published":
                event_chunks = chunk_event_document(event)
                all_chunks.extend(event_chunks)

        logger.info(f"Loaded a total of {len(all_chunks)} knowledge and event chunks.")
        return all_chunks
