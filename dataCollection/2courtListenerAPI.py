#!/usr/bin/env python3
"""
Step 2: Fetch case details from CourtListener API.
Run this script yourself with proper network access.

Usage:
    python step2_fetch_courtlistener.py [--token YOUR_API_TOKEN] [--batch-size 10] [--start 0]
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
    
    def search_by_docket(self, docket_number, court_id="mnd"):
        """
        Search for a case by docket number.
        
        Args:
            docket_number: Case number like "26-CV-107"
            court_id: Court identifier (default: mnd = Minnesota District)
        
        Returns:
            API response dict
        """
        url = f"{self.BASE_URL}/search/"
        
        # Use the search API with docket number and court filters
        params = {
            "type": "r",  # RECAP/PACER type
            "q": f'docketNumber:"{docket_number}" AND court_id:{court_id}',
        }
        
        response = self.session.get(url, params=params)
        response.raise_for_status()
        return response.json()


def load_parsed_cases(input_path):
    """Load the cases from step 1."""
    with open(input_path) as f:
        return json.load(f)


def fetch_case_details(cases, client, start_idx=0, batch_size=None, delay=1.0):
    """
    Fetch details for cases from CourtListener.
    
    Args:
        cases: List of case dicts from step 1
        client: CourtListenerClient instance
        start_idx: Index to start from (for resuming)
        batch_size: Number of cases to process (None = all)
        delay: Seconds to wait between requests
    
    Returns:
        List of enriched cases
    """
    end_idx = start_idx + batch_size if batch_size else len(cases)
    end_idx = min(end_idx, len(cases))
    
    results = []
    
    print(f"\nProcessing cases {start_idx} to {end_idx-1} (of {len(cases)} total)")
    print("=" * 60)
    
    for i in range(start_idx, end_idx):
        case = cases[i]
        case_num = case["case_number"]
        case_name = case["case_name"]
        
        print(f"\n[{i+1}/{len(cases)}] {case_num}: {case_name}")
        
        try:
            search_results = client.search_by_docket(case_num)
            
            if search_results.get("count", 0) == 0:
                print(f"  ⚠ Not found in CourtListener")
                results.append({
                    **case,
                    "courtlistener_status": "not_found",
                    "courtlistener_data": None
                })
            else:
                # Get first result (should be the match)
                docket = search_results["results"][0]
                print(f"  ✓ Found: {docket.get('caseName', 'N/A')}")
                print(f"    Date filed: {docket.get('dateFiled', 'N/A')}")
                print(f"    CourtListener ID: {docket.get('docket_id', 'N/A')}")
                
                results.append({
                    **case,
                    "courtlistener_status": "found",
                    "courtlistener_data": docket
                })
            
            # Rate limiting - be nice to the API
            time.sleep(delay)
            
        except requests.exceptions.HTTPError as e:
            print(f"  ✗ HTTP Error: {e}")
            results.append({
                **case,
                "courtlistener_status": "error",
                "error": str(e)
            })
        except Exception as e:
            print(f"  ✗ Error: {e}")
            results.append({
                **case,
                "courtlistener_status": "error",
                "error": str(e)
            })
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Fetch case details from CourtListener")
    parser.add_argument("--token", help="CourtListener API token (optional)")
    parser.add_argument("--batch-size", type=int, help="Number of cases to process")
    parser.add_argument("--start", type=int, default=0, help="Starting index")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests (seconds)")
    
    args = parser.parse_args()
    
    # Try to get token from: 1) command line, 2) config file
    api_token = args.token
    if not api_token:
        try:
            from config import COURTLISTENER_TOKEN
            api_token = COURTLISTENER_TOKEN
        except ImportError:
            pass
    
    # Paths
    input_path = "caseInfo.json"
    output_path = "courtlistener_data.json"
    
    print("=" * 60)
    print("CourtListener Case Fetcher")
    print("=" * 60)
    
    # Load parsed cases
    print(f"\n1. Loading parsed cases from {input_path}")
    cases = load_parsed_cases(input_path)
    print(f"   Loaded {len(cases)} cases")
    
    # Initialize client
    print("\n2. Initializing CourtListener API client")
    if api_token:
        print("   ✓ Using authenticated access")
    else:
        print("   ⚠ Using unauthenticated access (rate limited)")
        print("   Consider getting a free API token at: https://www.courtlistener.com/sign-in/")
    
    client = CourtListenerClient(api_token=api_token)
    
    # Fetch details
    print("\n3. Fetching case details")
    results = fetch_case_details(
        cases, 
        client, 
        start_idx=args.start,
        batch_size=args.batch_size,
        delay=args.delay
    )
    
    # Save results
    print(f"\n4. Saving results to {output_path}")
    
    # Load existing results if any
    existing_results = []
    if Path(output_path).exists():
        with open(output_path) as f:
            existing_results = json.load(f)
        print(f"   Found {len(existing_results)} existing results")
    
    # Merge results (update existing by case_number)
    results_dict = {r["case_number"]: r for r in existing_results}
    for r in results:
        results_dict[r["case_number"]] = r
    
    all_results = list(results_dict.values())
    
    with open(output_path, 'w') as f:
        json.dump(all_results, f, indent=2)
    
    # Summary
    found = sum(1 for r in all_results if r.get("courtlistener_status") == "found")
    not_found = sum(1 for r in all_results if r.get("courtlistener_status") == "not_found")
    errors = sum(1 for r in all_results if r.get("courtlistener_status") == "error")
    pending = len(cases) - len(all_results)
    
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Total cases: {len(cases)}")
    print(f"  Processed: {len(all_results)}")
    print(f"  Pending: {pending}")
    print(f"  Found: {found}")
    print(f"  Not found: {not_found}")
    print(f"  Errors: {errors}")
    print("=" * 60)
    
    if pending > 0:
        print(f"\nTo continue, run:")
        print(f"  python step2_fetch_courtlistener.py --start {len(all_results)}")


if __name__ == "__main__":
    main()