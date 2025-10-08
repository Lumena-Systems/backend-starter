import { Router, Request, Response } from 'express';
import prisma from '../db/prisma';

const router = Router();

// ============================================================================
// BUG #6: Report Generation Review
// ============================================================================
// Endpoint: GET /reports/orders/:userId
// Symptom: Server becomes unresponsive when generating reports (test with 
//          health check endpoint during report generation)
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

  const orders = await prisma.order.findMany({
    where: { userId },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

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
      const itemLine = `  ${item.quantity}x ${item.product.name} @ $${item.price} = $${Number(item.price) * item.quantity}`;
      report += itemLine + '\n';
      
      if (item.product.description) {
        const description = item.product.description.substring(0, 50);
        report += `    ${description}...\n`;
      }
    }

    report += '\n';

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
