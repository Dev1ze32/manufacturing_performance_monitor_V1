from __future__ import annotations

import re
from typing import Optional, Union


def normalize_line_name(value: Optional[str]) -> str:
    cleaned = re.sub(r"\s+", " ", value or "").strip()
    if not cleaned:
        return ""

    compact = re.sub(r"^Q\d+\s+", "", cleaned, flags=re.IGNORECASE)
    compact = re.sub(
        r"\b(APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANUARY|FEBRUARY|MARCH)\b.*$",
        "",
        compact,
        flags=re.IGNORECASE,
    )
    compact = re.sub(r"\bRUNRATE\b.*$", "", compact, flags=re.IGNORECASE)
    compact = re.sub(r"\bMANHOURS\b.*$", "", compact, flags=re.IGNORECASE).strip()

    match = re.search(r"\bL(?:INE)?\s*(\d+)\s+(.+)$", compact, flags=re.IGNORECASE)
    if match:
        line_no, product = match.group(1), match.group(2).strip()
        if re.search(r"ELASTOSEAL|ES\b", product, flags=re.IGNORECASE):
            return f"Line {line_no} ES"
        if re.search(r"EPOXY", product, flags=re.IGNORECASE):
            return f"Line {line_no} Epoxy"
        if re.search(r"\bBB\b", product, flags=re.IGNORECASE):
            return f"Line {line_no} BB"
        return f"Line {line_no} {_title_case(product)}"

    return _title_case(compact).replace(" Es", " ES").replace(" Bb", " BB")


def normalize_percent(value: Optional[Union[float, int]]) -> Optional[float]:
    if value is None:
        return None
    number = float(value)
    return number / 100 if abs(number) > 1 else number


def _title_case(value: str) -> str:
    return " ".join(part[:1].upper() + part[1:].lower() for part in value.split())
