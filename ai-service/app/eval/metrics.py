from typing import Any, Dict, List
from app.eval.golden_dataset import GOLDEN_EVALUATION_DATASET
from app.retrieval.hybrid import HybridRetriever


def evaluate_retrieval_recall_at_k(retriever: HybridRetriever, k: int = 3) -> Dict[str, Any]:
    """
    Computes Recall@k on the golden evaluation dataset.
    Compares retrieved document IDs against expected ground-truth document IDs.
    """
    total_policy_cases = 0
    hits = 0

    for item in GOLDEN_EVALUATION_DATASET:
        expected_docs = item.get("expected_doc_ids")
        if not expected_docs:
            continue

        total_policy_cases += 1
        results = retriever.search(item["question"], top_k=k)
        retrieved_doc_ids = {chunk.doc_id for chunk, _ in results}

        # Check if any expected doc ID is among retrieved (supports prefix matching for event_*)
        matched = False
        for exp in expected_docs:
            if exp in retrieved_doc_ids:
                matched = True
                break
            if exp == "event" and any(r.startswith("event_") for r in retrieved_doc_ids):
                matched = True
                break
        if matched:
            hits += 1

    recall = hits / total_policy_cases if total_policy_cases > 0 else 1.0
    return {
        "metric": f"Recall@{k}",
        "total_cases": total_policy_cases,
        "hits": hits,
        "score": round(recall, 4),
        "percentage": f"{recall * 100:.1f}%",
    }
