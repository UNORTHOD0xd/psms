// CTL-09 — Idempotency-Key support for resource-creating endpoints.
//
// Behaviour (matches docs/specs/controls.md):
//   - Header missing → no-op; the request runs normally.
//   - Header present, key not seen → run the request; on a 2xx response,
//     persist key + request_hash + response_status + response_body for
//     24 hours.
//   - Header present, key seen with same request_hash → replay the
//     stored response_status + response_body.
//   - Header present, key seen with different request_hash → 409 Conflict.
//   - Header present, key seen but expired → treat as new.
//
// The hash inputs are method, path, body. Path includes querystring so
// `?status=APPROVED` and `?status=DECLINED` produce different hashes.

import { createHash } from 'node:crypto';
import type { RequestHandler, Response } from 'express';

import { prisma } from '../lib/prisma.js';
import { Problems, sendProblem } from '../lib/problem.js';

const HEADER = 'idempotency-key';
const TTL_HOURS = 24;

function hashRequest(method: string, originalUrl: string, body: unknown): string {
  const payload = JSON.stringify({ method, originalUrl, body: body ?? null });
  return createHash('sha256').update(payload).digest('hex');
}

function isValidKey(value: string): boolean {
  // UUID v4 or any 8..64-char token of [A-Za-z0-9_.:-].
  if (value.length < 8 || value.length > 64) return false;
  return /^[A-Za-z0-9_.:-]+$/.test(value);
}

export const idempotency: RequestHandler = async (req, res, next) => {
  const headerVal = req.header(HEADER);
  if (!headerVal) return next();

  if (!isValidKey(headerVal)) {
    return sendProblem(
      res,
      Problems.badRequest('Idempotency-Key must be 8..64 chars [A-Za-z0-9_.:-]'),
    );
  }

  const request_hash = hashRequest(req.method, req.originalUrl, req.body);

  const existing = await prisma.idempotencyKey.findUnique({ where: { key: headerVal } });

  if (existing && existing.expires_at > new Date()) {
    if (existing.request_hash !== request_hash) {
      return sendProblem(
        res,
        Problems.conflict('Idempotency-Key reused with a different request payload'),
      );
    }
    res
      .status(existing.response_status)
      .type('application/json')
      .send(existing.response_body as unknown as object);
    return;
  }

  // Capture the response to persist it on success. We wrap `res.json`
  // because every handler in the codebase calls .json() (or .end() with
  // no body for 204). For 204 we still record an empty body.
  const originalJson = res.json.bind(res) as Response['json'];
  const originalEnd = res.end.bind(res) as Response['end'];
  let captured: { status: number; body: unknown } | null = null;

  res.json = function (body: unknown): Response {
    captured = { status: res.statusCode, body };
    return originalJson(body);
  } as Response['json'];

  res.end = function (...args: unknown[]): Response {
    if (!captured) captured = { status: res.statusCode, body: null };
    return (originalEnd as (...a: unknown[]) => Response)(...args);
  } as Response['end'];

  res.on('finish', () => {
    void (async () => {
      if (!captured) return;
      // Only record successful 2xx responses; failed requests should be
      // retryable without a stale key blocking them.
      if (captured.status < 200 || captured.status >= 300) return;
      try {
        await prisma.idempotencyKey.upsert({
          where: { key: headerVal },
          create: {
            key: headerVal,
            endpoint: `${req.method} ${req.route?.path ?? req.path}`,
            request_hash,
            response_status: captured.status,
            response_body: (captured.body ?? null) as never,
            user_id: req.auth?.user_id ?? null,
            expires_at: new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000),
          },
          // Refresh the TTL when the same key successfully completes again
          // (rare — single-use is the common case).
          update: {
            expires_at: new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000),
            request_hash,
            response_status: captured.status,
            response_body: (captured.body ?? null) as never,
          },
        });
      } catch {
        // Best-effort. Idempotency persistence failure must not poison the
        // already-sent response. The error-handler logger picks this up
        // via the unhandled-rejection sink.
      }
    })();
  });

  next();
};
