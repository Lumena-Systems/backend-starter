#!/usr/bin/env node

// Script to generate test data for bulk import (Bug 3)
// Usage: node tests/generate-bulk-import.js [count] > import-data.json

const count = parseInt(process.argv[2]) || 1000;

console.error(`Generating ${count} products...`);

const products = [];

for (let i = 0; i < count; i++) {
  products.push({
    name: `Bulk Import Product ${i}`,
    description: `This is a test product generated for bulk import testing. Product number ${i}.`,
    price: Math.floor(Math.random() * 500) + 10,
    inventory: Math.floor(Math.random() * 100) + 10,
  });
}

console.log(JSON.stringify({ products }, null, 2));
console.error(`Generated ${products.length} products.`);
console.error('');
console.error('To import:');
console.error(`node tests/generate-bulk-import.js ${count} > bulk-import.json`);
console.error('curl -X POST http://localhost:3000/admin/products/import \\');
console.error('  -H "Content-Type: application/json" \\');
console.error('  -d @bulk-import.json');

