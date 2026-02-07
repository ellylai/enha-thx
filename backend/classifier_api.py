import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import os
from dotenv import load_dotenv
import numpy as np
import pandas as pd
import re
import joblib
from pathlib import Path


load_dotenv()
HF_MODEL = "nlpaueb/legal-bert-base-uncased"
HF_TOKEN = os.environ.get("HF_TOKEN")
HF_API_URL = "https://api-inference.huggingface.co/pipeline/feature-extraction/nlpaueb/legal-bert-base-uncased"
HEADERS = {"Authorization": f"Bearer {HF_TOKEN}"}

MODEL_PATH = Path(__file__).resolve().parent / "noncompliance_classifier_v1.pkl"

clf = joblib.load(MODEL_PATH)

app = FastAPI()


def embed_samples(samples: pd.DataFrame) -> np.ndarray:
    window_size = 510
    stride = 256
    all_embeddings = []

    for text in samples["text_descriptions"]:
        words = text.split()
        chunk_embeddings = []

        for i in range(0, len(words), stride):
            chunk_words = words[i : i + window_size]
            chunk_text = " ".join(chunk_words)

            response = requests.post(
                HF_API_URL,
                headers=HEADERS,
                json={
                    "inputs": chunk_text,
                    "options": {"wait_for_model": True},
                },
                timeout=30,
            )

            response.raise_for_status()
            embeddings = np.array(response.json())

            # embeddings shape: (tokens, hidden_dim)
            cls_embedding = embeddings[0]  # approximate CLS
            chunk_embeddings.append(cls_embedding)

            if i + window_size >= len(words):
                break

        all_embeddings.append(np.mean(chunk_embeddings, axis=0))

    return np.array(all_embeddings)


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\n", " ").replace("\r", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def flatten_single_case(case: dict) -> pd.DataFrame:
    meta = case.get("case_metadata", {})
    all_text = []

    all_text.append(f"Case Name: {meta.get('case_name', '')}")

    entries = case.get("entries") or case.get("docket_entries") or []

    for entry in entries:
        all_text.append(entry.get("description", ""))

        if entry.get("plain_text"):
            all_text.append(entry.get("plain_text"))

        for doc in entry.get("documents", []):
            if doc.get("plain_text"):
                all_text.append(doc.get("plain_text"))

    row = {
        "case_number": meta.get("case_number") or meta.get("docket_number"),
        "case_name": meta.get("case_name"),
        "judge_assigned": meta.get("assigned_to"),
        "date_filed": meta.get("date_filed"),
        "nature_of_suit": meta.get("nature_of_suit"),
        "text_descriptions": clean_text(" | ".join(all_text)),
    }

    return pd.DataFrame([row])


def run_prediction(embedding: np.ndarray):
    pred = clf.predict(embedding)[0]
    probs = clf.predict_proba(embedding)[0]

    if pred == 1:
        return "NONCOMPLIANT", float(probs[1])
    else:
        return "COMPLIANT", float(probs[0])


@app.post("/api/classify")  # Match the expected path
async def classify(payload: dict):
    # Match the simplified payload from route.ts
    case_name = payload.get("case_name", "")
    case_number = payload.get("case_number", "")
    judge = payload.get("judge", "")

    # Construct the text for embedding
    combined_text = f"Case Name: {case_name} | Number: {case_number} | Judge: {judge}"
    df = pd.DataFrame([{"text_descriptions": combined_text}])

    embedding = embed_samples(df)
    label, confidence = run_prediction(embedding)

    # Match the response format expected by route.ts
    return JSONResponse(
        {
            "status": "success",
            "results": [
                {
                    "noncomplianceScore": confidence,
                    "weakLabel": "HIGH_RISK" if label == "NONCOMPLIANT" else "LOW_RISK",
                }
            ],
        }
    )
