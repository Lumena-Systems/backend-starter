#!/bin/bash

# Test script for concurrent checkout handling
# This script sends simultaneous checkout requests to test inventory management

echo "======================================"
echo "Testing Concurrent Checkout Handling"
echo "======================================"
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed."
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

# Base URL
BASE_URL="http://localhost:3000"

# Step 1: Find a product with low inventory
echo "1. Finding product with low inventory..."
LOW_INV_PRODUCT=$(curl -s "$BASE_URL/admin/inventory/low?threshold=5" | jq -r '.[0]')

if [ "$LOW_INV_PRODUCT" == "null" ]; then
    echo "Error: No products with low inventory found."
    echo "Run 'npm run db:seed' to populate database."
    exit 1
fi

PRODUCT_ID=$(echo $LOW_INV_PRODUCT | jq -r '.id')
PRODUCT_NAME=$(echo $LOW_INV_PRODUCT | jq -r '.name')
INITIAL_INVENTORY=$(echo $LOW_INV_PRODUCT | jq -r '.inventory')

echo "   Product: $PRODUCT_NAME"
echo "   ID: $PRODUCT_ID"
echo "   Initial Inventory: $INITIAL_INVENTORY"
echo ""

# Step 2: Get a user ID
echo "2. Getting user ID..."
USER_ID=$(curl -s "$BASE_URL/products" | jq -r '.products[0].id' 2>/dev/null)

if [ "$USER_ID" == "null" ] || [ -z "$USER_ID" ]; then
    echo "Error: Could not get user ID. Is the server running?"
    exit 1
fi

echo "   Using user ID: $USER_ID"
echo ""

# Step 3: Send concurrent requests
QUANTITY=2
NUM_REQUESTS=10
SUCCESS_COUNT=0
FAILURE_COUNT=0

echo "3. Sending $NUM_REQUESTS concurrent checkout requests (buying $QUANTITY each)..."
echo "   If inventory is $INITIAL_INVENTORY, only $(($INITIAL_INVENTORY / $QUANTITY)) should succeed."
echo "   Starting requests..."
echo ""

# Create temporary directory for responses
TEMP_DIR=$(mktemp -d)

# Send concurrent requests
for i in $(seq 1 $NUM_REQUESTS); do
    (
        RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/orders/checkout" \
            -H "Content-Type: application/json" \
            -d "{\"userId\":\"$USER_ID\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":$QUANTITY}]}")
        
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        BODY=$(echo "$RESPONSE" | head -n-1)
        
        echo "$HTTP_CODE|$BODY" > "$TEMP_DIR/response_$i.txt"
    ) &
done

# Wait for all requests to complete
wait

echo "   All requests completed."
echo ""

# Step 4: Analyze results
echo "4. Analyzing results..."
echo ""

for i in $(seq 1 $NUM_REQUESTS); do
    if [ -f "$TEMP_DIR/response_$i.txt" ]; then
        HTTP_CODE=$(cat "$TEMP_DIR/response_$i.txt" | cut -d'|' -f1)
        
        if [ "$HTTP_CODE" == "201" ]; then
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
            echo "   Request $i: ✅ SUCCESS (201)"
        else
            FAILURE_COUNT=$((FAILURE_COUNT + 1))
            ERROR_MSG=$(cat "$TEMP_DIR/response_$i.txt" | cut -d'|' -f2- | jq -r '.error' 2>/dev/null || echo "Unknown error")
            echo "   Request $i: ❌ FAILED ($HTTP_CODE) - $ERROR_MSG"
        fi
    fi
done

echo ""
echo "Results:"
echo "   Successful checkouts: $SUCCESS_COUNT"
echo "   Failed checkouts: $FAILURE_COUNT"
echo ""

# Step 5: Check final inventory
echo "5. Checking final inventory..."
FINAL_PRODUCT=$(curl -s "$BASE_URL/products/$PRODUCT_ID")
FINAL_INVENTORY=$(echo $FINAL_PRODUCT | jq -r '.inventory')

echo "   Initial inventory: $INITIAL_INVENTORY"
echo "   Final inventory: $FINAL_INVENTORY"
echo "   Expected inventory: $(($INITIAL_INVENTORY - ($SUCCESS_COUNT * $QUANTITY)))"
echo ""

# Step 6: Evaluate result
echo "======================================"
echo "Evaluation:"
echo "======================================"

EXPECTED_SUCCESS=$(($INITIAL_INVENTORY / $QUANTITY))

if [ $FINAL_INVENTORY -lt 0 ]; then
    echo "🐛 ISSUE DETECTED: Inventory is NEGATIVE ($FINAL_INVENTORY)!"
    echo "   System allowed overselling - more orders succeeded than inventory available."
    echo ""
    echo "   Expected: Only $EXPECTED_SUCCESS requests should succeed"
    echo "   Actual: $SUCCESS_COUNT requests succeeded"
    echo ""
    echo "   Investigate how inventory is decremented during checkout."
elif [ $SUCCESS_COUNT -gt $EXPECTED_SUCCESS ]; then
    echo "🐛 ISSUE DETECTED: Too many successful checkouts!"
    echo "   Expected: $EXPECTED_SUCCESS should succeed"
    echo "   Actual: $SUCCESS_COUNT succeeded"
    echo ""
    echo "   This indicates overselling - inventory constraints not enforced properly."
elif [ $FINAL_INVENTORY -eq $(($INITIAL_INVENTORY - ($SUCCESS_COUNT * $QUANTITY))) ]; then
    echo "✅ WORKING CORRECTLY: Inventory management is proper!"
    echo "   Only $SUCCESS_COUNT requests succeeded (as expected)."
    echo "   Inventory correctly decreased from $INITIAL_INVENTORY to $FINAL_INVENTORY."
else
    echo "⚠️  UNEXPECTED: Inventory calculation doesn't match."
    echo "   This might indicate a different issue."
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "Test complete!"

