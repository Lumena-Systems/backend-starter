import { Router, Request, Response } from 'express';
import prisma from '../db/prisma';

const router = Router();

// ============================================================================
// BUG #3: Import Performance
// ============================================================================
// Endpoint: POST /admin/products/import
// Symptom: Takes minutes to import 1,000 products
// Test: node tests/generate-bulk-import.js 1000 > test.json && 
//       time curl -X POST http://localhost:3000/admin/products/import 
//       -H "Content-Type: application/json" -d @test.json
// Expected: < 2 seconds for 1,000 products
// ============================================================================

/**
 * POST /admin/products/import
 * Bulk imports multiple products into the catalog.
 * Accepts an array of products, each with: name, description, price, inventory
 * Returns the count of imported products and the duration of the operation.
 */
router.post('/products/import', async (req: Request, res: Response) => {
  const { products } = req.body;

  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'products must be an array' });
  }

  console.log(`Starting import of ${products.length} products...`);
  const startTime = Date.now();

  const createdProducts = [];
  for (let i = 0; i < products.length; i++) {
    const { name, description, price, inventory } = products[i];

    const product = await prisma.product.create({
      data: {
        name,
        description: description || null,
        price,
        inventory,
      },
    });

    createdProducts.push(product);

    if ((i + 1) % 100 === 0) {
      console.log(`Imported ${i + 1}/${products.length} products...`);
    }
  }

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  console.log(`Import completed in ${duration} seconds`);

  res.status(201).json({
    message: `Successfully imported ${createdProducts.length} products`,
    duration: `${duration}s`,
    count: createdProducts.length,
  });
});

/**
 * GET /admin/inventory/low
 * Retrieves products with inventory below a specified threshold.
 * Query parameter: threshold (default: 10)
 * Returns products sorted by inventory level (lowest first).
 */
router.get('/inventory/low', async (req: Request, res: Response) => {
  const threshold = parseInt(req.query.threshold as string) || 10;

  const products = await prisma.product.findMany({
    where: {
      inventory: {
        lte: threshold,
      },
    },
    orderBy: {
      inventory: 'asc',
    },
  });

  res.json(products);
});

export default router;

