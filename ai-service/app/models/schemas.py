from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class UserContext(BaseModel):
    user_id: Optional[str] = None
    role: str = "customer"
    email: Optional[str] = None


class Citation(BaseModel):
    citation_id: int
    source_type: str  # policy, event, review, faq
    title: str
    source: str
    excerpt: str
    score: float = 0.0


class EventCard(BaseModel):
    event_id: str
    title: str
    city: str
    venue: str
    date: str
    time: Optional[str] = None
    price: float
    available_seats: int
    category: Optional[str] = None


class PendingAction(BaseModel):
    action: str  # create_booking, cancel_booking, lock_seats
    payload: Dict[str, Any] = Field(default_factory=dict)
    summary: str
    requires_confirmation: bool = True


class ConfirmationState(BaseModel):
    confirmed: bool
    action: str
    payload: Dict[str, Any] = Field(default_factory=dict)


class ChatMessage(BaseModel):
    role: str  # user, assistant, system, tool
    content: str


class ChatRequest(BaseModel):
    conversation_id: str = "default"
    message: str
    user: Optional[UserContext] = None
    auth_token: Optional[str] = None
    history: List[ChatMessage] = Field(default_factory=list)
    confirmation_state: Optional[ConfirmationState] = None


class ChatResponse(BaseModel):
    conversation_id: str
    message: str
    citations: List[Citation] = Field(default_factory=list)
    is_rag_grounded: bool = False
    event_cards: List[EventCard] = Field(default_factory=list)
    requires_confirmation: bool = False
    pending_action: Optional[PendingAction] = None
    tool_calls_used: List[Dict[str, Any]] = Field(default_factory=list)


class RAGQueryRequest(BaseModel):
    question: str
    top_k: int = 3
    filters: Optional[Dict[str, Any]] = None


class RAGQueryResponse(BaseModel):
    question: str
    answer: str
    citations: List[Citation] = Field(default_factory=list)
    sources_count: int = 0


class IngestResponse(BaseModel):
    status: str
    documents_indexed: int
    chunks_indexed: int
    errors: List[str] = Field(default_factory=list)
