import rateLimit from 'express-rate-limit';

import { loadEnv } from '../lib/env.js';
import { Problems, sendProblem } from '../lib/problem.js';

const env = () => loadEnv();

// Sign-in: N failed attempts per IP+email per 5 minutes (INP-09).
// Scoped by account so different roles signing in from the same IP don't
// share a bucket, and successful sign-ins don't burn the budget.
export const signInLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: () => env().RATE_LIMIT_SIGNIN_PER_IP_PER_5MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const ip = req.ip ?? 'unknown';
    const raw = (req.body as { email?: unknown } | undefined)?.email;
    const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return `${ip}|${email}`;
  },
  handler: (_req, res) => sendProblem(res, Problems.tooMany('Too many sign-in attempts')),
});

// Magic-link issue: per-coordinator rolling rate limit. The "max 3 active
// per supervisor" rule is enforced at the service layer; this protects the
// endpoint from being hammered.
export const magicLinkIssueLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: () => env().RATE_LIMIT_MAGICLINK_ISSUE_PER_HOUR,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.user_id ?? req.ip ?? 'anon',
  handler: (_req, res) => sendProblem(res, Problems.tooMany('Too many magic-link issuances')),
});

// Password-reset request: per-IP. Generous because the response is always
// 204 (we don't leak which emails are registered).
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => sendProblem(res, Problems.tooMany('Too many reset requests')),
});
