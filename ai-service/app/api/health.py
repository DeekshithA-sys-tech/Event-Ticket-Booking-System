from fastapi import APIRouter
from app.core.config import settings

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    from app.main import retriever

    chunk_count = len(retriever.chunks) if retriever else 0
    return {
        "status": "ok",
        "service": "eventpulse-rag-agent",
        "version": settings.APP_VERSION,
        "indexed_chunks": chunk_count,
        "engine": "Hybrid BM25 + Dense Vector (Zero-Cost Local RAG)",
    }
