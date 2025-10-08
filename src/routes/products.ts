import { Router, Request, Response } from 'express';
import prisma from '../db/prisma';

const router = Router();

/**
 * GET /products
 * Retrieves a paginated list of all products in the catalog.
 * Supports pagination via query parameters: ?page=1&limit=20
 * Returns products sorted by creation date (newest first).
 */
router.get('/', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const products = await prisma.product.findMany({
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  const total = await prisma.product.count();

  res.json({
    products,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * GET /products/:id
 * Retrieves a single product by its ID.
 * Returns 404 if the product is not found.
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const product = await prisma.product.findUnique({
    where: { id },
  });

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json(product);
});

// ============================================================================
// BUG #2: Product Creation Error Handling
// ============================================================================
// Endpoint: POST /products
// Symptom: Error messages inconsistent, sometimes unclear to clients
// Test: Send invalid data (missing fields, wrong types, etc.)
// Task: Review error handling and suggest improvements for better 
//       developer/client experience
// ============================================================================
// BUG #5: API Design Review
// ============================================================================
// Endpoint: POST /products
// Context: 20% of products have null descriptions; business wants 
//          descriptions required for all new products
// Task: Review the current implementation approach and provide feedback on 
//       the strategy, including improvements and considerations for 
//       long-term maintainability
// ============================================================================

/**
 * POST /products
 * Creates a new product in the catalog.
 * Accepts: name, description (optional), price, inventory
 * Returns the created product with status 201.
 */
router.post('/', async (req: Request, res: Response) => {
  const { name, description, price, inventory } = req.body;

  try {
    const product = await prisma.product.create({
      data: {
        name,
        description,
        price,
        inventory,
      },
    });

    res.status(201).json(product);
  } catch (error) {
    // Returning raw Prisma error to client
    res.status(500).json({ error });
  }
});

export default router;

