#!/usr/bin/env python3
"""
Generic feature extractor for CourtListener docket dumps.

Input:  JSON list of dockets, each with a `docket_entries` list.
Output: JSON list of cases in the same "case_metadata" + "entries" schema
        as extracted_features.json (positives).
"""

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Optional


def first_or_none(xs: List[Any]) -> Optional[Any]:
    return xs[0] if xs else None


def safe_int(x) -> Optional[int]:
    try:
        return int(x)
    except Exception:
        return None


def build_case_metadata(docket: Dict[str, Any]) -> Dict[str, Any]:
    date_filed = docket.get("date_filed")
    year = safe_int(date_filed[:4]) if isinstance(date_filed, str) and len(date_filed) >= 4 else None

    return {
        "case_number": docket.get("docket_number"),
        "case_name": docket.get("case_name"),
        "year": year,
        "docket_id": docket.get("id"),
        "nature_of_suit": docket.get("nature_of_suit"),
        "jurisdiction_type": docket.get("jurisdiction_type"),
        "assigned_to": docket.get("assigned_to_str") or docket.get("assigned_to"),
        "referred_to": docket.get("referred_to_str") or docket.get("referred_to"),
        "date_filed": docket.get("date_filed"),
        "date_terminated": docket.get("date_terminated"),
    }


def extract_entry_features(entry: Dict[str, Any]) -> Dict[str, Any]:
    """
    Each docket entry may have 0+ recap_documents.
    We convert it into ONE row, preferring the first available document.
    """
    docs = entry.get("recap_documents") or []
    chosen = None

    # Prefer an available doc if any
    for d in docs:
        if d.get("is_available") is True:
            chosen = d
            break
    if chosen is None:
        chosen = first_or_none(docs)

    return {
        "entry_number": entry.get("entry_number"),
        "date_filed": entry.get("date_filed"),
        "time_filed": entry.get("time_filed"),
        "description": entry.get("description"),

        # Document-ish fields (nullable)
        "document_number": str(chosen.get("document_number")) if chosen else None,
        "document_description": chosen.get("description") if chosen else None,

        # Plain text can live in different places depending on how you fetched.
        # In your positive output, you ultimately had a plain_text string in the extracted rows.  [oai_citation:3‡extracted_features.json](sediment://file_00000000716c722faf82861565a5ccf4)
        # Common patterns: chosen["plain_text"] or chosen["snippet"].
        "plain_text": chosen.get("plain_text") if chosen and isinstance(chosen.get("plain_text"), str) else None,

        "page_count": chosen.get("page_count") if chosen else None,
        "is_available": chosen.get("is_available") if chosen else None,
    }


def extract_cases(dockets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for docket in dockets:
        entries = docket.get("docket_entries") or []
        out.append({
            "case_metadata": build_case_metadata(docket),
            "entries": [extract_entry_features(e) for e in entries],
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_path", required=True, help="Input JSON (dockets with docket_entries)")
    ap.add_argument("--out", dest="out_path", required=True, help="Output JSON (extracted features)")
    args = ap.parse_args()

    in_path = Path(args.in_path)
    out_path = Path(args.out_path)

    with in_path.open("r") as f:
        dockets = json.load(f)

    if not isinstance(dockets, list):
        raise SystemExit("Expected input to be a JSON list of dockets.")

    extracted = extract_cases(dockets)

    with out_path.open("w") as f:
        json.dump(extracted, f, indent=2)

    print(f"✓ Wrote {len(extracted)} cases to {out_path}")


if __name__ == "__main__":
    main()