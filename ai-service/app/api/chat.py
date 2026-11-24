from fastapi import APIRouter, HTTPException
from app.core.logging import logger
from app.models.schemas import ChatRequest, ChatResponse

router = APIRouter(tags=["Chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    """
    Primary chat interaction endpoint with Hybrid RAG, tool calling,
    and two-phase action confirmation.
    """
    from app.main import orchestrator

    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized.")

    try:
        response = await orchestrator.handle_chat(req)
        return response
    except Exception as e:
        logger.error(f"[ChatAPI] Error handling chat request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI Agent error: {str(e)}")
