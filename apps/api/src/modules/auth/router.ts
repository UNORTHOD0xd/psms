import { Router } from 'express';
import { z } from 'zod';

import { Problems, sendProblem } from '../../lib/problem.js';
import { prisma } from '../../lib/prisma.js';
import { writeAudit } from '../../middleware/audit.js';
import { requireRole } from '../../middleware/require-role.js';
import {
  magicLinkIssueLimiter,
  passwordResetLimiter,
  signInLimiter,
} from '../../middleware/rate-limit.js';

import { hashPassword, needsRehash, verifyPassword } from './password.js';
import {
  buildMagicLinkUrl,
  consumeMagicLink,
  issueMagicLink,
} from './magic-link.js';
import {
  clearSessionCookie,
  createSession,
  revokeSession,
  setSessionCookie,
} from './session.js';
import { sendEmail } from '../notifications/email.js';
import { renderMeFromUserId } from './me.js';
import { loadEnv } from '../../lib/env.js';

export const authRouter = Router();

// ── Schemas ────────────────────────────────────────────────────────────────

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
});

const PasswordResetConfirmSchema = z.object({
  token: z.string().min(32),
  new_password: z.string().min(12),
});

const MagicLinkIssueSchema = z.object({
  supervisor_email: z.string().email(),
  placement_id: z.string().uuid(),
  purpose: z.enum(['ONBOARDING', 'HOURS_APPROVAL', 'EVALUATION_MIDTERM', 'EVALUATION_FINAL']),
});

// ── /auth/sign-in ──────────────────────────────────────────────────────────

authRouter.post(
  '/sign-in',
  signInLimiter,
  requireRole('PUBLIC'),
  async (req, res, next) => {
    try {
      const body = SignInSchema.parse(req.body);
      const user = await prisma.user.findUnique({
        where: { email_lower: body.email.toLowerCase() },
      });
      if (!user || !user.is_active || !user.password_hash) {
        return sendProblem(res, Problems.unauthorized('Invalid credentials'));
      }
      const ok = await verifyPassword(user.password_hash, body.password);
      if (!ok) {
        return sendProblem(res, Problems.unauthorized('Invalid credentials'));
      }

      // Re-hash if parameters have advanced.
      if (needsRehash(user.password_hash)) {
        const next_hash = await hashPassword(body.password);
        await prisma.user.update({
          where: { user_id: user.user_id },
          data: { password_hash: next_hash },
        });
      }

      const session = await createSession({
        user_id: user.user_id,
        ip: req.ip ?? undefined,
        user_agent: req.header('user-agent') ?? undefined,
      });
      setSessionCookie(res, session.raw_cookie, session.expires_at);

      await prisma.user.update({
        where: { user_id: user.user_id },
        data: { last_signin_at: new Date() },
      });
      await writeAudit(
        Object.assign(req, { auth: { user_id: user.user_id, role: user.role, scope_placement_id: null, via: 'session' as const } }),
        { action: 'auth.sign_in', resource_type: 'User', resource_id: user.user_id },
      );

      const me = await renderMeFromUserId(user.user_id);
      res.status(200).json({ user: me });
    } catch (err) {
      next(err);
    }
  },
);

// ── /auth/sign-out ─────────────────────────────────────────────────────────

