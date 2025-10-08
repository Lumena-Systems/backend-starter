#!/bin/bash

# Test script for Bug 1: N+1 Query Problem
# This script demonstrates the N+1 query issue by enabling query logging

echo "======================================"
echo "Testing N+1 Query Problem"
echo "======================================"
echo ""

# Check if server is running
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "Error: Server is not running on http://localhost:3000"
    echo "Start the server with: DEBUG=prisma:query npm run dev"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Warning: jq is not installed. Install with: brew install jq"
fi

echo "Looking for the heavy test user (with 120 orders)..."
echo ""

# Try to find heavy.user@example.com
# Note: This is a simple test, in reality you'd query the database
echo "To test N+1 queries:"
echo ""
echo "1. Restart the server with query logging enabled:"
echo "   DEBUG=prisma:query npm run dev"
echo ""
echo "2. In Prisma Studio, find the user 'heavy.user@example.com'"
echo "   npm run db:studio"
echo ""
echo "3. Get their user ID and run:"
echo "   curl http://localhost:3000/orders/{userId}"
echo ""
echo "4. Watch the query logs in your terminal"
echo ""
echo "WITHOUT FIX:"
echo "  - You'll see 1 query for orders"
echo "  - Then 120+ queries for order items (one per order)"
echo "  - Total: 121+ queries"
echo ""
echo "WITH FIX:"
echo "  - You'll see 1-2 queries total"
echo "  - All data fetched with JOINs"
echo ""
echo "The difference in query count is the N+1 problem!"
echo ""
echo "Alternative test using logs:"
echo ""
echo "# Count queries"
echo "curl -s http://localhost:3000/orders/{userId} 2>&1 | grep -c 'prisma:query'"

