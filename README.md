# E-commerce Backend API

A TypeScript/Express/Prisma e-commerce API with production performance and reliability issues.

## Quick Start

```bash
npm run setup
npm run dev
```

Server: `http://localhost:3000`

The `setup` command will install dependencies, run migrations, and seed the database.

## Production Issues

This codebase has several performance and reliability issues that need investigation and resolution:

### 1. Slow Order Queries
- **Endpoint**: `GET /orders/:userId`
- **Symptom**: 5-10 second response times for users with many orders
- **Test user**: `heavy.user@example.com` (120 orders)

### 2. Product Creation Error Handling
- **Endpoint**: `POST /products`
- **Symptom**: Error messages inconsistent, sometimes unclear to clients
- **Test**: Send invalid data (missing fields, wrong types, etc.)
- **Task**: Review error handling and suggest improvements for better developer/client experience

### 3. Import Performance  
- **Endpoint**: `POST /admin/products/import`
- **Symptom**: Takes minutes to import 1,000 products
- **Test**: `node tests/generate-bulk-import.js 1000 > test.json && time curl -X POST http://localhost:3000/admin/products/import -H "Content-Type: application/json" -d @test.json`
- **Expected**: < 2 seconds for 1,000 products

### 4. Inventory Overselling Issue
- **Endpoint**: `POST /orders/checkout`  
- **Symptom**: Users report purchasing items that show as out of stock; inventory occasionally goes negative
- **Test**: Run `./tests/test-concurrent-checkouts.sh` to simulate busy traffic
- **Expected**: Inventory never goes negative, orders fail gracefully when stock is insufficient

### 5. API Design Review
- **Endpoints**: `POST /products` 
- **Context**: 20% of products have null descriptions; business wants descriptions required for all new products
- **Task**: Review the current implementation approach and provide feedback on the strategy, including improvements and considerations for long-term maintainability

### 6. Report Generation Review
- **Endpoint**: `GET /reports/orders/:userId`
- **Symptom**: Server becomes unresponsive when generating reports (test with health check endpoint during report generation)
- **Task**: Review the report generation implementation and identify challenges, propose solutions for improving server behavior

### 7. Database Schema Evolution Strategy
- **Location**: `prisma/migrations/BUGGY-split-users-migration.sql`
- **Context**: Business wants to split the `User` table into separate `Customer` and `Merchant` tables because the app now serves both user types with different fields and permissions
- **Current State**: Single `User` table with `userType` field ('customer' or 'merchant'); Orders reference `userId`
- **Desired State**: Separate `Customer` and `Merchant` tables; Orders reference `customerId`
- **Challenge**: A migration file has been drafted but needs review
- **Task**: Review the provided migration approach

### 8. Production Debugging & Observability
- **Context**: The application is experiencing several production issues:
  - Checkout endpoint sporadically takes 15+ seconds (usually 2 seconds)
  - Product search occasionally returns 500 errors
  - Database CPU spikes every morning at 9am
  - Customers report missing order confirmation emails
- **Current State**: Application has only basic console logging
- **Available Tools**: Datadog (APM, metrics, logging, monitoring)
- **Task**: Design a comprehensive observability strategy for this application. Consider:
  - What instrumentation would you add (tracing, metrics, logging)?
  - How would you debug each of the issues above?
  - What alerts would you configure (critical vs warning)?
  - What dashboards would you create?
  - How do you balance observability costs with value?

## API Endpoints

**Products**
- `GET /products` - List products (paginated)
- `GET /products/:id` - Get single product  
- `POST /products` - Create product
- `POST /products/v2` - Create product (requires description)

**Orders**
- `GET /orders/:userId` - Get user orders with items
- `POST /orders/checkout` - Process checkout

**Admin**  
- `POST /admin/products/import` - Bulk import products
- `GET /admin/inventory/low` - Low inventory products

**Reports**
- `GET /reports/orders/:userId` - Generate order report

## Test Data

- 100 products (20% with null descriptions, first 10 with low inventory)
- 30 users including `heavy.user@example.com` with 120 orders
- 200+ orders

## Tech Stack

Node.js 18+, TypeScript, Express, Prisma, SQLite
