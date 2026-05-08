import { PrismaClient } from '@prisma/client';

import { logger } from './logger.js';

declare global {
  // eslint-disable-next-line no-var
  var __psmsPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__psmsPrisma ??
  new PrismaClient({
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__psmsPrisma = prisma;
}

prisma.$on('warn' as never, (e: { message: string }) => logger.warn({ prisma: e }, 'prisma warn'));
prisma.$on('error' as never, (e: { message: string }) => logger.error({ prisma: e }, 'prisma error'));
