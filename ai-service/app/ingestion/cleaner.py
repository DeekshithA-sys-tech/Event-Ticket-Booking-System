import re


def clean_text(text: str) -> str:
    """Removes HTML tags, normalizes whitespace, and strips control characters."""
    if not text:
        return ""
    # Strip HTML tags
    cleaned = re.sub(r"<[^>]+>", " ", text)
    # Strip multiple consecutive spaces and tabs
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    # Normalize multiple newlines to max 2
    cleaned = re.sub(r"\n\s*\n\s*\n+", "\n\n", cleaned)
    return cleaned.strip()


def redact_pii(text: str) -> str:
    """Redacts emails, phone numbers, and potential credit card numbers."""
    if not text:
        return ""
    # Email pattern
    text = re.sub(
        r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+",
        "[REDACTED_EMAIL]",
        text,
    )
    # Indian and international phone pattern
    text = re.sub(
        r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}",
        "[REDACTED_PHONE]",
        text,
    )
    # Credit card-like 16 digit numbers
    text = re.sub(r"\b(?:\d[ -]*?){13,16}\b", "[REDACTED_CARD]", text)
    return text
