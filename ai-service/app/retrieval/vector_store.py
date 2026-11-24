import hashlib
from typing import Dict, List, Optional, Tuple
import numpy as np

from app.core.config import settings
from app.core.logging import logger
from app.ingestion.chunker import TextChunk

# Singleton cached SentenceTransformer instance
_transformer_model = None
_model_load_attempted = False


def get_embedding_model():
    """Returns the singleton SentenceTransformer('all-MiniLM-L6-v2') instance."""
    global _transformer_model, _model_load_attempted
    if _transformer_model is None and not _model_load_attempted:
        _model_load_attempted = True
        try:
            from sentence_transformers import SentenceTransformer
            model_name = getattr(settings, "EMBEDDING_MODEL", "all-MiniLM-L6-v2")
            logger.info(f"[VectorStore] Loading SentenceTransformer '{model_name}'...")
            _transformer_model = SentenceTransformer(model_name)
            logger.info(f"[VectorStore] SentenceTransformer '{model_name}' successfully initialized.")
        except Exception as e:
            logger.warning(f"[VectorStore] Could not load SentenceTransformer: {e}. Falling back to internal n-gram embedder.")
            _transformer_model = None
    return _transformer_model


def text_to_dense_vector(text: str, dim: int = 384) -> np.ndarray:
    """
    Fallback deterministic n-gram vectorizer if SentenceTransformer is unavailable.
    """
    vec = np.zeros(dim, dtype=np.float32)
    clean = text.lower().strip()
    if not clean:
        return vec

    words = clean.split()
    features: List[str] = words.copy()
    for w in words:
        if len(w) >= 3:
            for i in range(len(w) - 2):
                features.append(w[i : i + 3])

    for feat in features:
        h = int(hashlib.md5(feat.encode("utf-8")).hexdigest()[:8], 16)
        idx = h % dim
        sign = 1.0 if ((h >> 8) & 1) else -1.0
        vec[idx] += sign

    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec


class DenseVectorIndex:
    """
    In-memory semantic vector store powered by 'all-MiniLM-L6-v2' embeddings
    with Cosine Similarity search and metadata filtering.
    100% offline, zero-cost, runs on local CPU.
    """

    def __init__(self, dim: int = 384):
        self.dim = dim
        self.chunks: List[TextChunk] = []
        self.vectors: np.ndarray = np.empty((0, dim), dtype=np.float32)

    def fit(self, chunks: List[TextChunk]):
        self.chunks = chunks
        if not chunks:
            self.vectors = np.empty((0, self.dim), dtype=np.float32)
            return

        model = get_embedding_model()
        if model is not None:
            try:
                texts = [chunk.full_content for chunk in chunks]
                embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
                self.vectors = np.array(embeddings, dtype=np.float32)
                self.dim = self.vectors.shape[1]
                logger.info(f"[VectorStore] Vectorized {len(chunks)} chunks using all-MiniLM-L6-v2 (dim={self.dim}).")
                return
            except Exception as e:
                logger.warning(f"[VectorStore] Model encoding failed: {e}. Using fallback vectorizer.")

        # Fallback encoding
        matrix = np.zeros((len(chunks), self.dim), dtype=np.float32)
        for i, chunk in enumerate(chunks):
            matrix[i] = text_to_dense_vector(chunk.full_content, dim=self.dim)
        self.vectors = matrix

    def search(
        self, query: str, top_k: int = 10, filters: Dict = None, min_similarity: float = 0.12
    ) -> List[Tuple[TextChunk, float]]:
        if self.vectors.shape[0] == 0 or not query.strip():
            return []

        model = get_embedding_model()
        if model is not None:
            try:
                q_vec = model.encode([query], normalize_embeddings=True, show_progress_bar=False)[0]
                q_vec = np.array(q_vec, dtype=np.float32)
            except Exception:
                q_vec = text_to_dense_vector(query, dim=self.dim)
        else:
            q_vec = text_to_dense_vector(query, dim=self.dim)

        # Since vectors are L2-normalized, inner product = cosine similarity
        sims = np.dot(self.vectors, q_vec)

        results: List[Tuple[TextChunk, float]] = []
        for idx, score in enumerate(sims):
            if float(score) < min_similarity:
                continue
            chunk = self.chunks[idx]

            # Apply metadata filters if provided
            if filters:
                match = True
                for k, v in filters.items():
                    chunk_val = chunk.metadata.get(k)
                    if chunk_val is not None:
                        if isinstance(v, str) and isinstance(chunk_val, str):
                            if v.lower() != chunk_val.lower():
                                match = False
                                break
                        elif v != chunk_val:
                            match = False
                            break
                if not match:
                    continue

            results.append((chunk, float(score)))

        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]
