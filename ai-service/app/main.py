"""
EventPulse AI Agent Service - FastAPI Entrypoint.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.models.schemas import ChatRequest, ChatResponse
from app.agents.event_agent import EventAgent

app = FastAPI(
    title="EventPulse AI Agent Microservice",
    description="Agentic AI Layer for Event Ticket Discovery, Live Seat Availability, and Autonomous Operations",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if settings.CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = EventAgent()


@app.get("/health")
async def health_check():
    """Liveness probe and service identity check."""
    return {
        "status": "ok",
        "service": "eventpulse-ai-agent",
        "provider": settings.AI_PROVIDER,
        "express_url": settings.EXPRESS_API_URL,
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """
    Main chat gateway endpoint.
    Orchestrates LLM/mock reasoning, RBAC tool calls, and human confirmations.
    """
    try:
        response = await agent.chat(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Agent error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
