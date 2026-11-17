"""
EventAgent: Multi-step orchestrator loop coordinating LLM reasoning,
RBAC tool filtering, execution, and two-phase human confirmations.
"""
import json
from typing import Any, Dict, List, Optional
from app.config import settings
from app.models.schemas import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    PendingAction,
    ToolCallRecord,
)
from app.prompts.system_prompts import get_system_prompt
from app.providers.base import BaseAIProvider
from app.providers.llm_provider import LLMProvider
from app.providers.mock_provider import MockProvider
from app.tools import tool_registry


class EventAgent:
    def __init__(self, provider: Optional[BaseAIProvider] = None):
        if provider:
            self.provider = provider
        elif settings.AI_PROVIDER in ["openai", "gemini"]:
            self.provider = LLMProvider()
        else:
            self.provider = MockProvider()

    async def chat(self, request: ChatRequest) -> ChatResponse:
        user_context = request.user.model_dump() if request.user else {"role": "customer"}
        role = user_context.get("role", "customer")

        # 1. Prepare system prompt and tools
        system_prompt = get_system_prompt(role)
        available_tools = tool_registry.get_tools_for_role(role)

        # 2. Prepare message history with sliding window (last 10 turns)
        messages: List[ChatMessage] = []
        if request.history:
            messages.extend(request.history[-10:])
        messages.append(ChatMessage(role="user", content=request.message))

        tool_calls_used: List[ToolCallRecord] = []
        max_turns = 5
        turn = 0

        # 3. Agent reasoning & tool execution loop
        while turn < max_turns:
            turn += 1

            completion = await self.provider.generate_response(
                messages=messages,
                tools=available_tools,
                system_prompt=system_prompt,
                user_context=user_context,
            )

            assistant_content = completion.get("content", "")
            raw_tool_calls = completion.get("tool_calls", [])

            # Case A: No tool calls requested -> return assistant response
            if not raw_tool_calls:
                return ChatResponse(
                    conversation_id=request.conversation_id,
                    message=assistant_content or "I have processed your request.",
                    requires_confirmation=False,
                    pending_action=None,
                    tool_calls_used=tool_calls_used,
                )

            # Case B: Tool calls requested
            # First, check if any tool requires human confirmation and is not confirmed
            for tc in raw_tool_calls:
                t_name = tc.get("name")
                t_args = tc.get("args", {})
                tool_def = tool_registry.get_tool(t_name)

                if tool_def and tool_def.requires_confirmation:
                    is_confirmed = False
                    if request.confirmation_state:
                        is_confirmed = request.confirmation_state.confirmed and (
                            request.confirmation_state.action == t_name
                        )

                    if not is_confirmed:
                        # Intercept and return confirmation requirement
                        summary = await tool_registry._generate_confirmation_summary(
                            t_name, t_args, request.auth_token
                        )
                        return ChatResponse(
                            conversation_id=request.conversation_id,
                            message=assistant_content
                            or f"Before proceeding, please confirm this action:\n\n**{summary}**",
                            requires_confirmation=True,
                            pending_action=PendingAction(
                                action=t_name,
                                summary=summary,
                                payload=t_args,
                            ),
                            tool_calls_used=tool_calls_used,
                        )

            # If all tool calls are allowed/confirmed, execute them
            # Append assistant message with tool calls to context
            messages.append(
                ChatMessage(
                    role="assistant",
                    content=assistant_content,
                    tool_calls=raw_tool_calls,
                )
            )

            for tc in raw_tool_calls:
                t_id = tc.get("id", "call_1")
                t_name = tc.get("name")
                t_args = tc.get("args", {})

                # Execute tool
                result = await tool_registry.execute_tool(
                    name=t_name,
                    args=t_args,
                    auth_token=request.auth_token,
                    user_context=user_context,
                    confirmation_state=request.confirmation_state,
                )

                # Record execution
                tool_calls_used.append(
                    ToolCallRecord(
                        id=t_id,
                        name=t_name,
                        args=t_args,
                        result=result,
                    )
                )

                # Append tool result to context
                messages.append(
                    ChatMessage(
                        role="tool",
                        content=json.dumps(result),
                        tool_call_id=t_id,
                    )
                )

        # Fallback if loop exceeded max_turns
        return ChatResponse(
            conversation_id=request.conversation_id,
            message="Completed processing your query.",
            requires_confirmation=False,
            pending_action=None,
            tool_calls_used=tool_calls_used,
        )
