# Schiltz List Dataset Collection Workflow

Complete workflow for collecting positive (non-compliant) and negative (compliant) habeas corpus cases from Minnesota District Court.

## Overview

**Goal:** Create a balanced dataset of habeas corpus cases (nature_of_suit = 463) from Minnesota District Court (2025-2026) for training a non-compliance classifier.

- **Positive Cases (72):** Schiltz List - cases with documented order non-compliance
- **Negative Cases (100):** Minnesota 463 cases NOT on Schiltz List - presumed compliant

## Prerequisites

```bash
pip install requests
```

**Required:**

- CourtListener API Token: get ur own LOL im not putting this here
- Input file: `Schltz_List.pdf`

---

## Part 1: Positive Cases (Schiltz List)

### Step 1: Parse PDF (No API)

Extract case information from Schiltz List PDF.

```bash
python3 1extractCase.py
```

**Output:** `caseInfo.json` (72 cases)

- Case numbers, names, judges, docket numbers

### Step 2: Fetch CourtListener Metadata (Only SEARCH)

Query CourtListener API to find each case and get basic metadata.

```bash
python3 2courtListenerAPI.py --token TOKEN
```

**Output:** `courtlistener_data.json`

- Docket IDs, case metadata, filing dates

**Note:** Uses `/search/` endpoint with exact docket number matching.

### Step 3: Fetch Full Docket Entries (DOCKET-ENTRIES)

Get ALL docket entries with available documents for each case.

```bash
python3 3fullFetch.py --token TOKEN
```

**Output:** `documents_only.json`

- ALL docket entries (even without documents)
- Available documents with `plain_text` OCR

**API Calls:** Multiple per case (paginated docket entries via `/docket-entries/` endpoint)

### Step 4: Extract Features

Extract essential features for ML training.

```bash
python3 4extract_features.py
```

**Input:** `documents_only.json`
**Output:** `extracted_features.json`

**Features extracted:**

- **Case metadata:** case_number, case_name, year, docket_id, nature_of_suit, jurisdiction_type, assigned_to, referred_to, date_filed, date_terminated
- **Per entry:** entry_number, date_filed, time_filed, description, document_number, document_description, plain_text, page_count, is_available

---

## Part 2: Negative Cases (Compliant 463 Cases)

### Step 1: Fetch Minnesota CV Cases (only DOCKETS)

Get a large pool of Minnesota civil cases to check.

```bash
python3 mndFetch.py --token TOKEN --max-cases 500
```

**Output:** `mnd_463_cases.json` (500 CV cases)

**If you need more cases:**

```bash
python3 mndFetch.py --token TOKEN --max-cases 300 --append
```

Why this works

- Uses /api/rest/v4/dockets/ with Django REST filters:
- court=mnd
- federal_dn_case_type=cv
- date_filed\_\_gte=2025-01-01
- nature_of_suit\_\_startswith=463
- Avoids blank nature_of_suit records
- Cursor pagination (quota-safe)
- Output is already shuffled if --shuffle is used

### Step 2: Extract Features for Negative Cases (Single Script)

```bash
python extract_negative_features.py \
  --token TOKEN \
  --infile mnd_463_cases.json \
  --n 100 \
  --outfile neg_extracted_features.json
```

**Output**: `neg_extracted_features.json`

What this script does 1. Loads filtered 463 docket list 2. Samples 100 cases (deterministic seed) 3. Fetches /docket-entries/?docket=<id> (paginated) 4. Extracts:
• case metadata
• docket entry descriptions
• available RECAP document text 5. Writes ML-ready features directly

API usage
• Only /docket-entries/
• No PDF downloads
• No PACER crawling
• Safe for hackathon-scale limits

---

## File Summary

### Positive Cases (Schiltz List)

```
Schltz_List.pdf                    → Original PDF
step1_parsed_cases.json            → Parsed case info (72 cases)
courtlistener_data.json            → CourtListener metadata
documents_only.json                → Full docket entries + documents
extracted_features.json            → Final features for ML
```

### Negative Cases (Compliant)

```
mndCases.json                      → Pool of MN CV habeas cases 
negative_extracted_features.json   → Final features for ML
```

---

## Control Variables

Both positive and negative cases are matched on:

- **Court:** Minnesota District (mnd)
- **Time period:** 2025-2026
- **Case type:** Nature of suit = 463 (Habeas Corpus - Alien Detainee)
- **Civil course case**

This ensures we're comparing **compliant vs non-compliant behavior** in similar legal contexts.

---

## API Rate Limits

- Use `--delay 1.0` to stay within limits
- Batch processing allows resuming if rate limited
- 5000 per day

---

## Next Steps: ML Training

1. Combine `extracted_features.json` (positive) and `negative_extracted_features.json` (negative)
2. Label: Positive = 1 (non-compliant), Negative = 0 (compliant)
3. Embed `plain_text` + `description` with LegalBERT (768-dim vectors)
4. Add temporal/metadata features (judges, dates, case characteristics)
5. Train logistic regression or linear classifier

**Total feature dimensions:** ~775

- 768 from LegalBERT embeddings
- 7 from metadata (judges, year, page_count, etc.)

---

## Troubleshooting

**"nature_of_suit is empty"**

- The `/dockets/` list endpoint doesn't populate this field
- Must use `/dockets/{id}/` for individual cases (Step 2 does this)

**"Found 0 cases"**

- Increase `--max-cases` in Step 1 to get a larger pool
- Minnesota might have fewer 463 cases in this time period

**Rate limited**

- Increase `--delay` to 2.0 or higher
- Use smaller batch sizes
- Wait an hour and resume

---

## Scripts Reference

| Script                         | Purpose              | Input                     | Output                         |
| ------------------------------ | -------------------- | ------------------------- | ------------------------------ |
| `1extractCase.py`              | Parse Schiltz PDF    | `Schltz_List.pdf`         | `caseInfo.json`                |
| `2courtListenerAPI.py`         | Get case metadata    | `caseInfo.json`           | `courtlistener_data.json`      |
| `3fullFetch.py`                | Fetch docket entries | `courtlistener_data.json` | `documents_only.json`          |
| `4extract_features.py`         | Extract ML features  | `documents_only.json`     | `extracted_features.json`      |
| `mndFetch.py`                  | Get MN CV cases      | -                         | `mndCases.json`                |
| `extract_negative_features.py` | Find 463 cases       | `mndCases.json`           | `neg_extracted_features.json` |

