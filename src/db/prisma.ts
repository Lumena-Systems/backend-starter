import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.DEBUG === 'prisma:query' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

export default prisma;

