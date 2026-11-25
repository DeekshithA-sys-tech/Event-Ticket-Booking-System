import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "EventPulse RAG AI Service"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Express Backend Gateway URL
    EXPRESS_BASE_URL: str = os.getenv("EXPRESS_BASE_URL", "http://localhost:5000/api/v1")

    # Knowledge Base Path
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    KNOWLEDGE_DIR: Path = BASE_DIR.parent / "knowledge"
    DATA_DIR: Path = BASE_DIR / "data"
    CHROMA_PERSIST_DIR: Path = DATA_DIR / "chroma_db"
    CHROMA_COLLECTION_NAME: str = "eventpulse_vectors"

    # RAG Retrieval Configuration
    TOP_K_RETRIEVAL: int = 5
    SIMILARITY_THRESHOLD: float = 0.20
    BM25_WEIGHT: float = 0.5
    VECTOR_WEIGHT: float = 0.5
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

    # Free LLM API Providers (Google Gemini & Groq)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "auto")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "*",
    ]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
