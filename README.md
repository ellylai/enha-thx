# enha-thx

This repository currently contains two parts:

1. A Next.js 16 frontend scaffold in `/app`.
2. A Python-based ML workflow in `/backend` for classifying potential court-order noncompliance from docket text.

## Repository Layout

- `app/`: Next.js App Router frontend (currently default starter UI).
- `backend/`: Data prep, weak labeling, embedding, and model training scripts.
- `public/`: Static frontend assets.
- `package.json`: Node scripts and frontend dependencies.

## Frontend (Next.js)

### Requirements

- Node.js 20+ recommended
- npm (lockfile is `package-lock.json`)

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Then open `http://localhost:3000`.

### Other frontend commands

```bash
npm run lint
npm run build
npm run start
```

## Backend ML Pipeline

The backend workflow is script-driven and file-based (no API server yet).

### Python requirements

Create and activate a virtual environment, then install:

```bash
pip install pandas numpy scikit-learn joblib torch transformers
```

Notes:
- `torch` can run on CPU, but embeddings are much faster with CUDA.
- `transformers` downloads `nlpaueb/legal-bert-base-uncased` on first run.

### Input/Output data files

Current training assets in `backend/` include:

- Input JSON:
  - `pos_extracted_features.json`
  - `neg_extracted_features.json`
- Intermediate CSV:
  - `pos_flattened_training_data.csv`
  - `neg_flattened_training_data.csv`
  - `pos_refined_weak_labels.csv`
  - `neg_refined_weak_labels.csv`
- Embeddings:
  - `pos_refined_weak_labels_embeddings.npy`
  - `neg_refined_weak_labels_embeddings.npy`
- Trained model:
  - `noncompliance_classifier_v1.pkl`

## Script-by-Script Workflow

Run from the `backend/` directory unless noted.

### 1) Flatten extracted docket JSON into training CSV

Script: `backend/data_parser.py`

What it does:
- Reads a JSON file (`{label}_extracted_features.json`).
- Normalizes docket entry text into one `text_descriptions` field.
- Writes `{label}_flattened_training_data.csv`.

Important:
- The label is hardcoded in the script (`label = "pos"` by default).
- Change `label` to `"neg"` and rerun to generate negative dataset CSV.

Run:

```bash
cd backend
python data_parser.py
```

### 2) Apply weak labeling heuristics

Script: `backend/annotation.py`

What it does:
- Loads `{label}_flattened_training_data.csv`.
- Scores regex phrase matches related to noncompliance.
- Produces:
  - `noncompliance_score` (normalized 0-100)
  - `weak_label` (`STRONG_SIGNAL`, `MEDIUM_SIGNAL`, `NO_SIGNAL`)
- Writes `{label}_refined_weak_labels.csv`.

Important:
- Label is hardcoded at bottom (`label = "neg"` by default).
- Run separately for both classes by editing label and rerunning.

Run:

```bash
cd backend
python annotation.py
```

### 3) Generate embeddings

Script: `backend/embed_samples.py`

What it does:
- Defines `embed_samples(samples: pd.DataFrame) -> np.ndarray`.
- Uses Legal-BERT with sliding windows (510 token chunks, stride 256).
- Returns mean pooled CLS embeddings per sample.

Important:
- This file defines embedding logic but does not currently save output in a runnable `__main__` block.
- You need a driver script/notebook to:
  - Load `*_refined_weak_labels.csv`
  - Call `embed_samples(...)`
  - Save to `*_refined_weak_labels_embeddings.npy`

### 4) Train classifier

Script: `backend/classifier.py`

What it does:
- Loads:
  - `pos_refined_weak_labels_embeddings.npy`
  - `neg_refined_weak_labels_embeddings.npy`
- Builds binary labels (`1` = positive/noncompliant, `0` = negative/compliant).
- Splits data (80/20 stratified).
- Trains logistic regression (`class_weight="balanced"`).
- Reports:
  - 5-fold CV accuracy
  - test accuracy
  - top permutation-important embedding dimensions
- Saves trained model to `noncompliance_classifier_v1.pkl`.

Run:

```bash
cd backend
python classifier.py
```

## Current State / Caveats

- Frontend is still the default Next.js starter page (`app/page.tsx`).
- Backend scripts use hardcoded labels in places; full automation is not yet parameterized.
- No `requirements.txt` or `pyproject.toml` is currently included for backend dependency locking.
- `embed_samples.py` needs a small executable wrapper to persist `.npy` files end-to-end.

## Suggested Next Improvements

1. Add `backend/requirements.txt` or `pyproject.toml`.
2. Parameterize scripts with CLI args (`--label`, `--input`, `--output`).
3. Add an executable embedding pipeline script.
4. Add a minimal backend inference API and connect the frontend.
