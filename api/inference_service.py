import pandas as pd
import numpy as np
import joblib
import os

# 1. Load the "Database" (CSVs)
pos_df = pd.read_csv("backend/pos_refined_weak_labels.csv")
neg_df = pd.read_csv("backend/neg_refined_weak_labels.csv")
db_df = pd.concat([pos_df, neg_df], ignore_index=True)

# 2. Load the "Features" (Embeddings)
pos_embeddings = np.load("backend/pos_refined_weak_labels_embeddings.npy")
neg_embeddings = np.load("backend/neg_refined_weak_labels_embeddings.npy")
all_embeddings = np.vstack([pos_embeddings, neg_embeddings])

# 3. Load the "Classifier"
clf = joblib.load("backend/noncompliance_classifier_v1.pkl")


def search_and_classify(params: dict):
    """
    Searches the CSV database for a match and returns classification results.
    """
    # Filter logic based on any combination of parameters
    mask = pd.Series([True] * len(db_df))

    if params.get("case_number"):
        mask &= db_df["case_number"] == params["case_number"]
    if params.get("case_name"):
        mask &= db_df["case_name"].str.contains(
            params["case_name"], case=False, na=False
        )
    if params.get("judge"):
        mask &= db_df["judge_assigned"].str.contains(
            params["judge"], case=False, na=False
        )

    matches = db_df[mask]

    if matches.empty:
        return {
            "status": "not_found",
            "message": "No matching case in the local world.",
        }

    results = []
    for idx in matches.index:
        # Retrieve the pre-embedded vector for this specific row index
        embedding = all_embeddings[idx].reshape(1, -1)

        # Run classification
        prob = clf.predict_proba(embedding)[0][1]
        label = db_df.iloc[idx][
            "weak_label"
        ]  # Or calculate fresh: clf.predict(embedding)

        results.append(
            {
                "case_number": db_df.iloc[idx]["case_number"],
                "noncomplianceScore": float(prob * 100),
                "weakLabel": label,
                "match_confidence": 1.0,  # Exact DB match
            }
        )

    return {"status": "success", "results": results}


# For a Hackathon: You can wrap this in a simple FastAPI endpoint
