import request from 'supertest';
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../src/db/prisma';
import productsRouter from '../src/routes/products';
import ordersRouter from '../src/routes/orders';
import adminRouter from '../src/routes/admin';
import reportsRouter from '../src/routes/reports';

// Create Express app for testing
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/products', productsRouter);
app.use('/orders', ordersRouter);
app.use('/admin', adminRouter);
app.use('/reports', reportsRouter);

// Colors
const c = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

let stats = { passed: 0, failed: 0 };

function log(msg: string, color = c.reset) { console.log(`${color}${msg}${c.reset}`); }
function logTest(name: string) { console.log(`\n${c.cyan}■${c.reset} ${name}`); }
function pass(msg: string) { stats.passed++; console.log(`  ${c.green}✓${c.reset} ${msg}`); }
function fail(msg: string, hint?: string) { 
  stats.failed++; 
  console.log(`  ${c.red}✗${c.reset} ${msg}`); 
  if (hint) console.log(`    ${c.gray}${hint}${c.reset}`);
}
function info(msg: string) { console.log(`  ${c.gray}${msg}${c.reset}`); }

let testUserId: string, testProductId: string, heavyUserId: string;

async function setup() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.blue);
  log('  E-COMMERCE API TEST SUITE', c.blue);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', c.blue);
  
  info('Setting up test data...');

  let heavyUser = await prisma.user.findUnique({ where: { email: 'heavy.user@example.com' } });
  if (!heavyUser) {
    heavyUser = await prisma.user.create({ data: { email: 'heavy.user@example.com', name: 'Heavy User' } });
    let product = await prisma.product.findFirst();
    if (!product) product = await prisma.product.create({ data: { name: 'Default', description: 'Desc', price: 10, inventory: 10000 } });
    
    for (let i = 0; i < 120; i++) {
      await prisma.order.create({
        data: {
          userId: heavyUser.id, status: 'completed', total: 100,
          items: { create: [{ productId: product.id, quantity: 1, price: 10 }] }
        }
      });
    }
  }
  heavyUserId = heavyUser.id;

  const existing = await prisma.user.findUnique({ where: { email: 'test-api@example.com' } });
  if (existing) {
    await prisma.orderItem.deleteMany({ where: { order: { userId: existing.id } } });
    await prisma.order.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const user = await prisma.user.create({ data: { email: 'test-api@example.com', name: 'Test User' } });
  testUserId = user.id;

  const product = await prisma.product.create({ data: { name: 'Test Product', description: 'Desc', price: 99.99, inventory: 5 } });
  testProductId = product.id;

  info('Ready\n');
}

async function cleanup() {
  info('\nCleaning up...');
  await prisma.orderItem.deleteMany({ where: { OR: [{ order: { userId: testUserId } }, { productId: testProductId }] } });
  await prisma.order.deleteMany({ where: { userId: testUserId } });
  await prisma.product.deleteMany({ where: { OR: [{ id: testProductId }, { name: { startsWith: 'Import Test' } }, { name: { startsWith: 'Limited Stock' } }] } });
  await prisma.user.deleteMany({ where: { email: 'test-api@example.com' } });
}

// === BUG #1: N+1 Queries ===
async function testBug1() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);
  log('  BUG #1: N+1 Query Problem', c.yellow);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);

  const res = await request(app).get(`/orders/${heavyUserId}`);
  info(`Retrieved ${res.body?.length || 0} orders with ${res.body?.[0]?.items?.length || 0} items`);
  
  logTest('Code must use Prisma include (not loops)');
  const code = await fs.readFile(path.resolve(__dirname, '../src/routes/orders.ts'), 'utf-8');
  code.includes('for (const order of orders)') ? fail('Uses loop - N+1 bug!', 'Use include: { items: { include: { product: true } } }') : pass('Uses include');
}

// === BUG #2: Error Handling ===
async function testBug2() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);
  log('  BUG #2: Error Handling', c.yellow);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);

  const res1 = await request(app).post('/products').send({ name: 'Test', inventory: 10 });
  
  logTest('Missing price should return 400');
  res1.status === 400 ? pass('Returns 400') : fail(`Returns ${res1.status} instead of 400`);

  logTest('Error must NOT expose Prisma details');
  const err = JSON.stringify(res1.body);
  const hasPrismaDetails = err.toLowerCase().includes('prisma') || err.includes('Invalid `') || err.includes('invocation') || err.includes('clientVersion');
  hasPrismaDetails ? 
    fail('Exposes Prisma internals!', 'Sanitize errors before sending to clients') : pass('Error sanitized');

  const res2 = await request(app).post('/products').send({ name: 'Test', price: 'bad', inventory: 10 });
  logTest('Invalid type should return 400');
  res2.status === 400 ? pass('Returns 400') : fail(`Returns ${res2.status}`);

  logTest('Error should be user-friendly');
  res2.body?.error && typeof res2.body.error === 'string' ? pass('Has error message') : fail('No clear error');
}

// === BUG #3: Import Performance ===
async function testBug3() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);
  log('  BUG #3: Import Performance', c.yellow);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);

  const ts = Date.now();
  const products = Array.from({ length: 100 }, (_, i) => ({
    name: `Import Test ${i} ${ts}`, description: `Desc ${i}`, price: 10, inventory: 100
  }));

  const res = await request(app).post('/admin/products/import').send({ products });
  info(`Import status: ${res.status}, count: ${res.body?.count}`);

  logTest('Code must use createMany (not loop)');
  const code = await fs.readFile(path.resolve(__dirname, '../src/routes/admin.ts'), 'utf-8');
  code.includes('for (let i = 0') ? fail('Uses loop!', 'Use prisma.product.createMany') : pass('Uses createMany');
}

