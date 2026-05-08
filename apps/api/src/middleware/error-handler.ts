import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { logger } from '../lib/logger.js';
import { HttpProblem, Problems, sendProblem } from '../lib/problem.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpProblem) {
    sendProblem(res, err);
    return;
  }

  if (err instanceof ZodError) {
    const problem = Problems.badRequest(
      'Request validation failed',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
    sendProblem(res, problem);
    return;
  }

  logger.error({ err, request_id: req.id }, 'unhandled error');
  sendProblem(
    res,
    new HttpProblem({ status: 500, title: 'Internal Server Error' }),
  );
};
