#!/usr/bin/env python3
"""
Fetch STRICT Minnesota (mnd) civil habeas dockets with Nature of Suit = 463.

Quota-safe:
- Uses ONLY the paginated /dockets/ list endpoint with server-side filters.
- Cursor pagination via the "next" URL (no per-docket detail calls).

Filters:
1) court=mnd
2) federal_dn_case_type=cv
3) date_filed__gte=2025-01-01 (default; configurable)
4) nature_of_suit__startswith=463  (strict NOS bucket)

Outputs:
- JSON list of docket objects (as returned by CourtListener v4)

Example:
  python fetch_mnd_463.py --token $CL_TOKEN --target 2000 --shuffle --out mnd_463_cases.json
"""

import argparse
import json
import random
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests


class CourtListenerClient:
    BASE_URL = "https://www.courtlistener.com/api/rest/v4"

    def __init__(self, api_token: str):
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Token {api_token}"})

    def _get_json(self, url: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        r = self.session.get(url, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def fetch_mnd_463_cv_dockets(
        self,
        target: int,
        date_filed_gte: str = "2025-01-01",
        delay_s: float = 0.4,
        verbose: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Fetch up to `target` dockets matching strict 463 constraints using cursor pagination.
        Returns a list of docket dicts.
        """
        base_url = f"{self.BASE_URL}/dockets/"

        # First request uses params; subsequent requests use the "next" URL which already includes cursor+params.
        params = {
            "court": "mnd",
            "federal_dn_case_type": "cv",
            "date_filed__gte": date_filed_gte,
            "nature_of_suit__startswith": "463",
        }

        out: List[Dict[str, Any]] = []
        next_url: Optional[str] = base_url

        page_i = 0
        while next_url and len(out) < target:
            page_i += 1
            data = self._get_json(next_url, params=params)

            results = data.get("results", [])
            if not results:
                if verbose:
                    print(f"page {page_i}: 0 results; stopping")
                break

            # Defensive: ensure strictness even if server filter ever changes.
            added = 0
            for d in results:
                nos = (d.get("nature_of_suit") or "").strip()
                if nos.startswith("463"):
                    out.append(d)
                    added += 1
                    if len(out) >= target:
                        break

            if verbose:
                print(f"page {page_i}: +{added} kept (raw {len(results)}), total {len(out)}/{target}")

            next_url = data.get("next")
            params = None  # after first request, 'next' already contains the filters + cursor

            if next_url and delay_s > 0:
                time.sleep(delay_s)

        return out[:target]


def load_json_list(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    raise ValueError(f"{path} did not contain a JSON list.")


def save_json_list(path: Path, items: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(items, f, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch strict 463 MN (mnd) CV dockets from CourtListener v4.")
    parser.add_argument("--token", required=True, help="CourtListener API token")
    parser.add_argument("--target", type=int, default=2000, help="Number of dockets to collect (may end early).")
    parser.add_argument("--date-gte", default="2025-01-01", help="Only include cases filed on/after this date (YYYY-MM-DD).")
    parser.add_argument("--delay", type=float, default=0.4, help="Seconds to sleep between page requests (rate-limit friendly).")
    parser.add_argument("--out", default="mnd_463_cases.json", help="Output JSON file.")
    parser.add_argument("--append", action="store_true", help="Append to existing output file (dedupe by docket id).")
    parser.add_argument("--shuffle", action="store_true", help="Shuffle the final dataset (reproducible with --seed).")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for shuffling.")
    parser.add_argument("--quiet", action="store_true", help="Reduce logging.")
    args = parser.parse_args()

    out_path = Path(args.out)

    print("=" * 60)
    print("Fetch STRICT 463 MN (mnd) CV Dockets")
    print("=" * 60)
    print(f"Filters: court=mnd, case_type=cv, date_filed__gte={args.date_gte}, nature_of_suit__startswith=463")
    print(f"Target: {args.target}")
    print(f"Output: {out_path}")
    print(f"Append: {args.append} | Shuffle: {args.shuffle} (seed={args.seed})")
    print("=" * 60)

    client = CourtListenerClient(api_token=args.token)
    fetched = client.fetch_mnd_463_cv_dockets(
        target=args.target,
        date_filed_gte=args.date_gte,
        delay_s=args.delay,
        verbose=not args.quiet,
    )

    if args.append:
        existing = load_json_list(out_path)
        existing_ids = {d.get("id") for d in existing if "id" in d}
        new_items = [d for d in fetched if d.get("id") not in existing_ids]
        all_items = existing + new_items
        if not args.quiet:
            print(f"Loaded {len(existing)} existing; adding {len(new_items)} new; total {len(all_items)}")
    else:
        all_items = fetched

    if args.shuffle:
        random.seed(args.seed)
        random.shuffle(all_items)

    save_json_list(out_path, all_items)

    print("=" * 60)
    print(f"✓ Saved {len(all_items)} dockets to {out_path}")
    if len(all_items) < args.target:
        print(f"Note: only {len(all_items)} matched / were available for these strict filters.")
    print("=" * 60)


if __name__ == "__main__":
    main()