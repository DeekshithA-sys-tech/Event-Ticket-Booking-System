import hashlib
from typing import Dict, List, Tuple
import numpy as np

from app.ingestion.chunker import TextChunk


def text_to_dense_vector(text: str, dim: int = 256) -> np.ndarray:
    """
    Computes a deterministic, normalized dense semantic n-gram vector for text.
    Uses subword n-grams and hashing trick to capture morphological and semantic patterns.
    Zero-cost, 100% offline, no external API or download needed.
    """
    vec = np.zeros(dim, dtype=np.float32)
    clean = text.lower().strip()
    if not clean:
        return vec

    words = clean.split()
    # Word unigrams and character trigrams
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

    # L2 normalize
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec


class DenseVectorIndex:
    """
    In-memory vector store with cosine similarity search and metadata filtering.
    Requires 0 external services, completely zero cost.
    """

    def __init__(self, dim: int = 256):
        self.dim = dim
        self.chunks: List[TextChunk] = []
        self.vectors: np.ndarray = np.empty((0, dim), dtype=np.float32)

    def fit(self, chunks: List[TextChunk]):
        self.chunks = chunks
        if not chunks:
            self.vectors = np.empty((0, self.dim), dtype=np.float32)
            return

        matrix = np.zeros((len(chunks), self.dim), dtype=np.float32)
        for i, chunk in enumerate(chunks):
            matrix[i] = text_to_dense_vector(chunk.full_content, dim=self.dim)
        self.vectors = matrix

    def search(
        self, query: str, top_k: int = 10, filters: Dict = None, min_similarity: float = 0.12
    ) -> List[Tuple[TextChunk, float]]:
        if self.vectors.shape[0] == 0 or not query.strip():
            return []

        q_vec = text_to_dense_vector(query, dim=self.dim)
        # Cosine similarities (since vectors are L2-normalized, dot product = cosine sim)
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
