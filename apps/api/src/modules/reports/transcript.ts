// OUT-07 — Per-student placement transcript PDF.

import PDFDocument from 'pdfkit';

import type { PrismaClient } from '@prisma/client';

import { Problems } from '../../lib/problem.js';

export interface TranscriptInput {
  prisma: PrismaClient;
  student_user_id: string;
  generated_for_role: string;
}

export async function buildTranscriptPdf(input: TranscriptInput): Promise<Buffer> {
  const { prisma, student_user_id } = input;
  const profile = await prisma.studentProfile.findUnique({
    where: { user_id: student_user_id },
    include: { user: true, programme: true },
  });
  if (!profile) throw Problems.notFound('Student profile not found');

  const placements = await prisma.placement.findMany({
    where: { student_user_id },
    include: {
      opportunity: { include: { organisation: true } },
      evaluations: { orderBy: { submitted_at: 'asc' } },
    },
    orderBy: { start_date: 'asc' },
  });

  const approvedSum = await prisma.hoursLog.groupBy({
    by: ['placement_id', 'status'],
    where: { student_user_id, status: 'APPROVED' },
    _sum: { hours: true },
  });
  const approvedByPlacement = new Map<string, number>();
  for (const row of approvedSum) {
    approvedByPlacement.set(row.placement_id, Number(row._sum.hours ?? 0));
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('Knox Community College — PSMS', { align: 'left' });

    doc
      .moveDown()
      .fontSize(20)
      .fillColor('#000000')
      .text('Placement Transcript', { align: 'center' });

    doc
      .moveDown()
      .fontSize(12)
      .text(`Student: ${profile.user.full_name}`)
      .text(`Student ID: ${profile.student_id}`)
      .text(`Programme: ${profile.programme.name} (${profile.programme.programme_code})`)
      .text(`Hours required: ${profile.hours_required}`);

    doc
      .moveDown()
      .fontSize(8)
      .fillColor('#666666')
      .text(`Generated: ${new Date().toISOString()} by role ${input.generated_for_role}`);

    if (placements.length === 0) {
      doc.moveDown(2).fontSize(12).fillColor('#000000').text('No placements on record.');
    }

    for (const p of placements) {
      doc
        .moveDown(1.5)
        .fontSize(14)
        .fillColor('#000000')
        .text(`${p.opportunity.organisation.name} — ${p.opportunity.title}`);
      doc
        .fontSize(10)
        .fillColor('#444444')
        .text(
          `${p.start_date.toISOString().slice(0, 10)} → ${p.end_date.toISOString().slice(0, 10)}    Status: ${p.status}`,
        )
        .text(
          `Approved hours: ${approvedByPlacement.get(p.placement_id) ?? 0}    Composite: ${
            p.composite_rating === null ? 'n/a' : Number(p.composite_rating).toFixed(2)
          }`,
        );
      for (const e of p.evaluations) {
        doc
          .moveDown(0.4)
          .fontSize(10)
          .fillColor('#333333')
          .text(
            `  ${e.evaluation_type}: avg ${Number(e.average_score).toFixed(2)}; attendance ${e.attendance_rating}/5; professionalism ${e.professionalism_rating}/5; recommend=${String(e.recommend_future)}`,
          );
      }
    }

    doc.end();
  });
}
