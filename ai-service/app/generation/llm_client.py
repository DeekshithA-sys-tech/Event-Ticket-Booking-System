import os
from typing import Optional
import httpx

from app.core.config import settings
from app.core.logging import logger

SYSTEM_GROUNDING_PROMPT = """You are the official EventPulse AI Assistant for the Event Ticket Booking System.
You must answer the user's question accurately, concisely, and strictly based on the provided retrieved documentation context.

STRICT INSTRUCTIONS:
1. Every factual statement derived from the context MUST include a citation marker matching the source number, e.g. [1], [2].
2. Do NOT invent policies, prices, refund amounts, or availability that are not present in the context.
3. If the context does not contain enough information to answer the question, state politely that you could not find that information in official EventPulse records.
4. Keep the tone helpful, professional, and clear. Format with markdown headings and bullet points where appropriate.
"""


class LLMClient:
    """
    Unified LLM Client supporting free tier providers (Google Gemini & Groq).
    Falls back gracefully when no API keys are provided.
    """

    def __init__(self):
        self.gemini_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
        self.groq_key = settings.GROQ_API_KEY or os.getenv("GROQ_API_KEY", "")
        self.preferred_provider = getattr(settings, "LLM_PROVIDER", "auto").lower()

    def is_available(self) -> bool:
        """Returns True if any free LLM API key (Gemini or Groq) is configured."""
        self._refresh_keys()
        return bool(self.gemini_key or self.groq_key)

    def _refresh_keys(self):
        self.gemini_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
        self.groq_key = settings.GROQ_API_KEY or os.getenv("GROQ_API_KEY", "")

    async def generate_grounded_response(
        self,
        question: str,
        context_text: str,
    ) -> Optional[str]:
        """
        Calls Gemini or Groq to synthesize a natural, grounded answer with [1], [2] citations.
        Returns None if no API key is available or on network failure.
        """
        self._refresh_keys()
        if not self.is_available():
            return None

        # Determine provider
        use_gemini = False
        use_groq = False

        if self.preferred_provider == "gemini" and self.gemini_key:
            use_gemini = True
        elif self.preferred_provider == "groq" and self.groq_key:
            use_groq = True
        elif self.gemini_key:
            use_gemini = True
        elif self.groq_key:
            use_groq = True

        prompt = (
            f"{SYSTEM_GROUNDING_PROMPT}\n\n"
            f"=== RETRIEVED CONTEXT ===\n{context_text}\n\n"
            f"=== USER QUESTION ===\n{question}\n\n"
            f"=== GROUNDED ANSWER WITH [1], [2] CITATIONS ==="
        )

        if use_gemini:
            try:
                from google import genai
                client = genai.Client(api_key=self.gemini_key)
                model_name = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
                logger.info(f"[LLMClient] Calling Google Gemini API ({model_name})...")
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                if response and response.text:
                    logger.info("[LLMClient] Google Gemini generated response successfully.")
                    return response.text.strip()
            except Exception as e:
                logger.warning(f"[LLMClient] Gemini generation failed: {e}. Attempting fallback...")

        if use_groq or (use_gemini and self.groq_key):
            try:
                model_name = getattr(settings, "GROQ_MODEL", "llama-3.3-70b-versatile")
                logger.info(f"[LLMClient] Calling Groq API ({model_name})...")
                async with httpx.AsyncClient(timeout=20.0) as client:
                    resp = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.groq_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": model_name,
                            "messages": [
                                {"role": "system", "content": SYSTEM_GROUNDING_PROMPT},
                                {
                                    "role": "user",
                                    "content": f"Context:\n{context_text}\n\nQuestion: {question}",
                                },
                            ],
                            "temperature": 0.2,
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        text = data["choices"][0]["message"]["content"]
                        logger.info("[LLMClient] Groq generated response successfully.")
                        return text.strip()
            except Exception as e:
                logger.warning(f"[LLMClient] Groq generation failed: {e}")

        return None


llm_client = LLMClient()
