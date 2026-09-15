from __future__ import annotations

import json
from typing import Any

from .errors import LocalAIError

SECTION_LIMITS = {
    "sessions": 24,
    "scores": 16,
    "wrongAnswers": 16,
    "wrongAnswerDrills": 16,
    "weeklyCapabilityGoals": 12,
    "dailyDrills": 16,
    "goals": 12,
    "plaire": 1,
    "trinity": 1,
}
SENSITIVE_KEYS = {"password", "token", "secret", "apikey", "api_key", "authorization"}


def _safe(value: Any, depth: int = 0) -> Any:
    if depth > 3:
        return "[depth-limited]"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:500]
    if isinstance(value, list):
        return [_safe(item, depth + 1) for item in value[:24]]
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for key, item in list(value.items())[:24]:
            key_text = str(key)[:80]
            if key_text.lower() in SENSITIVE_KEYS:
                continue
            result[key_text] = _safe(item, depth + 1)
        return result
    return str(value)[:200]


def format_context(context: dict[str, Any], max_bytes: int) -> str:
    """Select bounded learning sections instead of dumping an arbitrary payload."""
    selected: dict[str, Any] = {}
    for section, limit in SECTION_LIMITS.items():
        if section not in context:
            continue
        value = context[section]
        selected[section] = _safe(value[:limit] if isinstance(value, list) else value)

    encoded = json.dumps(selected, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > max_bytes:
        raise LocalAIError("CONTEXT_TOO_LARGE", "Selected context exceeds the configured size limit.", 413)
    return encoded
