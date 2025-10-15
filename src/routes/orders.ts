import { Router, Request, Response } from 'express';
import prisma from '../db/prisma';

const router = Router();

// ============================================================================
// BUG #1: Slow Order Queries
// ============================================================================
// Endpoint: GET /orders/:userId
// Symptom: 5-10 second response times for users with many orders
// Test user: heavy.user@example.com (120 orders)
// ============================================================================

/**
 * GET /orders/:userId
 * Retrieves all orders for a specific user.
 * Returns orders with their items and product details, sorted by creation date (newest first).
 */
router.get('/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;

  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  const ordersWithItems = [];
  for (const order of orders) {
    const items = await prisma.orderItem.findMany({
      where: { orderId: order.id },
      include: {
        product: true,
      },
    });

    ordersWithItems.push({
      ...order,
      items,
    });
  }

  res.json(ordersWithItems);
});

// ============================================================================
// BUG #4: Inventory Overselling Issue
// ============================================================================
// Endpoint: POST /orders/checkout
// Symptom: Users report purchasing items that show as out of stock; 
//          inventory occasionally goes negative
// Test: Run ./tests/test-concurrent-checkouts.sh to simulate busy traffic
// Expected: Inventory never goes negative, orders fail gracefully when 
//           stock is insufficient
// ============================================================================

/**
 * POST /orders/checkout
 * Processes a checkout request and creates a new order.
 * Accepts: userId and an array of items (each with productId and quantity)
 * Validates inventory availability, decrements inventory, and creates the order.
 * Returns the created order with status 201.
 */
router.post('/checkout', async (req: Request, res: Response) => {
  const { userId, items } = req.body;

  let total = 0;
  const orderItems = [];

  for (const item of items) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
    });

    if (!product) {
      return res.status(404).json({ error: `Product ${item.productId} not found` });
    }

    if (product.inventory < item.quantity) {
      return res.status(400).json({ 
        error: `Insufficient inventory for ${product.name}. Available: ${product.inventory}, Requested: ${item.quantity}` 
      });
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        inventory: product.inventory - item.quantity,
      },
    });

    total += Number(product.price) * item.quantity;
    orderItems.push({
      productId: product.id,
      quantity: item.quantity,
      price: product.price,
    });
  }

  const order = await prisma.order.create({
    data: {
      userId,
      status: 'pending',
      total,
      items: {
        create: orderItems,
      },
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  res.status(201).json(order);
});

export default router;

