# not necessary, but for sanity checking
# file with functions to flag for key phrases of noncompliance
# weak labeling

import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from typing import List
import re

problematic_phrases = [
    # --- Severe: Explicit Findings & Contempt ---
    r"held in contempt",
    r"sanctions? (?:are |were )?imposed",
    r"willful(?:ly)? (?:violated?|failed)",
    r"failure to comply",
    r"not in compliance",
    r"contempt of (?:this )?court",
    r"flagrant disregard",
    r"violation of (?:the )?court'?s order",
    # --- Procedural: The "Minnesota Signal" ---
    r"order to show cause",  # Often the first sign of noncompliance
    r"motion for (?:order to )?show cause",
    r"emergency motion",
    r"explain the failure",
    r"failed to (?:timely )?release",
    r"did not (?:timely )?comply",
    r"non-?compliance",
    r"breach of (?:the )?order",
    r"admonished",
    # --- Contextual: Post-Order Friction ---
    r"remains in custody",  # When ordered to be released
    r"not yet released",
    r"failure to transport",
    r"show cause why .* should not be sanctioned",
]


def calculate_noncompliance_score(label: str, phrases: list) -> pd.DataFrame:
    df = pd.read_csv(f"{label}_flattened_training_data.csv")
    df["text_descriptions"] = df["text_descriptions"].fillna("").str.lower()

    def get_score(text):
        score = 0
        # Check for each regex pattern
        for pattern in phrases:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                # Weighted Scoring: Direct findings get more points than procedural motions
                if any(
                    word in pattern
                    for word in ["contempt", "sanction", "willful", "violation"]
                ):
                    score += len(matches) * 25
                else:
                    score += len(matches) * 10
        return score

    df["raw_score"] = df["text_descriptions"].apply(get_score)

    # Normalize 0-100
    max_raw = df["raw_score"].max()
    df["noncompliance_score"] = (df["raw_score"] / max_raw * 100) if max_raw > 0 else 0

    # Since all are true noncompliant, we use the score to show 'Signal Strength'
    # Any case with a score > 0 is flagged; 0s are 'Weak Signal' but still noncompliant
    df["weak_label"] = df["noncompliance_score"].apply(
        lambda s: (
            "STRONG_SIGNAL" if s > 30 else ("MEDIUM_SIGNAL" if s > 0 else "NO_SIGNAL")
        )
    )

    # Reorder columns as requested
    cols = [
        c
        for c in df.columns
        if c
        not in ["noncompliance_score", "weak_label", "text_descriptions", "raw_score"]
    ]
    df = df[cols + ["noncompliance_score", "weak_label", "text_descriptions"]]

    df.sort_values(by="noncompliance_score", ascending=False, inplace=True)
    df.to_csv(f"{label}_refined_weak_labels.csv", index=False)

    # PRINTING RESULTS
    # 1. Calculate counts for each category
    pos_count = len(df[df["weak_label"] == "STRONG_SIGNAL"])
    neg_count = len(df[df["weak_label"] == "NO_SIGNAL"])
    unk_count = len(df[df["weak_label"] == "MEDIUM_SIGNAL"])
    total_count = len(df)

    # 2. Calculate rates
    pos_rate = (pos_count / total_count) * 100 if total_count > 0 else 0
    neg_rate = (neg_count / total_count) * 100 if total_count > 0 else 0
    unk_rate = (unk_count / total_count) * 100 if total_count > 0 else 0

    # 3. Print summary
    print(f"(STRONG_SIGNAL):      {pos_rate:.2f}% ({pos_count}/{total_count})")
    print(f"(NO_SIGNAL):          {neg_rate:.2f}% ({neg_count}/{total_count})")
    print(f"(MEDIUM_SIGNAL):      {unk_rate:.2f}% ({unk_count}/{total_count})")
    return df


# Usage
label = "neg"
print(f"TRUE_LABEL = {label}")
df_final = calculate_noncompliance_score(label, problematic_phrases)
