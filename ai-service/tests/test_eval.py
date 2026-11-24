import pytest
from app.eval.metrics import evaluate_retrieval_recall_at_k
from app.main import retriever


def test_golden_dataset_recall_at_k():
    """Verify Recall@3 on the golden evaluation dataset meets the target (>= 85%)."""
    metrics = evaluate_retrieval_recall_at_k(retriever, k=3)
    assert metrics["hits"] > 0
    # The report targets Recall@k above 85%
    assert metrics["score"] >= 0.85
