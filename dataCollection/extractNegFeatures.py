#!/usr/bin/env python3
"""
Extract features for a random sample of STRICT 463 habeas cases.

Pipeline:
1) Load filtered 463 docket list (already shuffled).
2) Sample N cases.
3) Fetch docket entries for each case (pagination-safe).
4) Extract features into a single JSON file.

Quota-safe:
- Only uses /docket-entries/ list endpoint
- No per-document PDF downloads
"""

import argparse
import json
import random
import time
from typing import Dict, List, Optional

import requests


BASE_URL = "https://www.courtlistener.com/api/rest/v4"


class CourtListenerClient:
    def __init__(self, token: str):
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Token {token}"})

    def get_docket_entries(self, docket_id: int, delay: float = 0.4) -> List[Dict]:
        """Fetch all docket entries for a docket via cursor pagination."""
        url = f"{BASE_URL}/docket-entries/"
        params = {"docket": docket_id}
        entries: List[Dict] = []

        while url:
            r = self.session.get(url, params=params, timeout=30)
            r.raise_for_status()
            data = r.json()

            entries.extend(data.get("results", []))
            url = data.get("next")
            params = None  # cursor URL already contains params

            if url and delay > 0:
                time.sleep(delay)

        return entries


def extract_case_features(
    docket: Dict,
    docket_entries: List[Dict],
) -> Dict:
    """Extract feature schema for one case."""
    extracted_entries = []

    for e in docket_entries:
        entry_text = (e.get("description") or "").strip()

        docs = []
        for d in e.get("recap_documents", []) or []:
            if d.get("is_available"):
                docs.append({
                    "document_number": d.get("document_number"),
                    "description": d.get("description"),
                    "plain_text": d.get("plain_text"),
                })

        extracted_entries.append({
            "entry_number": e.get("entry_number"),
            "date_filed": e.get("date_filed"),
            "description": entry_text,
            "documents": docs,
        })

    return {
        "case_metadata": {
            "docket_id": docket.get("id"),
            "docket_number": docket.get("docket_number"),
            "case_name": docket.get("case_name"),
            "court_id": docket.get("court_id"),
            "date_filed": docket.get("date_filed"),
            "nature_of_suit": docket.get("nature_of_suit"),
            "cause": docket.get("cause"),
            "assigned_to": docket.get("assigned_to_str"),
            "referred_to": docket.get("referred_to_str"),
        },
        "docket_entries": extracted_entries,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", required=True, help="CourtListener API token")
    ap.add_argument("--infile", required=True, help="Filtered 463 docket list JSON")
    ap.add_argument("--outfile", default="neg_extracted_features.json")
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--delay", type=float, default=0.4)
    args = ap.parse_args()

    with open(args.infile) as f:
        dockets = json.load(f)

    if not isinstance(dockets, list):
        raise ValueError("Input file must be a JSON list of dockets")

    random.seed(args.seed)
    random.shuffle(dockets)
    sample = dockets[: min(args.n, len(dockets))]

    print(f"Sampling {len(sample)} cases from {args.infile}")

    client = CourtListenerClient(args.token)
    all_features = []

    for i, docket in enumerate(sample, 1):
        docket_id = docket["id"]
        print(f"[{i}/{len(sample)}] Fetching docket entries for {docket['docket_number']}")

        entries = client.get_docket_entries(docket_id, delay=args.delay)
        features = extract_case_features(docket, entries)
        all_features.append(features)

    with open(args.outfile, "w") as f:
        json.dump(all_features, f, indent=2)

    print(f"\n✓ Wrote {len(all_features)} cases to {args.outfile}")


if __name__ == "__main__":
    main()