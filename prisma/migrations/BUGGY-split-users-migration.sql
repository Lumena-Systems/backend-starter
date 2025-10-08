-- ⚠️  BUGGY MIGRATION - DO NOT USE IN PRODUCTION ⚠️
- This migration demonstrates a RISKY approach to splitting the User table
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

-- Step 2: Update foreign keys in orders table
ALTER TABLE "orders" ADD COLUMN "customerId" TEXT;
UPDATE "orders" 
SET "customerId" = "userId";

-- Step 3: Copy data from User table
INSERT INTO "customers" (id, email, name, "createdAt")
SELECT id, email, name, "createdAt"
FROM "users"
WHERE "userType" = 'customer';

INSERT INTO "merchants" (id, email, name, "createdAt")
SELECT id, email, name, "createdAt"
FROM "users"
WHERE "userType" = 'merchant';

ALTER TABLE "orders" DROP COLUMN "userId";

-- Add foreign key constraint
ALTER TABLE "orders" 
  ADD CONSTRAINT "orders_customerId_fkey" 
  FOREIGN KEY ("customerId") REFERENCES "customers"(id);

-- Step 4: Drop old table
DROP TABLE "users";

COMMIT;
