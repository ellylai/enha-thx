from http.server import BaseHTTPRequestHandler
import json
import pandas as pd
import numpy as np
import joblib
import os
from urllib.parse import urlparse, parse_qs

# Load the "World" of Data once when the function starts
# Use relative paths from the root of your Vercel project
try:
    pos_df = pd.read_csv("backend/pos_refined_weak_labels.csv")
    neg_df = pd.read_csv("backend/neg_refined_weak_labels.csv")
    db_df = pd.concat([pos_df, neg_df], ignore_index=True)

    pos_emb = np.load("backend/pos_refined_weak_labels_embeddings.npy")
    neg_emb = np.load("backend/neg_refined_weak_labels_embeddings.npy")
    all_embeddings = np.vstack([pos_emb, neg_emb])

    clf = joblib.load("backend/noncompliance_classifier_v1.pkl")
except Exception as e:
    print(f"Loading Error: {e}")


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers["Content-Length"])
        post_data = json.loads(self.rfile.read(content_length))

        # Dynamic search criteria from frontend parameters
        query_no = post_data.get("case_number", "").strip()
        query_name = post_data.get("case_name", "").lower().strip()
        query_judge = post_data.get("judge", "").lower().strip()

        # Build a flexible filter
        mask = pd.Series([False] * len(db_df))

        if query_no:
            mask |= db_df["case_number"] == query_no
        if query_name:
            mask |= db_df["case_name"].str.lower().str.contains(query_name, na=False)
        if query_judge and "judge_assigned" in db_df.columns:
            mask |= (
                db_df["judge_assigned"].str.lower().str.contains(query_judge, na=False)
            )

        matches = db_df[mask]

        if matches.empty:
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"status": "not_found", "results": []}).encode()
            )
            return

        # Map matches to their indices to retrieve the correct pre-computed embeddings
        results = []
        for idx in matches.index:
            embedding = all_embeddings[idx].reshape(1, -1)

            # Run the trained classifier
            prob = clf.predict_proba(embedding)[0][1]

            results.append(
                {
                    "case_number": str(db_df.iloc[idx]["case_number"]),
                    "noncomplianceScore": float(prob * 100),
                    "weakLabel": str(db_df.iloc[idx]["weak_label"]),
                }
            )

        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "success", "results": results}).encode())
