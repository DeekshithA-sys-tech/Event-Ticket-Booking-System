from typing import Any, Dict, List, Tuple
from app.core.config import settings
from app.core.logging import logger
from app.ingestion.chunker import TextChunk
from app.retrieval.bm25 import BM25Index
from app.retrieval.vector_store import DenseVectorIndex


class HybridRetriever:
    """
    Hybrid Search Engine combining BM25 Lexical + Dense Semantic Vector Search
    with Reciprocal Rank Fusion (RRF) reranking.
    100% zero-cost, runs completely locally on CPU/RAM.
    """

    def __init__(self, rrf_k: int = 60):
        self.rrf_k = rrf_k
        self.bm25 = BM25Index()
        self.vector_store = DenseVectorIndex()
        self.chunks: List[TextChunk] = []

    def index_chunks(self, chunks: List[TextChunk]):
        self.chunks = chunks
        self.bm25.fit(chunks)
        self.vector_store.fit(chunks)
        logger.info(f"[Retriever] Successfully indexed {len(chunks)} chunks into Hybrid Engine.")

    def search(
        self,
        query: str,
        top_k: int = 5,
        filters: Dict[str, Any] = None,
        role: str = "customer",
    ) -> List[Tuple[TextChunk, float]]:
        """
        Executes parallel BM25 and Vector Search, merges using RRF,
        applies metadata filters and role-based access control.
        """
        if not self.chunks or not query.strip():
            return []

        # 1. Parallel candidate retrieval (fetch top 20 each)
        bm25_candidates = self.bm25.search(query, top_k=20)
        vector_candidates = self.vector_store.search(query, top_k=20, filters=filters)

        # 2. Reciprocal Rank Fusion (RRF)
        # RRF score = sum(weight / (k + rank))
        rrf_scores: Dict[str, float] = {}
        chunk_map: Dict[str, TextChunk] = {}

        # BM25 rank contribution (weight = 0.5)
        for rank, (chunk, _) in enumerate(bm25_candidates):
            c_id = chunk.chunk_id
            chunk_map[c_id] = chunk
            rrf_scores[c_id] = rrf_scores.get(c_id, 0.0) + (settings.BM25_WEIGHT / (self.rrf_k + rank + 1))

        # Vector rank contribution (weight = 0.5)
        for rank, (chunk, _) in enumerate(vector_candidates):
            c_id = chunk.chunk_id
            chunk_map[c_id] = chunk
            rrf_scores[c_id] = rrf_scores.get(c_id, 0.0) + (settings.VECTOR_WEIGHT / (self.rrf_k + rank + 1))

        # 3. Filter by Role & Metadata
        filtered_results: List[Tuple[TextChunk, float]] = []

        for c_id, score in rrf_scores.items():
            chunk = chunk_map[c_id]
            meta = chunk.metadata

            # Role-based access control filter:
            # Customers cannot access organizer or admin documents
            access_level = meta.get("access_level", "public")
            if role == "customer" and access_level in ["organizer", "admin"]:
                continue
            if role == "organizer" and access_level == "admin":
                continue

            # Status filter: Customers can only see published events
            status = meta.get("status")
            if status and role == "customer" and status != "published":
                continue

            # City filter
            if filters and "city" in filters and meta.get("city"):
                if meta.get("city").lower() != str(filters["city"]).lower():
                    continue

            # Price filter
            if filters and "max_price" in filters and meta.get("price") is not None:
                if float(meta.get("price")) > float(filters["max_price"]):
                    continue

            filtered_results.append((chunk, score))

        # 4. Sort by RRF score descending
        filtered_results.sort(key=lambda x: x[1], reverse=True)

        # 5. Diversity / Deduplication (MMR-like simple spacing by doc_id)
        final_results: List[Tuple[TextChunk, float]] = []
        seen_sections: set = set()

        for chunk, score in filtered_results:
            section_key = f"{chunk.doc_id}_{chunk.metadata.get('section', '')}"
            if section_key in seen_sections and len(final_results) >= 2:
                continue
            seen_sections.add(section_key)
            final_results.append((chunk, score))
            if len(final_results) >= top_k:
                break

        return final_results
