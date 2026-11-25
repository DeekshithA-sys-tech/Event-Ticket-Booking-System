import hashlib
from typing import Any, Dict, List, Optional, Tuple
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


class ChromaVectorStore:
    """
    ChromaDB persistent vector database storing dense embeddings with Cosine Similarity (HNSW).
    Embeddings are generated via 'all-MiniLM-L6-v2' (dim=384) with zero external network dependencies.
    """

    def __init__(self, dim: int = 384, collection_name: Optional[str] = None):
        self.dim = dim
        self.collection_name = collection_name or getattr(settings, "CHROMA_COLLECTION_NAME", "eventpulse_vectors")
        self.chunks_map: Dict[str, TextChunk] = {}
        self.chunks: List[TextChunk] = []

        # Initialize ChromaDB Client
        import chromadb
        try:
            persist_dir = str(getattr(settings, "CHROMA_PERSIST_DIR", settings.DATA_DIR / "chroma_db"))
            self.client = chromadb.PersistentClient(path=persist_dir)
            logger.info(f"[ChromaDB] Initialized persistent ChromaDB at {persist_dir}")
        except Exception as e:
            logger.warning(f"[ChromaDB] PersistentClient failed ({e}), falling back to Ephemeral Client.")
            self.client = chromadb.Client()

        # Get or create collection with cosine space
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def _sanitize_metadata(self, meta: Dict[str, Any]) -> Dict[str, Any]:
        """ChromaDB metadata values must be str, int, float, or bool."""
        clean = {}
        for k, v in meta.items():
            if v is None:
                clean[k] = ""
            elif isinstance(v, (str, int, float, bool)):
                clean[k] = v
            else:
                clean[k] = str(v)
        return clean

    def fit(self, chunks: List[TextChunk]):
        """Indexes text chunks and their dense embeddings into ChromaDB collection."""
        self.chunks = chunks
        self.chunks_map = {chunk.chunk_id: chunk for chunk in chunks}
        if not chunks:
            return

        model = get_embedding_model()
        texts = [chunk.full_content for chunk in chunks]

        if model is not None:
            try:
                embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
                vectors = np.array(embeddings, dtype=np.float32)
                self.dim = vectors.shape[1]
                logger.info(f"[ChromaDB] Encoded {len(chunks)} chunks with all-MiniLM-L6-v2 (dim={self.dim}).")
            except Exception as e:
                logger.warning(f"[ChromaDB] Model encoding failed: {e}. Using fallback vectorizer.")
                vectors = np.array([text_to_dense_vector(t, dim=self.dim) for t in texts], dtype=np.float32)
        else:
            vectors = np.array([text_to_dense_vector(t, dim=self.dim) for t in texts], dtype=np.float32)

        ids = [chunk.chunk_id for chunk in chunks]
        metadatas = [self._sanitize_metadata(chunk.metadata) for chunk in chunks]

        try:
            self.collection.upsert(
                ids=ids,
                documents=texts,
                embeddings=vectors.tolist(),
                metadatas=metadatas,
            )
            logger.info(f"[ChromaDB] Successfully upserted {len(chunks)} vectors into collection '{self.collection_name}'.")
        except Exception as e:
            logger.error(f"[ChromaDB] Failed to upsert chunks into ChromaDB: {e}", exc_info=True)

    def search(
        self, query: str, top_k: int = 10, filters: Dict = None, min_similarity: float = 0.12
    ) -> List[Tuple[TextChunk, float]]:
        """Queries ChromaDB using cosine similarity and returns ranked (chunk, score) tuples."""
        if not self.chunks_map or not query.strip():
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

        n_results = min(top_k * 3, len(self.chunks_map))
        if n_results == 0:
            return []

        try:
            res = self.collection.query(
                query_embeddings=[q_vec.tolist()],
                n_results=n_results,
            )
        except Exception as e:
            logger.error(f"[ChromaDB] Query failed: {e}")
            return []

        retrieved_ids = res.get("ids", [[]])[0]
        distances = res.get("distances", [[]])[0]

        results: List[Tuple[TextChunk, float]] = []
        for c_id, dist in zip(retrieved_ids, distances):
            chunk = self.chunks_map.get(c_id)
            if not chunk:
                continue

            # Cosine space in ChromaDB returns cosine distance d = 1 - cosine_similarity
            # Thus similarity score = 1.0 - d
            sim = float(max(-1.0, min(1.0, 1.0 - dist)))
            if sim < min_similarity:
                continue

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

            results.append((chunk, sim))

        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]


# Alias DenseVectorIndex to ChromaVectorStore for seamless drop-in backwards compatibility
DenseVectorIndex = ChromaVectorStore
