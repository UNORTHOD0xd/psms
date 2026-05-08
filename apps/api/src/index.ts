import { createApp } from './app.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';
import { loadEnv } from './lib/env.js';
import { logger } from './lib/logger.js';

const env = loadEnv();
const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'PSMS API listening');
  if (env.NODE_ENV !== 'test') startScheduler();
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutting down');
  stopScheduler();
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
