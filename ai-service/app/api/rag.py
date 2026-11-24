from fastapi import APIRouter, HTTPException
from app.core.config import settings
from app.core.logging import logger
from app.generation.grounder import GroundedGenerator
from app.models.schemas import RAGQueryRequest, RAGQueryResponse
from app.retrieval.query_rewriter import extract_structured_filters

router = APIRouter(tags=["RAG"])
generator = GroundedGenerator()


@router.post("/rag/query", response_model=RAGQueryResponse)
async def direct_rag_query(req: RAGQueryRequest):
    """
    Direct RAG Query endpoint for answering specific platform policy, FAQ,
    or venue guideline queries with citations.
    """
    from app.main import retriever

    if not retriever:
        raise HTTPException(status_code=503, detail="RAG Retriever not initialized.")

    try:
        filters = req.filters or extract_structured_filters(req.question)
        top_chunks = retriever.search(
            query=req.question,
            top_k=req.top_k or settings.TOP_K_RETRIEVAL,
            filters=filters,
        )

        answer, citations = generator.synthesize_rag_response(req.question, top_chunks)

        return RAGQueryResponse(
            question=req.question,
            answer=answer,
            citations=citations,
            sources_count=len(citations),
        )
    except Exception as e:
        logger.error(f"[RAG API] Direct query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
