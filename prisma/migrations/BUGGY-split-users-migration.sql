-- ⚠️  BUGGY MIGRATION - DO NOT USE IN PRODUCTION ⚠️
-- This migration demonstrates a RISKY approach to splitting the User table
-- Issues:
-- 1. Requires application downtime
-- 2. Large transaction locks tables
-- 3. All-or-nothing (any error aborts everything)
-- 4. Hard to rollback
-- 5. No validation before switching
-- 6. Application code breaks immediately when run

BEGIN;

-- Step 1: Create new tables
CREATE TABLE "customers" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE "merchants" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "businessName" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Step 2: Copy data from User table
-- ISSUE: This can take minutes for large tables, holding locks
INSERT INTO "customers" (id, email, name, "createdAt")
SELECT id, email, name, "createdAt"
FROM "users"
WHERE "userType" = 'customer';

INSERT INTO "merchants" (id, email, name, "createdAt")
SELECT id, email, name, "createdAt"
FROM "users"
WHERE "userType" = 'merchant';

-- Step 3: Update foreign keys in orders table
-- ISSUE: This modifies a potentially huge table
ALTER TABLE "orders" ADD COLUMN "customerId" TEXT;

-- ISSUE: This update locks the entire orders table
UPDATE "orders" 
SET "customerId" = "userId";

-- ISSUE: Application code still references userId!
ALTER TABLE "orders" DROP COLUMN "userId";

-- Add foreign key constraint
ALTER TABLE "orders" 
  ADD CONSTRAINT "orders_customerId_fkey" 
  FOREIGN KEY ("customerId") REFERENCES "customers"(id);

-- Step 4: Drop old table
-- ISSUE: No way to rollback after this!
DROP TABLE "users";

COMMIT;

/*
WHY THIS IS PROBLEMATIC:

1. REQUIRES DOWNTIME:
   - Application must be stopped during migration
   - Code expects "users" table, which gets dropped
   - Any requests during migration will fail
   - Downtime: 15-60 minutes depending on data size

2. LARGE TRANSACTION:
   - Entire migration in one transaction
   - Holds locks on multiple tables for entire duration
   - Can cause deadlocks with other operations
   - If anything fails, entire transaction rolls back

3. ALL-OR-NOTHING:
   - No incremental progress
   - Can't validate data before switching
   - Can't test in production gradually
   - One error aborts everything

4. HARD TO ROLLBACK:
   - After DROP TABLE "users", data is gone
   - Would need to restore from backup
   - Backup might be hours old
   - Risk of data loss

5. NO VALIDATION:
   - Can't verify row counts before committing
   - Can't check data integrity before switching
   - Discover issues only after it's live
   - Too late to fix without downtime

6. APPLICATION BREAKS:
   - Code still references "users" table
   - All queries fail immediately
   - Would need coordinated deploy of new code
   - Any mismatch causes outage

7. PERFORMANCE ISSUES:
   - Large data copies in single transaction
   - Can exceed transaction timeout
   - High memory usage
   - Can cause database slowdown affecting other services

8. NO PROGRESS TRACKING:
   - Can't tell how far along migration is
   - If it fails, hard to know what completed
   - Can't resume from checkpoint

REAL-WORLD IMPACT:

For a production system with:
- 1 million users
- 10 million orders

This migration would:
- Take 30-60 minutes to run
- Require 30-60 minutes of downtime
- Lock multiple tables during entire operation
- Have high risk of timeout or deadlock
- Be very difficult to rollback
- Potentially cause data loss if interrupted

INSTEAD: Use the expand/contract pattern (see solutions/bug7-zero-downtime-migration-SOLUTION.md)

The correct approach:
1. Add new tables (no downtime)
2. Dual write (no downtime)
3. Backfill data in batches (no downtime)
4. Validate (no downtime)
5. Switch reads (no downtime)
6. Remove old schema (no downtime)

Timeline: 12 weeks vs 1 hour
Risk: Low vs High
Rollback: Easy vs Very difficult
Downtime: 0 minutes vs 60 minutes
*/

