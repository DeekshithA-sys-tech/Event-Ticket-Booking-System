import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agent.orchestrator import AgentOrchestrator
from app.api.chat import router as chat_router
from app.api.health import router as health_router
from app.api.ingest import router as ingest_router
from app.api.rag import router as rag_router
from app.core.config import settings
from app.core.logging import logger
from app.ingestion.chunker import chunk_event_document
from app.ingestion.loader import KnowledgeLoader
from app.retrieval.hybrid import HybridRetriever

retriever = HybridRetriever()
orchestrator = AgentOrchestrator(retriever)


def initialize_knowledge_index():
    """Immediately indexes local markdown files and seed events into the hybrid vector store."""
    try:
        loader = KnowledgeLoader()
        kb_chunks = loader.load_local_knowledge_files()
        seed_events = loader.get_seed_events_fallback()
        all_chunks = list(kb_chunks)
        for ev in seed_events:
            all_chunks.extend(chunk_event_document(ev))
        retriever.index_chunks(all_chunks)
        logger.info(f"[Startup] Hybrid RAG Index initialized with {len(all_chunks)} chunks.")
    except Exception as e:
        logger.error(f"[Startup] Knowledge index initialization error: {e}", exc_info=True)


# Initialize immediately so all test clients & workers have chunks ready
initialize_knowledge_index()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Try fetching fresh live events from Express if available
    try:
        loader = KnowledgeLoader()
        live_chunks = await loader.load_all_chunks()
        if live_chunks:
            retriever.index_chunks(live_chunks)
            logger.info(f"[Lifespan] Refreshed Hybrid RAG Index with {len(live_chunks)} live chunks.")
    except Exception as e:
        logger.warn(f"[Lifespan] Could not refresh live chunks from Express: {e}")

    yield

    logger.info("[Shutdown] EventPulse AI Service shutting down.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Zero-Cost Hybrid RAG + Tool-Using Agent for Event Ticket Booking System",
    lifespan=lifespan,
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Root-level health probe
@app.get("/health", tags=["Health"])
async def root_health():
    chunk_count = len(retriever.chunks) if retriever else 0
    return {
        "status": "ok",
        "service": "eventpulse-rag-agent",
        "version": settings.APP_VERSION,
        "indexed_chunks": chunk_count,
        "engine": "Hybrid BM25 + Dense Vector (Zero-Cost Local RAG)",
    }


# Mount Routers
app.include_router(health_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(rag_router, prefix="/api")
app.include_router(ingest_router, prefix="/api")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
