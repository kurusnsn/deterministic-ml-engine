"""
Fallback LLM client for when Modal GPU is cold or unavailable.

Fallback Chain:
1. Groq API (Llama 3.3 70B) - Ultra-low latency, runs same model family as Modal
2. OpenAI API (GPT-4o-mini) - Secondary fallback if Groq unavailable
"""
import os
import json
import httpx
import logging
from typing import List, Dict, Any, Optional


logger = logging.getLogger(__name__)


class GroqFallback:
    """Groq API client for ultra-fast Llama inference during cold starts"""

    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        # Llama 3.3 70B - same model family as our Modal GPU, best quality
        self.model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        self.base_url = "https://api.groq.com/openai/v1"

    def is_available(self) -> bool:
        """Check if Groq API key is configured"""
        return bool(self.api_key)

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 700,
        temperature: float = 0.7,
        timeout: float = 30.0
    ) -> Dict[str, Any]:
        """
        Call Groq API with same interface as Modal endpoint.
        Returns response in OpenAI-compatible format.
        """
        if not self.api_key:
            raise ValueError("GROQ_API_KEY not set in environment")

        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
            "n": 1,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers
            )
            response.raise_for_status()
            result = response.json()
            # Add provider metadata
            result["_fallback_provider"] = "groq"
            result["_model"] = self.model
            return result


class OpenAIFallback:
    """OpenAI API client for fallback when Modal GPU is cold"""

    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.base_url = "https://api.openai.com/v1"

    def is_available(self) -> bool:
        """Check if OpenAI API key is configured"""
        return bool(self.api_key)

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 700,
        temperature: float = 0.7,
        timeout: float = 30.0
    ) -> Dict[str, Any]:
        """
        Call OpenAI API with same interface as Modal endpoint.
        Returns response in OpenAI format (compatible with Modal response).
        """
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY not set in environment")

        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
            "n": 1,
            "presence_penalty": 0.1,  # Same as Modal config
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers
            )
            response.raise_for_status()
            result = response.json()
            # Add provider metadata
            result["_fallback_provider"] = "openai"
            result["_model"] = self.model
            return result


# Global instances
_groq_fallback: Optional[GroqFallback] = None
_openai_fallback: Optional[OpenAIFallback] = None


def get_groq_fallback() -> GroqFallback:
    """Get or create singleton Groq fallback client"""
    global _groq_fallback
    if _groq_fallback is None:
        _groq_fallback = GroqFallback()
    return _groq_fallback


def get_openai_fallback() -> OpenAIFallback:
    """Get or create singleton OpenAI fallback client"""
    global _openai_fallback
    if _openai_fallback is None:
        _openai_fallback = OpenAIFallback()
    return _openai_fallback


async def call_fallback_llm(
    messages: List[Dict[str, str]],
    max_tokens: int = 700,
    temperature: float = 0.7
) -> Dict[str, Any]:
    """
    Call fallback LLM with cascading providers.
    
    Priority:
    1. Groq (Llama 3.3 70B) - Same model family, ultra-low latency
    2. OpenAI (GPT-4o-mini) - Reliable backup
    
    Returns response in same format as Modal endpoint.
    """
    # Try Groq first (Llama - same model family as Modal GPU)
    groq = get_groq_fallback()
    if groq.is_available():
        try:
            logger.info(
                "[FALLBACK] Using Groq (Llama 3.3 70B) for cold start",
                extra={"domain": "llm"},
            )
            result = await groq.chat_completion(
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
            return result
        except Exception as e:
            logger.warning(
                "[FALLBACK] Groq failed: %s, trying OpenAI...",
                e,
                extra={"domain": "llm"},
            )

    # Fallback to OpenAI
    openai = get_openai_fallback()
    if openai.is_available():
        try:
            logger.info(
                "[FALLBACK] Using OpenAI (GPT-4o-mini) for cold start",
                extra={"domain": "llm"},
            )
            result = await openai.chat_completion(
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
            return result
        except Exception as e:
            return {
                "error": f"All fallback LLMs failed. OpenAI error: {str(e)}",
                "status_code": 500
            }

    # No fallback available
    return {
        "error": "No fallback LLM available. Set GROQ_API_KEY or OPENAI_API_KEY.",
        "status_code": 503
    }


async def call_fallback_llm_streaming(
    messages: List[Dict[str, str]],
    max_tokens: int = 700,
    temperature: float = 0.7
):
    """
    Call fallback LLM with streaming support.
    
    Priority:
    1. Groq (Llama 3.3 70B) - Ultra-fast, same model family
    2. OpenAI (GPT-4o-mini) - Reliable backup
    
    Yields text chunks as they arrive.
    """
    # Try Groq first
    groq_api_key = os.getenv("GROQ_API_KEY")
    if groq_api_key:
        try:
            logger.info(
                "[FALLBACK STREAMING] Using Groq (Llama 3.3 70B)",
                extra={"domain": "llm"},
            )
            model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            
            payload = {
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "stream": True,
                "n": 1,
            }

            headers = {
                "Authorization": f"Bearer {groq_api_key}",
                "Content-Type": "application/json"
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload,
                    headers=headers
                ) as response:
                    async for line in response.aiter_lines():
                        if not line or line == "":
                            continue

                        if line.startswith("data: "):
                            data_str = line[6:]

                            if data_str == "[DONE]":
                                return

                            try:
                                data = json.loads(data_str)
                                delta = data.get("choices", [{}])[0].get("delta", {})
                                content = delta.get("content", "")

                                if content:
                                    yield {"type": "chunk", "text": content, "provider": "groq"}
                            except json.JSONDecodeError:
                                continue
            return  # Successfully completed with Groq
        except Exception as e:
            logger.warning(
                "[FALLBACK STREAMING] Groq failed: %s, trying OpenAI...",
                e,
                extra={"domain": "llm"},
            )

    # Fallback to OpenAI
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        yield {"error": "No fallback LLM available. Set GROQ_API_KEY or OPENAI_API_KEY."}
        return

    logger.info(
        "[FALLBACK STREAMING] Using OpenAI (GPT-4o-mini)",
        extra={"domain": "llm"},
    )
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
        "n": 1,
        "presence_penalty": 0.1,
    }

    headers = {
        "Authorization": f"Bearer {openai_api_key}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            json=payload,
            headers=headers
        ) as response:
            async for line in response.aiter_lines():
                if not line or line == "":
                    continue

                if line.startswith("data: "):
                    data_str = line[6:]

                    if data_str == "[DONE]":
                        break

                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")

                        if content:
                            yield {"type": "chunk", "text": content, "provider": "openai"}
                    except json.JSONDecodeError:
                        continue
