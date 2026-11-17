"""
LLM Provider supporting OpenAI and Google Gemini with automatic fallback to MockProvider.
"""
from typing import Any, Dict, List, Optional
import httpx
from app.config import settings
from app.models.schemas import ChatMessage
from app.providers.base import BaseAIProvider
from app.providers.mock_provider import MockProvider


class LLMProvider(BaseAIProvider):
    """
    Online LLM Provider that interfaces with OpenAI or Gemini API for tool calling.
    Falls back gracefully to MockProvider if API keys are missing or requests fail.
    """

    def __init__(self):
        self.mock_fallback = MockProvider()

    async def generate_response(
        self,
        messages: List[ChatMessage],
        tools: List[Dict[str, Any]],
        system_prompt: str,
        user_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        # If explicitly mock or keys missing, delegate to mock
        provider = settings.AI_PROVIDER.lower()

        if provider == "openai" and settings.OPENAI_API_KEY:
            try:
                return await self._call_openai(messages, tools, system_prompt)
            except Exception as e:
                # Log or note error, fall back to mock
                res = await self.mock_fallback.generate_response(messages, tools, system_prompt, user_context)
                res["content"] = f"*(Note: OpenAI call failed ({str(e)}), responded via local engine)*\n\n" + res.get("content", "")
                return res

        elif provider == "gemini" and settings.GEMINI_API_KEY:
            try:
                return await self._call_gemini(messages, tools, system_prompt)
            except Exception as e:
                res = await self.mock_fallback.generate_response(messages, tools, system_prompt, user_context)
                res["content"] = f"*(Note: Gemini call failed ({str(e)}), responded via local engine)*\n\n" + res.get("content", "")
                return res

        # Default to mock provider
        return await self.mock_fallback.generate_response(messages, tools, system_prompt, user_context)

    async def _call_openai(
        self, messages: List[ChatMessage], tools: List[Dict[str, Any]], system_prompt: str
    ) -> Dict[str, Any]:
        api_messages = [{"role": "system", "content": system_prompt}]
        for m in messages:
            msg_dict: Dict[str, Any] = {"role": m.role, "content": m.content}
            if m.tool_calls:
                msg_dict["tool_calls"] = m.tool_calls
            if m.tool_call_id:
                msg_dict["tool_call_id"] = m.tool_call_id
            api_messages.append(msg_dict)

        payload: Dict[str, Any] = {
            "model": settings.OPENAI_MODEL,
            "messages": api_messages,
        }

        if tools:
            # Transform tools into OpenAI function calling format
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t["description"],
                        "parameters": t.get("parameters", {}),
                    },
                }
                for t in tools
            ]
            payload["tool_choice"] = "auto"

        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post("https://api.openai.com/v1/chat/completions", json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        choice = data["choices"][0]["message"]
        tool_calls = []
        if "tool_calls" in choice and choice["tool_calls"]:
            import json
            for tc in choice["tool_calls"]:
                tool_calls.append({
                    "id": tc["id"],
                    "name": tc["function"]["name"],
                    "args": json.loads(tc["function"].get("arguments", "{}")),
                })

        return {
            "content": choice.get("content") or "",
            "tool_calls": tool_calls,
        }

    async def _call_gemini(
        self, messages: List[ChatMessage], tools: List[Dict[str, Any]], system_prompt: str
    ) -> Dict[str, Any]:
        # Simple Gemini REST API call with tool declarations
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
        
        contents = []
        for m in messages:
            role = "user" if m.role in ["user", "system"] else "model"
            contents.append({
                "role": role,
                "parts": [{"text": m.content}]
            })

        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        text = ""
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            for p in parts:
                if "text" in p:
                    text += p["text"]

        return {
            "content": text,
            "tool_calls": [],
        }