authRouter.post('/sign-out', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const env = loadEnv();
    const cookie = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (typeof cookie === 'string') await revokeSession(cookie);
    clearSessionCookie(res);
    await writeAudit(req, { action: 'auth.sign_out', resource_type: 'Session' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── /auth/me ───────────────────────────────────────────────────────────────

authRouter.get('/me', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const me = await renderMeFromUserId(req.auth!.user_id);
    res.status(200).json(me);
  } catch (err) {
    next(err);
  }
});

// ── /auth/password-reset/request ───────────────────────────────────────────

authRouter.post(
  '/password-reset/request',
  passwordResetLimiter,
  requireRole('PUBLIC'),
  async (req, res, next) => {
    try {
      const body = PasswordResetRequestSchema.parse(req.body);
      const user = await prisma.user.findUnique({
        where: { email_lower: body.email.toLowerCase() },
      });

      // Always 204 — don't leak which emails are registered.
      res.status(204).end();

      if (!user || !user.is_active || !user.password_hash) return;

      const { randomBytes, createHash } = await import('node:crypto');
      const raw = randomBytes(32).toString('base64url');
      const token_hash = createHash('sha256').update(raw).digest('hex');
      const env = loadEnv();
      await prisma.passwordResetToken.create({
        data: {
          user_id: user.user_id,
          token_hash,
          expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1h
        },
      });
      await sendEmail({
        to: user.email,
        subject: 'Reset your Knox PSMS password',
        template: 'password-reset',
        user_id: user.user_id,
        event_type: 'auth.password_reset',
        params: {
          full_name: user.full_name,
          reset_url: `${env.PUBLIC_WEB_ORIGIN}/auth/reset?token=${encodeURIComponent(raw)}`,
          ttl_hours: 1,
        },
      });
    } catch (err) {
      // Already sent 204; just log
      next(err);
    }
  },
);

// ── /auth/password-reset/confirm ───────────────────────────────────────────

authRouter.post('/password-reset/confirm', requireRole('PUBLIC'), async (req, res, next) => {
  try {
    const body = PasswordResetConfirmSchema.parse(req.body);
    const { createHash } = await import('node:crypto');
    const token_hash = createHash('sha256').update(body.token).digest('hex');
    const row = await prisma.passwordResetToken.findUnique({ where: { token_hash } });

    if (!row || row.consumed_at || row.expires_at <= new Date()) {
      return sendProblem(res, Problems.badRequest('Token invalid or expired'));
    }

    const next_hash = await hashPassword(body.new_password);

    await prisma.$transaction([
      prisma.user.update({
        where: { user_id: row.user_id },
        data: { password_hash: next_hash },
      }),
      prisma.passwordResetToken.update({
        where: { token_id: row.token_id },
        data: { consumed_at: new Date() },
      }),
      // Revoke all existing sessions on password change.
      prisma.session.updateMany({
        where: { user_id: row.user_id, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
    ]);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── /auth/magic-link/issue ─────────────────────────────────────────────────

authRouter.post(
  '/magic-link/issue',
  requireRole('COORDINATOR'),
  magicLinkIssueLimiter,
  async (req, res, next) => {
    try {
      const body = MagicLinkIssueSchema.parse(req.body);

      // Resolve supervisor user (must exist with role SUPERVISOR + tied to
      // the placement's organisation).
      const placement = await prisma.placement.findUnique({
        where: { placement_id: body.placement_id },
        include: { supervisor: true },
      });
      if (!placement) return sendProblem(res, Problems.notFound('Placement not found'));
      if (placement.supervisor.email_lower !== body.supervisor_email.toLowerCase()) {
        return sendProblem(
          res,
          Problems.unprocessable('Supervisor email does not match placement supervisor'),
        );
      }

      const issued = await issueMagicLink({
        supervisor_user_id: placement.supervisor_user_id,
        placement_id: placement.placement_id,
        purpose: body.purpose,
        issued_by_user_id: req.auth!.user_id,
      });

      await sendEmail({
        to: placement.supervisor.email,
        subject: 'Knox PSMS — secure access link',
        template: 'magic-link',
        user_id: placement.supervisor_user_id,
        event_type: `auth.magic_link.${body.purpose.toLowerCase()}`,
        params: {
          full_name: placement.supervisor.full_name,
          purpose: body.purpose,
          link: buildMagicLinkUrl(issued.raw_token),
          ttl_hours: 24,
        },
      });

      await writeAudit(req, {
        action: 'auth.magic_link.issue',
        resource_type: 'MagicLinkToken',
        resource_id: issued.token_id,
        after: { purpose: body.purpose, placement_id: body.placement_id },
      });

      res.status(202).json({ status: 'queued' });
    } catch (err) {
      next(err);
    }
  },
);

// ── /auth/magic-link/consume ───────────────────────────────────────────────

authRouter.post('/magic-link/consume', requireRole('PUBLIC'), async (req, res, next) => {
  try {
    const raw = typeof req.query.token === 'string' ? req.query.token : '';
    const consumed = await consumeMagicLink(raw);

    const session = await createSession({
      user_id: consumed.supervisor_user_id,
      scope_placement_id: consumed.placement_id,
      ip: req.ip ?? undefined,
      user_agent: req.header('user-agent') ?? undefined,
    });
    setSessionCookie(res, session.raw_cookie, session.expires_at);

    const me = await renderMeFromUserId(consumed.supervisor_user_id);
    res.status(200).json(me);
  } catch (err) {
    if (err instanceof Error && 'status' in err && err.status === 410) {
      return sendProblem(res, Problems.gone(err.message));
    }
    next(err);
  }
});
