"""
Base AI Provider Interface.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from app.models.schemas import ChatMessage


class BaseAIProvider(ABC):
    """Abstract interface defining the contract for AI completions and tool calling."""

    @abstractmethod
    async def generate_response(
        self,
        messages: List[ChatMessage],
        tools: List[Dict[str, Any]],
        system_prompt: str,
        user_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate a response or request tool calls.

        Returns:
            Dict containing:
            - 'content': str (assistant message, or None if pure tool call)
            - 'tool_calls': List[Dict] with keys 'id', 'name', 'args'
        """
        pass
