import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { logger } from './lib/logger.js';
import { requestId } from './middleware/request-id.js';
import { authContext } from './middleware/auth-context.js';
import { errorHandler } from './middleware/error-handler.js';
import { loadEnv } from './lib/env.js';

import { healthRouter } from './modules/health.js';
import { authRouter } from './modules/auth/router.js';
import { orgsRouter } from './modules/orgs/router.js';
import { opportunitiesRouter } from './modules/opportunities/router.js';
import {
  applicationsRouter,
  recommendationsRouter,
} from './modules/applications/router.js';
import { placementsRouter } from './modules/placements/router.js';
import { evaluationsRouter } from './modules/evaluations/router.js';
import { ledgerRouter } from './modules/ledger/router.js';
import { uploadsRouter, filesRouter } from './modules/uploads/router.js';
import {
  notificationsRouter,
  sendgridWebhookRouter,
} from './modules/notifications/router.js';
import {
  certificatesRouter,
  meCertificatesRouter,
} from './modules/certificates/router.js';
import {
  reportsRouter,
  studentTranscriptRouter,
} from './modules/reports/router.js';
import { importsRouter } from './modules/imports/router.js';
import { adminRouter } from './modules/admin/router.js';
import { idempotency } from './middleware/idempotency.js';

export function createApp(): express.Express {
  const env = loadEnv();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // honour X-Forwarded-* from a single upstream proxy
  app.use(helmet());
  app.use(
    cors({
      origin: env.PUBLIC_WEB_ORIGIN,
      credentials: true,
    }),
  );
  app.use(requestId());
  app.use(pinoHttp({ logger, customProps: (req) => ({ request_id: req.id }) }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Probes are unversioned; everything else lives under /api/v1.
  app.use('/', healthRouter);

  const v1 = express.Router();
  v1.use(authContext()); // attaches req.auth when a valid session cookie is present
  v1.use(idempotency); // CTL-09 — applied globally; only fires when Idempotency-Key is present
  v1.use('/auth', authRouter);
  v1.use('/organisations', orgsRouter);
  v1.use('/opportunities', opportunitiesRouter);
  v1.use('/applications', applicationsRouter);
  v1.use('/placements', placementsRouter);
  v1.use('/evaluations', evaluationsRouter);
  v1.use('/', ledgerRouter); // owns /me/ledger, /me/eligibility, /students/:id/...
  v1.use('/me/recommendations', recommendationsRouter);
  v1.use('/uploads', uploadsRouter);
  v1.use('/', filesRouter); // owns /files/:key
  v1.use('/me/notifications', notificationsRouter);
  v1.use('/webhooks', sendgridWebhookRouter); // /webhooks/sendgrid
  v1.use('/me/certificates', meCertificatesRouter);
  v1.use('/certificates', certificatesRouter);
  v1.use('/reports', reportsRouter);
  v1.use('/students', studentTranscriptRouter); // /students/:id/transcript
  v1.use('/imports/isims', importsRouter);
  v1.use('/admin', adminRouter);
  app.use('/api/v1', v1);

  app.use(errorHandler);

  return app;
}
