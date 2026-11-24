from fastapi import APIRouter
from app.core.logging import logger
from app.ingestion.loader import KnowledgeLoader
from app.models.schemas import IngestResponse

router = APIRouter(tags=["Ingest"])


@router.post("/ingest", response_model=IngestResponse)
async def trigger_reindex():
    """
    Triggers re-indexing of knowledge documents and published events into the hybrid vector engine.
    """
    from app.main import retriever

    try:
        loader = KnowledgeLoader()
        chunks = await loader.load_all_chunks()
        retriever.index_chunks(chunks)

        logger.info(f"[IngestAPI] Re-indexing complete: {len(chunks)} chunks indexed.")
        return IngestResponse(
            status="success",
            documents_indexed=len(chunks),
            chunks_indexed=len(chunks),
            errors=[],
        )
    except Exception as e:
        logger.error(f"[IngestAPI] Ingestion failed: {e}", exc_info=True)
        return IngestResponse(
            status="failed",
            documents_indexed=0,
            chunks_indexed=0,
            errors=[str(e)],
        )
