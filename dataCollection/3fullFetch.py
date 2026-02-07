#!/usr/bin/env python3
"""
Step 2B: Fetch only docket entries with available documents.
Skips parties and entries without files.
"""

import json
import time
import argparse
from pathlib import Path
import requests


class CourtListenerClient:
    """Client for CourtListener API v4."""
    
    BASE_URL = "https://www.courtlistener.com/api/rest/v4"
    
    def __init__(self, api_token=None):
        self.session = requests.Session()
        if api_token:
            self.session.headers.update({"Authorization": f"Token {api_token}"})
    
    def get_all_docket_entries(self, docket_id, delay=0.5):
        """
        Fetch ALL docket entries for a docket (handles pagination automatically).
        
        Args:
            docket_id: CourtListener docket ID
            delay: Delay between page requests
        
        Returns:
            List of all docket entry objects
        """
        all_entries = []
        page = 1
        
        while True:
            print(f"    Fetching page {page}...", end=" ", flush=True)
            
            # API call for one page
            url = f"{self.BASE_URL}/docket-entries/"
            params = {
                "docket": docket_id,
                "page": page,
                "order_by": "entry_number",
            }
            response = self.session.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            entries = data.get("results", [])
            all_entries.extend(entries)
            print(f"got {len(entries)} entries")
            
            # Check if there are more pages
            if not data.get("next"):
                break
            
            page += 1
            time.sleep(delay)
        
        return all_entries


def filter_available_documents(docket_entries):
    """
    Keep all entries, but filter documents to only available ones.
    
    Args:
        docket_entries: List of docket entry dicts
    
    Returns:
        All entries with filtered documents
    """
    filtered = []
    
    for entry in docket_entries:
        # Get documents in this entry
        docs = entry.get("recap_documents", [])
        
        # Keep only available documents
        available_docs = [
            doc for doc in docs 
            if doc.get("is_available", False)
        ]
        
        # Include all entries (even without documents)
        filtered_entry = {
            **entry,
            "recap_documents": available_docs
        }
        filtered.append(filtered_entry)
    
    return filtered


def fetch_case_documents(case, client, delay=1.0):
    """
    Fetch only docket entries with available documents.
    
    Args:
        case: Case dict from step 2
        client: CourtListenerClient
        delay: Delay between API calls
    
    Returns:
        Enriched case with filtered entries
    """
    if case.get("courtlistener_status") != "found":
        return case
    
    docket_id = case["courtlistener_data"]["docket_id"]
    case_num = case["case_number"]
    
    print(f"\n[{case_num}] Fetching documents...")
    
    try:
        # Fetch all docket entries
        print(f"  Fetching all docket entries...")
        all_entries = client.get_all_docket_entries(docket_id, delay=0.5)
        time.sleep(delay)
        
        # Filter to keep all entries but only available documents
        print(f"  Filtering to available documents...")
        filtered_entries = filter_available_documents(all_entries)
        
        # Count stats
        entries_with_docs = sum(
            1 for entry in filtered_entries
            if entry.get("recap_documents")
        )
        
        total_docs = sum(
            len(entry.get("recap_documents", [])) 
            for entry in filtered_entries
        )
        
        docs_with_text = sum(
            1 for entry in filtered_entries
            for doc in entry.get("recap_documents", [])
            if doc.get("plain_text")
        )
        
        print(f"  ✓ Found: {len(filtered_entries)} total entries")
        print(f"           {entries_with_docs} entries with documents")
        print(f"           {total_docs} available documents ({docs_with_text} with text)")
        
        return {
            **case,
            "enriched": True,
            "docket_entries": filtered_entries,
            "stats": {
                "total_entries": len(filtered_entries),
                "total_entries_with_docs": entries_with_docs,
                "total_available_documents": total_docs,
                "documents_with_text": docs_with_text,
            }
        }
        
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return {
            **case,
            "enriched": False,
            "error": str(e)
        }


def main():
    parser = argparse.ArgumentParser(
        description="Fetch docket entries with available documents only"
    )
    parser.add_argument("--token", required=True, help="CourtListener API token")
    parser.add_argument("--batch-size", type=int, help="Number of cases to process")
    parser.add_argument("--start", type=int, default=0, help="Starting index")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests")
    
    args = parser.parse_args()
    
    # Paths
    input_path = "courtlistener_data.json"
    output_path = "documents_only.json"
    
    print("=" * 60)
    print("Document Fetcher - Available Documents Only")
    print("=" * 60)
    
    # Load cases
    print(f"\n1. Loading cases from {input_path}")
    with open(input_path) as f:
        cases = json.load(f)
    
    found_cases = [c for c in cases if c.get("courtlistener_status") == "found"]
    print(f"   Found {len(found_cases)} successfully fetched cases")
    
    # Initialize client
    print("\n2. Initializing CourtListener API client")
    client = CourtListenerClient(api_token=args.token)
    
    # Determine range
    end_idx = args.start + args.batch_size if args.batch_size else len(found_cases)
    end_idx = min(end_idx, len(found_cases))
    
    print(f"\n3. Fetching documents for cases {args.start} to {end_idx-1}")
    print("=" * 60)
    
    # Fetch documents
    enriched = []
    for i in range(args.start, end_idx):
        case = found_cases[i]
        enriched_case = fetch_case_documents(case, client, delay=args.delay)
        enriched.append(enriched_case)
    
    # Load existing if any
    existing = []
    if Path(output_path).exists():
        with open(output_path) as f:
            existing = json.load(f)
    
    # Merge
    results_dict = {c["case_number"]: c for c in existing}
    for c in enriched:
        results_dict[c["case_number"]] = c
    
    all_results = list(results_dict.values())
    
    # Save
    print(f"\n4. Saving to {output_path}")
    with open(output_path, 'w') as f:
        json.dump(all_results, f, indent=2)
    
    # Summary
    enriched_count = sum(1 for c in enriched if c.get("enriched"))
    total_entries = sum(c.get("stats", {}).get("total_entries_with_docs", 0) for c in enriched)
    total_docs = sum(c.get("stats", {}).get("total_available_documents", 0) for c in enriched)
    docs_with_text = sum(c.get("stats", {}).get("documents_with_text", 0) for c in enriched)
    
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Processed: {len(enriched)} cases")
    print(f"  Successfully enriched: {enriched_count}")
    print(f"  Entries with available docs: {total_entries}")
    print(f"  Total available documents: {total_docs}")
    print(f"  Documents with text: {docs_with_text}")
    print("=" * 60)
    
    if end_idx < len(found_cases):
        print(f"\nTo continue, run:")
        print(f"  python fetch_documents_only.py --token YOUR_TOKEN --start {end_idx}")


if __name__ == "__main__":
    main()