// === BUG #4: Race Condition ===
async function testBug4() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);
  log('  BUG #4: Race Condition', c.yellow);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);

  const product = await prisma.product.create({
    data: { name: `Limited ${Date.now()}`, description: 'Desc', price: 50, inventory: 5 }
  });

  logTest('10 concurrent checkouts, 5 in stock');
  const promises = Array.from({ length: 10 }, () => 
    request(app).post('/orders/checkout').send({ userId: testUserId, items: [{ productId: product.id, quantity: 1 }] })
  );
  const results = await Promise.all(promises);
  const successCount = results.filter(r => r.status === 201).length;
  const final = await prisma.product.findUnique({ where: { id: product.id } });

  info(`Checkouts: ${successCount}/10, Final inventory: ${final?.inventory}`);

  logTest('Must sell exactly 5 items');
  successCount === 5 ? pass('Correct: 5 sold') : fail(`Wrong: ${successCount} sold (expected 5)`, 'Use transactions');

  logTest('Inventory must be 0');
  final?.inventory === 0 ? pass('Inventory at 0') : fail(`Inventory at ${final?.inventory}`, 'Incorrect tracking');

  logTest('Code must use transactions');
  const code = await fs.readFile(path.resolve(__dirname, '../src/routes/orders.ts'), 'utf-8');
  code.includes('$transaction') ? pass('Uses transactions') : fail('No transactions!', 'Wrap in prisma.$transaction');

  await prisma.orderItem.deleteMany({ where: { productId: product.id } });
  await prisma.order.deleteMany({ where: { userId: testUserId } });
  await prisma.product.delete({ where: { id: product.id } });
}

// === BUG #5: API Versioning ===
async function testBug5() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);
  log('  BUG #5: API Versioning', c.yellow);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);

  const res1 = await request(app).post('/products').send({ name: `Prod ${Date.now()}`, price: 10, inventory: 100 });
  info(`V1 response: ${res1.status}`);

  logTest('V1 must have X-API-Deprecation header');
  res1.headers['x-api-deprecation'] ? pass('Deprecation header found') : fail('Missing deprecation header');

  logTest('V1 must have X-API-Version: v1 header');
  res1.headers['x-api-version'] === 'v1' ? pass('Version header correct') : fail('Missing/wrong version header');

  const res2 = await request(app).post('/products/v2').send({ name: `Prod ${Date.now()}`, price: 20, inventory: 50 });
  logTest('V2 endpoint must exist');
  res2.status !== 404 ? pass('V2 exists') : fail('V2 endpoint not found', 'Create POST /products/v2');

  logTest('V2 must reject products without descriptions');
  res2.status === 400 ? pass('V2 rejects no description') : fail(`V2 returns ${res2.status}`, 'Should validate description');

  const res3 = await request(app).post('/products/v2').send({ name: `Prod ${Date.now()}`, description: 'Desc', price: 20, inventory: 50 });
  logTest('V2 must accept products with descriptions');
  res3.status === 201 ? pass('V2 accepts with description') : fail(`V2 failed: ${res3.status}`);

  logTest('V2 must have X-API-Version: v2 header');
  res3.headers['x-api-version'] === 'v2' ? pass('V2 header correct') : fail('Missing V2 header');
}

// === BUG #6: Blocking Reports ===
async function testBug6() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);
  log('  BUG #6: Blocking Reports', c.yellow);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.yellow);

  const res = await request(app).get(`/reports/orders/${heavyUserId}`);
  info(`Report status: ${res.status}`);

  logTest('Code must be async with setImmediate');
  const code = await fs.readFile(path.resolve(__dirname, '../src/routes/reports.ts'), 'utf-8');
  code.includes('for (let i = 0; i < 100000') ? 
    fail('Has blocking CPU loop!', 'Make async and use setImmediate') : 
    pass('Code is async');
}

// Main
async function runTests() {
  try {
    await setup();
    await testBug1();
    await testBug2();
    await testBug3();
    await testBug4();
    await testBug5();
    await testBug6();

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.blue);
    log('  TEST SUMMARY', c.blue);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.blue);
    
    const total = stats.passed + stats.failed;
    const rate = Math.round((stats.passed / total) * 100);
    
    log(`\n  Total: ${total}`, c.cyan);
    log(`  Passed: ${stats.passed}`, c.green);
    log(`  Failed: ${stats.failed}`, c.red);
    log(`  Rate: ${rate}%\n`, rate === 100 ? c.green : c.yellow);

    if (stats.failed === 0) {
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.green);
      log('  ✓ ALL TESTS PASSED!', c.green);
      log('  All bugs fixed correctly.', c.green);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', c.green);
    } else {
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.red);
      log(`  ✗ ${stats.failed} tests failed`, c.red);
      log('  Fix the issues above', c.red);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', c.red);
      process.exit(1);
    }
  } catch (error) {
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.red);
    log('  ERROR', c.red);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', c.red);
    console.error(error);
    process.exit(1);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

runTests();

