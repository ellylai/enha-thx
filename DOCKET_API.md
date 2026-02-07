# Docket Data Processing API

## Overview

This API fetches full docket entries from CourtListener and saves them to JSON files in the `/data` directory for ML processing and LLM summarization.

## API Endpoint

```
GET /api/docket-details?docketId={DOCKET_ID}
```

## Usage Examples

### Direct API Call

```bash
curl "http://localhost:3000/api/docket-details?docketId=12345"
```

### From Frontend Code

```typescript
import { saveDocketForProcessing } from "@/lib/api-client";

// When user selects a case for detailed analysis
const result = await saveDocketForProcessing(selectedCase.id);
console.log(`Saved ${result.totalEntries} entries to ${result.filename}`);
```

## Output Format

Data is saved in the same format as `extractFeatures.py`:

```json
{
  "case_metadata": {
    "case_number": "1:25-cv-123",
    "case_name": "Smith v. State",
    "year": 2025,
    "docket_id": "12345",
    "nature_of_suit": "463",
    "assigned_to": "Judge Johnson",
    "date_filed": "2025-01-15"
  },
  "entries": [
    {
      "entry_number": 1,
      "date_filed": "2025-01-15",
      "description": "COMPLAINT filed",
      "document_number": "1",
      "document_description": "Complaint",
      "plain_text": "Full text content...",
      "page_count": 10,
      "is_available": true
    }
  ]
}
```

## File Output

- **Location**: `/data/docket_{DOCKET_ID}_{TIMESTAMP}.json`
- **Example**: `docket_12345_2026-02-07T10-30-45-123Z.json`

## Next Steps for ML Processing

1. Use the saved JSON files as input to your ML classifier
2. Process with your LLM summarization pipeline
3. Apply the same feature extraction logic as `extractFeatures.py`

## Features

- ✅ Fetches complete docket entries from CourtListener
- ✅ Extracts plain text from available documents
- ✅ Saves in extractFeatures.py compatible format
- ✅ Handles missing data gracefully
- ✅ TypeScript support for integration
- ✅ Detailed logging for debugging
