import { Router, Request, Response } from 'express';
import { Order, OrderItem, User } from '@prisma/client';
import prisma from '../db/prisma';

const router = Router();

// prisma.$queryRaw / prisma.$executeRaw run the SQL as written; ${...} values are sent as bound parameters.

type ReportItem = OrderItem & {
  productName: string;
  productDescription: string | null;
};

// ============================================================================
// BUG #5: Report Generation Review
// ============================================================================
// Endpoint: GET /reports/orders/:userId
// Symptom: Server becomes unresponsive when generating reports, including 
//          the health check endpoint
// Task: Review the report generation implementation and identify challenges, 
//       propose solutions for improving server behavior
// ============================================================================

/**
 * GET /reports/orders/:userId
 * Generates a comprehensive PDF-style report of all orders for a specific user.
 * Includes order details, line items, product information, and summary statistics.
 * Returns a JSON response with report metadata and a preview of the generated report.
 */
router.get('/orders/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;

  const rows = await prisma.$queryRaw<Order[]>`
    SELECT * FROM orders
    WHERE userId = ${userId}
    ORDER BY createdAt DESC
  `;

  const items = await prisma.$queryRaw<ReportItem[]>`
    SELECT
      order_items.*,
      products.name AS productName,
      products.description AS productDescription
    FROM order_items
    JOIN orders ON orders.id = order_items.orderId
    JOIN products ON products.id = order_items.productId
    WHERE orders.userId = ${userId}
  `;

  const orders = rows.map((order) => ({ ...order, items: [] as ReportItem[] }));
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  for (const item of items) {
    ordersById.get(item.orderId)?.items.push(item);
  }

  const [user] = await prisma.$queryRaw<User[]>`
    SELECT * FROM users WHERE id = ${userId}
  `;

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const pdfReport = generatePDFReport(user, orders);

  res.setHeader('Content-Type', 'application/json');
  res.json({
    message: 'PDF report generated',
    user: user.name,
    orderCount: orders.length,
    reportSize: pdfReport.length,
    report: pdfReport.substring(0, 500) + '...',
  });
});

/**
 * Generates a formatted text report for a user's order history.
 * Includes detailed order information, line items, and aggregate statistics.
 */
function generatePDFReport(user: any, orders: any[]): string {
  console.log(`Generating PDF report for ${user.name} with ${orders.length} orders...`);
  
  let report = `ORDER REPORT FOR ${user.name.toUpperCase()}\n`;
  report += `Email: ${user.email}\n`;
  report += `Generated: ${new Date().toISOString()}\n`;
  report += `Total Orders: ${orders.length}\n`;
  report += '='.repeat(80) + '\n\n';

  for (const order of orders) {
    report += `Order ID: ${order.id}\n`;
    report += `Date: ${order.createdAt.toISOString()}\n`;
    report += `Status: ${order.status}\n`;
    report += `Total: $${order.total}\n`;
    report += '-'.repeat(40) + '\n';

    for (const item of order.items) {
      const itemLine = `  ${item.quantity}x ${item.productName} @ $${item.price} = $${Number(item.price) * item.quantity}`;
      report += itemLine + '\n';
      
      if (item.productDescription) {
        const description = item.productDescription.substring(0, 50);
        report += `    ${description}...\n`;
      }
    }

    report += '\n';

    //simulate a slow operation
    for (let i = 0; i < 100000; i++) {
      Math.sqrt(i) * Math.random();
    }
  }

  const totalSpent = orders.reduce((sum, order) => sum + Number(order.total), 0);
  const avgOrderValue = totalSpent / orders.length;
  const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0);

  report += '\n' + '='.repeat(80) + '\n';
  report += 'SUMMARY STATISTICS\n';
  report += '='.repeat(80) + '\n';
  report += `Total Spent: $${totalSpent.toFixed(2)}\n`;
  report += `Average Order Value: $${avgOrderValue.toFixed(2)}\n`;
  report += `Total Items Purchased: ${totalItems}\n`;

  console.log(`PDF report generated: ${report.length} characters`);
  
  return report;
}

export default router;
