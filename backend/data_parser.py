# flattens CourtListener data from a json file into csv for downstream tasks

import json
import pandas as pd
import re


def clean_text(text):
    if not text:
        return ""
    # Remove newlines and carriage returns
    text = text.replace("\n", " ").replace("\r", " ")
    # Strip redundant multiple spaces
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def flatten_dockets_to_cases(file_path):
    with open(file_path, "r") as f:
        data = json.load(f)

    case_entries = []

    for case in data:
        meta = case.get("case_metadata", {})
        all_text = []

        # Handle different Case Number keys
        case_no = meta.get("case_number") or meta.get("docket_number") or "unknown"
        all_text.append(f"Case Name: {meta.get('case_name', '')}")

        # Handle 'entries' vs 'docket_entries'
        entries = case.get("entries") or case.get("docket_entries") or []

        for entry in entries:
            # 1. Get description
            all_text.append(entry.get("description", ""))

            # 2. Get Positive-style plain_text (direct child)
            if entry.get("plain_text"):
                all_text.append(entry.get("plain_text"))

            # 3. Get Negative-style plain_text (nested in 'documents' list)
            docs = entry.get("documents", [])
            for doc in docs:
                if doc.get("plain_text"):
                    all_text.append(doc.get("plain_text"))

        case_entries.append(
            {
                "case_number": case_no,
                "docket_id": meta.get("docket_id"),
                "case_name": meta.get("case_name"),
                "judge_assigned": meta.get("assigned_to"),
                "date_filed": meta.get("date_filed"),
                "date_terminated": meta.get("date_terminated", "N/A"),
                "nature_of_suit": meta.get("nature_of_suit"),
                "jurisdiction_type": meta.get("jurisdiction_type", "N/A"),
                "text_descriptions": clean_text(" | ".join(all_text)),
            }
        )

    return pd.DataFrame(case_entries)


if __name__ == "__main__":
    # Execute flattening
    # label = "pos"
    label = "neg"
    df = flatten_dockets_to_cases(f"{label}_extracted_features.json")

    # Save to CSV
    df.to_csv(f"{label}_flattened_training_data.csv", index=False)

    print(f"Flattened {len(df)} cases into '{label}_flattened_training_data.csv'")
