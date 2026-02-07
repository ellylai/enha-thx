import requests
from fastapi import FastAPI
import os
from dotenv import load_dotenv

load_dotenv()

HF_TOKEN = os.environ.get("GEMINI_API_KEY")

HF_API_URL = "https://api-inference.huggingface.co/pipeline/feature-extraction/nlpaueb/legal-bert-base-uncased"

headers = {"Authorization": f"Bearer {HF_TOKEN}"}

app = FastAPI()


@app.post("/embed")
def embed(text: str):
    response = requests.post(HF_API_URL, headers=headers, json={"inputs": text})
    return {"embedding": response.json()}
