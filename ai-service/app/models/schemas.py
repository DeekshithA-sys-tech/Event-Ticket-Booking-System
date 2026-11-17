"""
Pydantic Schemas for AI Chat & Tool Interactions.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class UserContext(BaseModel):
    user_id: Optional[str] = Field(None, description="MongoDB ObjectId of authenticated user")
    role: str = Field("customer", description="Role: customer, organizer, or admin")
    email: Optional[str] = Field(None, description="Email of user")


class ConfirmationState(BaseModel):
    confirmed: bool = Field(False, description="Whether the user explicitly confirmed the pending action")
    action: Optional[str] = Field(None, description="Name of the action, e.g. create_booking or cancel_booking")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Action arguments payload")


class ToolCallRecord(BaseModel):
    id: str = Field(..., description="Unique tool call invocation ID")
    name: str = Field(..., description="Tool name, e.g. search_events")
    args: Dict[str, Any] = Field(default_factory=dict, description="Input parameters passed to the tool")
    result: Optional[Any] = Field(None, description="Output returned by the tool")


class ChatMessage(BaseModel):
    role: str = Field(..., description="'user', 'assistant', 'system', or 'tool'")
    content: str = Field(..., description="Message text content")
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


class ChatRequest(BaseModel):
    conversation_id: str = Field("default", description="Conversation session ID")
    message: str = Field(..., min_length=1, description="Latest message from user")
    user: Optional[UserContext] = Field(default_factory=lambda: UserContext(role="customer"))
    auth_token: Optional[str] = Field(None, description="JWT Bearer token for authenticated Express calls")
    history: List[ChatMessage] = Field(default_factory=list, description="Recent conversation turns")
    confirmation_state: Optional[ConfirmationState] = Field(None, description="Explicit human confirmation state")


class PendingAction(BaseModel):
    action: str = Field(..., description="Action requiring user confirmation")
    summary: str = Field(..., description="Summary of action (e.g. 2 seats for Rock Concert, Total: ₹2000)")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Parameters to execute once confirmed")


class ChatResponse(BaseModel):
    conversation_id: str
    message: str
    requires_confirmation: bool = False
    pending_action: Optional[PendingAction] = None
    tool_calls_used: List[ToolCallRecord] = Field(default_factory=list)
