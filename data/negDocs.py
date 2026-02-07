#!/usr/bin/env python3
"""
Build a negative-candidate dataset from already-filtered MND 463 CV dockets.

Goal:
- Input: a JSON list of dockets (e.g., 813 Minnesota 463 civil habeas cases filed 2025+)
- For each docket:
    - Fetch ALL docket entries via /docket-entries/?docket=<id> (cursor pagination)
    - Detect if >=1 RECAP document is available (or optionally has plain_text)
    - If yes: keep this docket and store ALL its docket entries
- Stop after collecting N cases (default 100)
- Save to negative_documents_only.json

Why pagination?
- The API returns list endpoints in pages. You generally cannot fetch "all entries in one go".
- Cursor pagination gives a "next" URL; you keep requesting next until it is null.
"""

import argparse
import json
import random
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional

import requests

BASE_URL = "https://www.courtlistener.com/api/rest/v4"


def entry_has_doc(entry: Dict[str, Any], require_plain_text: bool) -> bool:
    """
    Return True if this docket entry has >=1 qualifying RECAP document.

    Qualifying rules:
    - If require_plain_text=False:
        any recap doc where is_available == True qualifies
        (and we also accept non-empty plain_text as qualifying)
    - If require_plain_text=True:
        only accepts non-empty plain_text
    """
    docs = entry.get("recap_documents") or []
    for d in docs:
        pt = d.get("plain_text")
        has_text = isinstance(pt, str) and pt.strip()

        if require_plain_text:
            if has_text:
                return True
        else:
            if d.get("is_available") is True:
                return True
            if has_text:
                return True

    return False


class CourtListenerClient:
    def __init__(self, token: str):
        self.sess = requests.Session()
        self.sess.headers.update({"Authorization": f"Token {token}"})

    def fetch_all_docket_entries_and_flag(
        self,
        docket_id: int,
        delay: float,
        order_by: str = "entry_number",
        require_plain_text: bool = False,
    ) -> Tuple[List[Dict[str, Any]], bool]:
        """
        Single-pass pagination:
        - Fetch pages of /docket-entries/
        - Accumulate all entries
        - Track whether we've seen >=1 qualifying doc across all pages
        - Return (all_entries, has_doc)
        """
        all_entries: List[Dict[str, Any]] = []
        has_doc = False

        url: Optional[str] = f"{BASE_URL}/docket-entries/"
        params: Optional[Dict[str, Any]] = {
            "docket": docket_id,
            "order_by": order_by,
        }

        while url:
            r = self.sess.get(url, params=params, timeout=60)
            r.raise_for_status()
            data = r.json()

            batch = data.get("results") or []
            all_entries.extend(batch)

            if not has_doc:
                for e in batch:
                    if entry_has_doc(e, require_plain_text=require_plain_text):
                        has_doc = True
                        break

            url = data.get("next")
            params = None  # next is a full cursor URL; no params needed

            if url and delay > 0:
                time.sleep(delay)

        return all_entries, has_doc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", required=True, help="CourtListener API token")
    ap.add_argument("--infile", default="mndCases.json", help="JSON list of filtered dockets (e.g., your 813)")
    ap.add_argument("--outfile", default="negative_documents_only.json", help="Output JSON file")
    ap.add_argument("--n", type=int, default=100, help="Number of cases to collect")
    ap.add_argument("--seed", type=int, default=42, help="Shuffle seed for reproducibility")
    ap.add_argument("--delay", type=float, default=1.0, help="Delay between API calls (seconds)")
    ap.add_argument(
        "--require-plain-text",
        action="store_true",
        help="Only keep cases where at least one RECAP doc has non-empty plain_text",
    )
    ap.add_argument("--checkpoint", default="neg_checkpoint.json", help="Checkpoint file to resume safely")
    args = ap.parse_args()

    with open(args.infile) as f:
        dockets = json.load(f)

    if not isinstance(dockets, list):
        raise ValueError("Input must be a JSON list of dockets.")

    rng = random.Random(args.seed)
    rng.shuffle(dockets)

    ckpt_path = Path(args.checkpoint)
    collected: List[Dict[str, Any]] = []
    seen_ids = set()

    if ckpt_path.exists():
        ckpt = json.loads(ckpt_path.read_text())
        collected = ckpt.get("collected", [])
        seen_ids = set(ckpt.get("seen_ids", []))
        print(f"Resuming: collected={len(collected)}, seen={len(seen_ids)}")

    client = CourtListenerClient(args.token)

    total = len(dockets)
    for idx, docket in enumerate(dockets, start=1):
        if len(collected) >= args.n:
            break

        docket_id = docket.get("id")
        if docket_id is None:
            continue
        if docket_id in seen_ids:
            continue
        seen_ids.add(docket_id)

        docket_num = docket.get("docket_number", "")
        print(f"[{idx}/{total}] Fetching entries for {docket_num} (id={docket_id})...", end=" ")

        try:
            entries, has_doc = client.fetch_all_docket_entries_and_flag(
                docket_id=docket_id,
                delay=args.delay,
                require_plain_text=args.require_plain_text,
            )

            if not has_doc:
                print("no qualifying docs")
            else:
                record = dict(docket)  # preserve your docket metadata fields
                record["docket_entries"] = entries
                collected.append(record)
                print(f"kept ✅ (cases={len(collected)}, entries={len(entries)})")

                # checkpoint after each keep (best for resumability)
                ckpt_path.write_text(json.dumps({
                    "collected": collected,
                    "seen_ids": list(seen_ids),
                }, indent=2))

        except requests.HTTPError as e:
            print(f"HTTP error: {e}")
        except Exception as e:
            print(f"error: {e}")

    Path(args.outfile).write_text(json.dumps(collected, indent=2))
    print(f"\n✓ Wrote {len(collected)} cases to {args.outfile}")


if __name__ == "__main__":
    main()