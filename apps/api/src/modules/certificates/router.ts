// PRC-06 + OUT-04 + OUT-08 — Certificate HTTP surface.
//
// Routes:
//   GET    /me/certificates                       (STUDENT)
//   GET    /certificates/:id                      (ANY_AUTHENTICATED, scoped)
//   GET    /certificates/:id/pdf                  (ANY_AUTHENTICATED, scoped)
//   POST   /certificates/:id/regenerate           (COORDINATOR_OR_ADMIN)
//   POST   /certificates/:id/revoke               (ADMINISTRATOR)
//   GET    /certificates/verify/:id               (PUBLIC)
//   GET    /certificates/public-key               (PUBLIC)

import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { getObject } from '../../lib/storage.js';
import { writeAudit } from '../../middleware/audit.js';
import { requireRole } from '../../middleware/require-role.js';

import { generateForPlacement } from './service.js';
import { publicKeyJwk, publicKeyPem, verifyPdf } from './signing.js';

export const meCertificatesRouter = Router();
export const certificatesRouter = Router();

// ── /me/certificates ──────────────────────────────────────────────────────

meCertificatesRouter.get('/', requireRole('STUDENT'), async (req, res, next) => {
  try {
    const rows = await prisma.certificate.findMany({
      where: { student_user_id: req.auth!.user_id },
      orderBy: { issued_at: 'desc' },
      select: {
        certificate_id: true,
        placement_id: true,
        pdf_url: true,
        qr_code_url: true,
        signature_hash: true,
        issued_at: true,
        revoked: true,
        revoked_at: true,
      },
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── /certificates/public-key ──────────────────────────────────────────────

certificatesRouter.get('/public-key', requireRole('PUBLIC'), (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({
      algorithm: 'Ed25519',
      pem: publicKeyPem(),
      jwk: publicKeyJwk(),
    });
  } catch (err) {
    next(err);
  }
});

// ── /certificates/verify/:id (PUBLIC) ─────────────────────────────────────

certificatesRouter.get('/verify/:certificate_id', requireRole('PUBLIC'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.certificate_id);
    const row = await prisma.certificate.findUnique({
      where: { certificate_id: id },
      include: {
        student: { select: { full_name: true } },
        placement: {
          include: {
            opportunity: { include: { organisation: { select: { name: true } } } },
          },
        },
      },
    });
    if (!row) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).json({ valid: false, reason: 'Certificate not found' });
      return;
    }

    const programme = await prisma.studentProfile.findUnique({
      where: { user_id: row.student_user_id },
      include: { programme: { select: { name: true } } },
    });

    let valid = !row.revoked;
    if (valid) {
      try {
        const bytes = await getObject(row.pdf_storage_key);
        valid = verifyPdf(bytes, row.signature);
      } catch {
        valid = false;
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      valid,
      certificate_id: row.certificate_id,
      student_name: row.student.full_name,
      programme_name: programme?.programme.name ?? null,
      organisation_name: row.placement.opportunity.organisation.name,
      issued_at: row.issued_at.toISOString(),
      revoked: row.revoked,
      revoked_at: row.revoked_at?.toISOString() ?? null,
      signature_hash: row.signature_hash,
    });
  } catch (err) {
    next(err);
  }
});

// ── Helpers for scoped reads ──────────────────────────────────────────────

async function loadAndAuthoriseRead(req: import('express').Request, id: string) {
  const row = await prisma.certificate.findUnique({
    where: { certificate_id: id },
    include: {
      placement: { select: { supervisor_user_id: true, student_user_id: true } },
    },
  });
  if (!row) return null;
  const role = req.auth!.role;
  const allowed =
    role === 'COORDINATOR' ||
    role === 'ADMINISTRATOR' ||
    (role === 'STUDENT' && row.student_user_id === req.auth!.user_id) ||
    (role === 'SUPERVISOR' && row.placement.supervisor_user_id === req.auth!.user_id);
  return allowed ? row : 'forbidden';
}

// ── /certificates/:id ─────────────────────────────────────────────────────

certificatesRouter.get(
  '/:certificate_id',
  requireRole('ANY_AUTHENTICATED'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.certificate_id);
      const row = await loadAndAuthoriseRead(req, id);
      if (!row) return sendProblem(res, Problems.notFound());
      if (row === 'forbidden') return sendProblem(res, Problems.forbidden());
      res.json({
        certificate_id: row.certificate_id,
        placement_id: row.placement_id,
        student_user_id: row.student_user_id,
        pdf_url: row.pdf_url,
        qr_code_url: row.qr_code_url,
        signature_hash: row.signature_hash,
        issued_at: row.issued_at.toISOString(),
        revoked: row.revoked,
        revoked_at: row.revoked_at?.toISOString() ?? null,
        revoked_reason: row.revoked_reason,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── /certificates/:id/pdf ─────────────────────────────────────────────────

certificatesRouter.get(
  '/:certificate_id/pdf',
  requireRole('ANY_AUTHENTICATED'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.certificate_id);
      const row = await loadAndAuthoriseRead(req, id);
      if (!row) return sendProblem(res, Problems.notFound());
      if (row === 'forbidden') return sendProblem(res, Problems.forbidden());
      const buf = await getObject(row.pdf_storage_key);
      res
        .status(200)
        .type('application/pdf')
        .setHeader('Content-Disposition', `inline; filename="certificate-${row.certificate_id}.pdf"`)
        .send(buf);
    } catch (err) {
      next(err);
    }
  },
);

// ── /certificates/:id/regenerate ──────────────────────────────────────────

certificatesRouter.post(
  '/:certificate_id/regenerate',
  requireRole('COORDINATOR_OR_ADMIN'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.certificate_id);
      const row = await prisma.certificate.findUnique({ where: { certificate_id: id } });
      if (!row) return sendProblem(res, Problems.notFound());
      const refreshed = await generateForPlacement({ placement_id: row.placement_id, force: true });
      await writeAudit(req, {
        action: 'certificate.regenerate',
        resource_type: 'Certificate',
        resource_id: refreshed.certificate_id,
      });
      res.json({
        certificate_id: refreshed.certificate_id,
        signature_hash: refreshed.signature_hash,
        issued_at: refreshed.issued_at.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── /certificates/:id/revoke ──────────────────────────────────────────────

const RevokeSchema = z.object({ reason: z.string().min(1).max(1000) });

certificatesRouter.post(
  '/:certificate_id/revoke',
  requireRole('ADMINISTRATOR'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.certificate_id);
      const body = RevokeSchema.parse(req.body);
      const row = await prisma.certificate.findUnique({ where: { certificate_id: id } });
      if (!row) return sendProblem(res, Problems.notFound());
      if (row.revoked) {
        return sendProblem(res, Problems.unprocessable('Already revoked'));
      }
      const updated = await prisma.certificate.update({
        where: { certificate_id: id },
        data: {
          revoked: true,
          revoked_at: new Date(),
          revoked_by_user_id: req.auth!.user_id,
          revoked_reason: body.reason,
        },
      });
      await writeAudit(req, {
        action: 'certificate.revoke',
        resource_type: 'Certificate',
        resource_id: id,
        after: { reason: body.reason },
      });
      res.json({
        certificate_id: updated.certificate_id,
        revoked: updated.revoked,
        revoked_at: updated.revoked_at?.toISOString() ?? null,
        revoked_reason: updated.revoked_reason,
      });
    } catch (err) {
      next(err);
    }
  },
);
