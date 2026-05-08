// PRC-06 — Certificate generation orchestrator.
//
// Single entry: `generateForPlacement(placement_id)`. Idempotent: if a
// non-revoked certificate exists for the placement, returns it; if a
// revoked one exists, refuses (admin must regenerate explicitly).
//
// Triggers PRC-05 eligibility — the call is rejected for INELIGIBLE
// placements; ELIGIBLE_WITH_CAUTION is permitted with a warning logged
// (a coordinator override is the path back).

import { randomUUID } from 'node:crypto';

import type { Certificate } from '@prisma/client';

import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { Problems } from '../../lib/problem.js';
import { putObject, signedUrl } from '../../lib/storage.js';
import { evaluateEligibility } from '../ledger/eligibility.js';

import { renderCertificatePdf, type CertificateContent } from './pdf.js';
import { qrPng, verifyUrl } from './qr.js';
import { signPdf } from './signing.js';

export interface GenerateOptions {
  placement_id: string;
  // Set by /regenerate handler — wipes the prior storage object and
  // overwrites in place.
  force?: boolean;
}

export async function generateForPlacement(opts: GenerateOptions): Promise<Certificate> {
  const placement = await prisma.placement.findUnique({
    where: { placement_id: opts.placement_id },
    include: {
      student: true,
      opportunity: { include: { organisation: true } },
    },
  });
  if (!placement) throw Problems.notFound('Placement not found');

  const profile = await prisma.studentProfile.findUnique({
    where: { user_id: placement.student_user_id },
    include: { programme: true },
  });
  if (!profile) throw Problems.unprocessable('Student profile not found');

  const existing = await prisma.certificate.findUnique({
    where: { placement_id: opts.placement_id },
  });
  if (existing && !opts.force) {
    if (existing.revoked) {
      throw Problems.unprocessable('Certificate is revoked; explicit regenerate required');
    }
    return existing;
  }

  // Eligibility check (PRC-05).
  const approvedSum = await prisma.hoursLog.aggregate({
    where: { student_user_id: placement.student_user_id, status: 'APPROVED' },
    _sum: { hours: true },
  });
  const approved_hours = Number(approvedSum._sum.hours ?? 0);
  const finalCount = await prisma.evaluation.count({
    where: { evaluation_type: 'FINAL', placement: { student_user_id: placement.student_user_id } },
  });
  const completedCount = await prisma.placement.count({
    where: { student_user_id: placement.student_user_id, status: 'COMPLETED' },
  });
  const eligibility = evaluateEligibility({
    hours_required: profile.hours_required,
    approved_hours,
    has_completed_placement: completedCount > 0,
    has_final_evaluation: finalCount > 0,
  });
  if (eligibility.status === 'INELIGIBLE') {
    throw Problems.unprocessable(
      `Student not eligible for certificate: ${eligibility.reasons.join('; ')}`,
    );
  }
  if (eligibility.status === 'ELIGIBLE_WITH_CAUTION') {
    logger.warn(
      { placement_id: placement.placement_id, reasons: eligibility.reasons },
      'generating certificate under ELIGIBLE_WITH_CAUTION',
    );
  }

  // Reserve a certificate_id (or reuse the existing row's id when forcing).
  // We need the id before rendering because it is printed on the PDF.
  const certificate_id = existing?.certificate_id ?? randomCertificateId();

  const composite_rating =
    placement.composite_rating === null ? null : Number(placement.composite_rating);

  const content: CertificateContent = {
    certificate_id,
    student_full_name: placement.student.full_name,
    programme_name: profile.programme.name,
    programme_code: profile.programme.programme_code,
    organisation_name: placement.opportunity.organisation.name,
    start_date: placement.start_date,
    end_date: placement.end_date,
    approved_hours,
    composite_rating,
    issued_at: new Date(),
  };

  const qr = await qrPng(certificate_id);
  const pdf = await renderCertificatePdf(content, qr);
  const { signature_hash, signature } = signPdf(pdf);
  const storage_key = `certificates/${certificate_id}.pdf`;
  await putObject(storage_key, pdf);

  if (existing) {
    return prisma.certificate.update({
      where: { certificate_id: existing.certificate_id },
      data: {
        signature_hash,
        signature,
        pdf_storage_key: storage_key,
        pdf_url: signedUrl(storage_key),
        qr_code_url: verifyUrl(certificate_id),
        issued_at: new Date(),
        revoked: false,
        revoked_at: null,
        revoked_by_user_id: null,
        revoked_reason: null,
      },
    });
  }

  return prisma.certificate.create({
    data: {
      certificate_id,
      placement_id: placement.placement_id,
      student_user_id: placement.student_user_id,
      pdf_storage_key: storage_key,
      pdf_url: signedUrl(storage_key),
      qr_code_url: verifyUrl(certificate_id),
      signature_hash,
      signature,
    },
  });
}

function randomCertificateId(): string {
  // Reuse the same UUID format the schema's @default uses, but generate
  // app-side so we can render it onto the PDF before insert.
  return randomUUID();
}
