#!/usr/bin/env python3
"""
Extract docket case metadata and entry information.
"""

import json


def extract_features(case_data):
    """
    Extract case metadata and all docket entries.
    
    Args:
        case_data: Case dict from documents_only.json or courtlistener_full_data.json
    
    Returns:
        Dict with case metadata and list of entries
    """
    cl_data = case_data.get("courtlistener_data", {})
    
    # Case overall metadata
    case_metadata = {
        "case_number": case_data.get("case_number"),
        "case_name": case_data.get("case_name"),
        "year": case_data.get("year"),
        "docket_id": cl_data.get("docket_id"),
        "nature_of_suit": cl_data.get("nature_of_suit"),
        "jurisdiction_type": cl_data.get("jurisdictionType"),
        "assigned_to": cl_data.get("assignedTo"),
        "referred_to": cl_data.get("referredTo"),
        "date_filed": cl_data.get("dateFiled"),
        "date_terminated": cl_data.get("dateTerminated"),
    }
    
    # Extract docket entries
    entries = []
    docket_entries = case_data.get("docket_entries", [])
    
    for entry in docket_entries:
        # Entry info
        entry_info = {
            "entry_number": entry.get("entry_number"),
            "date_filed": entry.get("date_filed"),
            "time_filed": entry.get("time_filed"),
            "description": entry.get("description"),
        }
        
        # Check if entry has documents
        recap_docs = entry.get("recap_documents", [])
        
        if recap_docs:
            # Entry has documents
            for doc in recap_docs:
                entry_with_doc = {
                    **entry_info,
                    "document_number": doc.get("document_number"),
                    "document_description": doc.get("description"),
                    "plain_text": doc.get("plain_text"),
                    "page_count": doc.get("page_count"),
                    "is_available": doc.get("is_available"),
                }
                entries.append(entry_with_doc)
        else:
            # Entry without documents
            entry_with_doc = {
                **entry_info,
                "document_number": None,
                "document_description": None,
                "plain_text": None,
                "page_count": None,
                "is_available": None,
            }
            entries.append(entry_with_doc)
    
    return {
        "case_metadata": case_metadata,
        "entries": entries
    }


def main():
    input_path = "documents_only.json"
    output_path = "extracted_features.json"
    
    print(f"Loading cases from {input_path}")
    with open(input_path) as f:
        cases = json.load(f)
    
    enriched_cases = [c for c in cases if c.get("enriched")]
    print(f"Found {len(enriched_cases)} enriched cases")
    
    print("\nExtracting features...")
    all_features = []
    
    for case in enriched_cases:
        features = extract_features(case)
        all_features.append(features)
    
    print(f"\nSaving to {output_path}")
    with open(output_path, 'w') as f:
        json.dump(all_features, f, indent=2)
    
    print(f"✓ Extracted {len(all_features)} cases")
    total_entries = sum(len(c["entries"]) for c in all_features)
    print(f"✓ Total entries: {total_entries}")


if __name__ == "__main__":
    main()