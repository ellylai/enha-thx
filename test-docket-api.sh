#!/bin/bash

# Test script for docket details API
# Usage: ./test-docket-api.sh

echo "=== Testing Docket Details API ==="

# Step 1: Get a sample docket ID from cases
echo "1. Getting sample cases..."
CASE_RESPONSE=$(curl -s "http://localhost:3000/api/cases?court=mnd&natureOfSuit=463")
DOCKET_ID=$(echo "$CASE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$DOCKET_ID" ]; then
    echo "❌ No docket ID found. Make sure your cases API is working."
    echo "Response: $CASE_RESPONSE"
    exit 1
fi

echo "✅ Found docket ID: $DOCKET_ID"

# Step 2: Test docket details API
echo ""
echo "2. Fetching docket details..."
curl -s "http://localhost:3000/api/docket-details?docketId=$DOCKET_ID" | jq '.' || \
curl -s "http://localhost:3000/api/docket-details?docketId=$DOCKET_ID"

echo ""
echo "3. Check the /data directory for saved files:"
ls -la data/docket_* 2>/dev/null || echo "No docket files found in /data directory"

echo ""
echo "=== Test Complete ==="