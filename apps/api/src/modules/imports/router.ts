// Imports admin endpoints (PRC-01).

import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { PaginationQuery, buildPage, parseSort, toSkipTake } from '../../lib/pagination.js';
import { writeAudit } from '../../middleware/audit.js';
import { idempotency } from '../../middleware/idempotency.js';
import { requireRole } from '../../middleware/require-role.js';
import { loadEnv } from '../../lib/env.js';
import { runIsimsImport } from '../../jobs/isims-import.js';

export const importsRouter = Router();

importsRouter.get('/runs', requireRole('ADMINISTRATOR'), async (req, res, next) => {
  try {
    const params = PaginationQuery.parse(req.query);
    const sort = parseSort(params.sort, ['started_at'], { field: 'started_at', dir: 'desc' });
    const [rows, total] = await Promise.all([
      prisma.importRun.findMany({
        ...toSkipTake(params),
        orderBy: { [sort.field]: sort.dir },
      }),
      prisma.importRun.count(),
    ]);
    res.json(buildPage(params, rows, total));
  } catch (err) {
    next(err);
  }
});

importsRouter.get('/runs/:run_id', requireRole('ADMINISTRATOR'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.run_id);
    const row = await prisma.importRun.findUnique({
      where: { run_id: id },
      include: {
        quarantine_rows: {
          take: 100,
          orderBy: { row_number: 'asc' },
        },
      },
    });
    if (!row) return sendProblem(res, Problems.notFound());
    res.json(row);
  } catch (err) {
    next(err);
  }
});

importsRouter.post(
  '/trigger',
  requireRole('ADMINISTRATOR'),
  idempotency,
  async (req, res, next) => {
    try {
      const env = loadEnv();
      const idem = req.header('idempotency-key') ?? undefined;
      // Run synchronously — caller already gets idempotency replay if
      // they retry. The pilot's expected file is small enough to fit
      // inside the request lifetime; large files belong in a worker
      // pool, future work.
      const summary = await runIsimsImport({
        csv_path: env.ISIMS_CSV_PATH,
        source_filename: env.ISIMS_CSV_PATH,
        triggered_by_user_id: req.auth!.user_id,
        idempotency_key: idem,
      });
      await writeAudit(req, {
        action: 'import.isims.trigger',
        resource_type: 'ImportRun',
        resource_id: summary.run_id,
        after: {
          status: summary.status,
          rows_total: summary.rows_total,
          rows_imported: summary.rows_imported,
          rows_quarantined: summary.rows_quarantined,
        },
      });
      res.status(202).json({ run_id: summary.run_id, status: summary.status });
    } catch (err) {
      next(err);
    }
  },
);
