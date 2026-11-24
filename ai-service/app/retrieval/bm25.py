import math
import re
from typing import Dict, List, Tuple
from app.ingestion.chunker import TextChunk


def tokenize(text: str) -> List[str]:
    """Tokenizes text into lowercase alphanumeric words."""
    return re.findall(r"\b[a-zA-Z0-9_-]+\b", text.lower())


class BM25Index:
    """
    Self-contained BM25Okapi implementation for lexical search.
    Requires 0 external dependencies, 100% zero-cost.
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.chunks: List[TextChunk] = []
        self.doc_len: List[int] = []
        self.avg_dl: float = 0.0
        self.idf: Dict[str, float] = {}
        self.doc_freq: Dict[str, int] = {}
        self.term_freqs: List[Dict[str, int]] = []

    def fit(self, chunks: List[TextChunk]):
        self.chunks = chunks
        num_docs = len(chunks)
        if num_docs == 0:
            return

        self.doc_len = []
        self.term_freqs = []
        self.doc_freq = {}

        total_len = 0
        for chunk in chunks:
            tokens = tokenize(chunk.full_content)
            length = len(tokens)
            self.doc_len.append(length)
            total_len += length

            tf: Dict[str, int] = {}
            for t in tokens:
                tf[t] = tf.get(t, 0) + 1
            self.term_freqs.append(tf)

            for t in tf.keys():
                self.doc_freq[t] = self.doc_freq.get(t, 0) + 1

        self.avg_dl = total_len / num_docs if num_docs > 0 else 1.0

        # Compute IDF
        self.idf = {}
        for term, df in self.doc_freq.items():
            # Standard Lucene/BM25 IDF formula
            self.idf[term] = math.log(1.0 + (num_docs - df + 0.5) / (df + 0.5))

    def search(self, query: str, top_k: int = 10) -> List[Tuple[TextChunk, float]]:
        if not self.chunks or not query.strip():
            return []

        query_tokens = tokenize(query)
        scores = [0.0] * len(self.chunks)

        for q in query_tokens:
            idf_val = self.idf.get(q, 0.0)
            if idf_val <= 0:
                continue

            for idx, tf_dict in enumerate(self.term_freqs):
                freq = tf_dict.get(q, 0)
                if freq > 0:
                    dl = self.doc_len[idx]
                    numerator = freq * (self.k1 + 1.0)
                    denominator = freq + self.k1 * (1.0 - self.b + self.b * (dl / self.avg_dl))
                    scores[idx] += idf_val * (numerator / denominator)

        # Pair with chunks and sort
        scored_pairs = [(self.chunks[i], scores[i]) for i in range(len(self.chunks)) if scores[i] > 0]
        scored_pairs.sort(key=lambda x: x[1], reverse=True)
        return scored_pairs[:top_k]
