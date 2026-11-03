import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { Order, OrderItem, Product } from '@prisma/client';
import prisma from '../db/prisma';

const router = Router();

// prisma.$queryRaw / prisma.$executeRaw run the SQL as written; ${...} values are sent as bound parameters.

// ============================================================================
// BUG #1: Slow Order Queries
// ============================================================================
// Endpoint: GET /orders/:userId
// Symptom: 5-10 second response times for users with many orders (e.g. 120)
//
// Database schema (SQLite):
//
//   users
//     id           TEXT      PRIMARY KEY
//     email        TEXT      NOT NULL, UNIQUE
//     name         TEXT      NOT NULL
//     createdAt    DATETIME  NOT NULL, DEFAULT CURRENT_TIMESTAMP
//
//   products
//     id           TEXT      PRIMARY KEY
//     name         TEXT      NOT NULL, INDEXED
//     description  TEXT      NULLABLE
//     price        DECIMAL   NOT NULL
//     inventory    INTEGER   NOT NULL
//     createdAt    DATETIME  NOT NULL, DEFAULT CURRENT_TIMESTAMP
//
//   orders
//     id           TEXT      PRIMARY KEY
//     userId       TEXT      NOT NULL, INDEXED, REFERENCES users(id)
//     status       TEXT      NOT NULL (pending, completed, cancelled)
//     total        DECIMAL   NOT NULL
//     createdAt    DATETIME  NOT NULL, INDEXED, DEFAULT CURRENT_TIMESTAMP
//
//   order_items
//     id           TEXT      PRIMARY KEY
//     orderId      TEXT      NOT NULL, INDEXED, REFERENCES orders(id)
//     productId    TEXT      NOT NULL, INDEXED, REFERENCES products(id)
//     quantity     INTEGER   NOT NULL
//     price        DECIMAL   NOT NULL (price at time of purchase)
//
// A user has many orders, an order has many order_items, and each order_item 
// references one product.
// ============================================================================

type OrderItemRow = OrderItem & {
  productName: string;
  productDescription: string | null;
  productPrice: Product['price'];
  productInventory: number;
  productCreatedAt: Date;
};

/**
 * Retrieves the items of an order, each with its product details.
 */
async function getOrderItems(orderId: string) {
  const rows = await prisma.$queryRaw<OrderItemRow[]>`
    SELECT
      order_items.*,
      products.name AS productName,
      products.description AS productDescription,
      products.price AS productPrice,
      products.inventory AS productInventory,
      products.createdAt AS productCreatedAt
    FROM order_items
    JOIN products ON products.id = order_items.productId
    WHERE order_items.orderId = ${orderId}
  `;

  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    quantity: row.quantity,
    price: row.price,
    product: {
      id: row.productId,
      name: row.productName,
      description: row.productDescription,
      price: row.productPrice,
      inventory: row.productInventory,
      createdAt: row.productCreatedAt,
    },
  }));
}

/**
 * GET /orders/:userId
 * Retrieves all orders for a specific user.
 * Returns orders with their items and product details, sorted by creation date (newest first).
 */
router.get('/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;

  const orders = await prisma.$queryRaw<Order[]>`
    SELECT * FROM orders
    WHERE userId = ${userId}
    ORDER BY createdAt DESC
  `;

  const ordersWithItems = [];
  for (const order of orders) {
    const items = await getOrderItems(order.id);

    ordersWithItems.push({
      ...order,
      items,
    });
  }

  res.json(ordersWithItems);
});

// ============================================================================
// BUG #3: Inventory Overselling Issue
// ============================================================================
// Endpoint: POST /orders/checkout
// Symptom: Users report purchasing items that show as out of stock; 
//          inventory occasionally goes negative
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
    const [product] = await prisma.$queryRaw<Product[]>`
      SELECT * FROM products WHERE id = ${item.productId}
    `;

    if (!product) {
      return res.status(404).json({ error: `Product ${item.productId} not found` });
    }

    if (product.inventory < item.quantity) {
      return res.status(400).json({ 
        error: `Insufficient inventory for ${product.name}. Available: ${product.inventory}, Requested: ${item.quantity}` 
      });
    }

    await prisma.$executeRaw`
      UPDATE products
      SET inventory = ${product.inventory - item.quantity}
      WHERE id = ${product.id}
    `;

    total += Number(product.price) * item.quantity;
    orderItems.push({
      productId: product.id,
      quantity: item.quantity,
      price: product.price,
    });
  }

  const [order] = await prisma.$queryRaw<Order[]>`
    INSERT INTO orders (id, userId, status, total, createdAt)
    VALUES (${randomUUID()}, ${userId}, 'pending', ${total}, ${Date.now()})
    RETURNING *
  `;

  for (const item of orderItems) {
    await prisma.$executeRaw`
      INSERT INTO order_items (id, orderId, productId, quantity, price)
      VALUES (${randomUUID()}, ${order.id}, ${item.productId}, ${item.quantity}, ${item.price})
    `;
  }

  res.status(201).json({ ...order, items: await getOrderItems(order.id) });
});

export default router;

