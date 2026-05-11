// PRC-10 — UCJ accreditation evidence pack.
//
// The endpoint is async (202 + pack_id). Generation runs in the
// background and writes the finished bundle to object storage. The
// pilot uses an in-process fire-and-forget; production may queue.

import type { PrismaClient } from '@prisma/client';

import { putObject } from '../../lib/storage.js';

import { csvDocument } from './csv.js';
import { buildStoreZip } from './zip.js';

export interface AccreditationFilters {
  start_date?: Date;
  end_date?: Date;
  programme_codes?: string[];
}

export interface AccreditationPack {
  pack_id: string;
  storage_key: string;
  byte_size: number;
  generated_at: string;
}

export async function buildAccreditationPack(
  prisma: PrismaClient,
  pack_id: string,
  filters: AccreditationFilters,
): Promise<AccreditationPack> {
  const placementWhere: Record<string, unknown> = {};
  if (filters.start_date) placementWhere.start_date = { gte: filters.start_date };
  if (filters.end_date)
    placementWhere.end_date = { ...(placementWhere.end_date ?? {}), lte: filters.end_date };
  if (filters.programme_codes && filters.programme_codes.length > 0) {
    placementWhere.student = {
      student_profile: {
        programme: { programme_code: { in: filters.programme_codes } },
      },
    };
  }

  const placements = await prisma.placement.findMany({
    where: placementWhere,
    include: {
      student: { select: { user_id: true, full_name: true } },
      opportunity: {
        include: {
          organisation: { select: { organisation_id: true, name: true, type: true } },
        },
      },
    },
  });

  const placementsCsv = csvDocument(
    [
      'placement_id',
      'student_user_id',
      'student_full_name',
      'opportunity_title',
      'organisation_name',
      'start_date',
      'end_date',
      'status',
      'composite_rating',
    ],
    placements.map((p) => [
      p.placement_id,
      p.student_user_id,
      p.student.full_name,
      p.opportunity.title,
      p.opportunity.organisation.name,
      p.start_date.toISOString().slice(0, 10),
      p.end_date.toISOString().slice(0, 10),
      p.status,
      p.composite_rating === null ? '' : Number(p.composite_rating).toFixed(2),
    ]),
  );

  const orgIds = Array.from(new Set(placements.map((p) => p.opportunity.organisation.organisation_id)));
  const orgs = orgIds.length
    ? await prisma.organisation.findMany({ where: { organisation_id: { in: orgIds } } })
    : [];
  const orgsCsv = csvDocument(
    [
      'organisation_id',
      'name',
      'type',
      'industry_sector',
      'mou_on_file',
      'mou_expiry_date',
      'status',
    ],
    orgs.map((o) => [
      o.organisation_id,
      o.name,
      o.type,
      o.industry_sector,
      String(o.mou_on_file),
      o.mou_expiry_date ? o.mou_expiry_date.toISOString().slice(0, 10) : '',
      o.status,
    ]),
  );

  const placementIds = placements.map((p) => p.placement_id);
  const evals = placementIds.length
    ? await prisma.evaluation.findMany({
        where: { placement_id: { in: placementIds } },
        select: {
          evaluation_id: true,
          placement_id: true,
          evaluation_type: true,
          attendance_rating: true,
          professionalism_rating: true,
          recommend_future: true,
          average_score: true,
          submitted_at: true,
          narrative: true,
        },
      })
    : [];
  const evalsCsv = csvDocument(
    [
      'evaluation_id',
      'placement_id',
      'evaluation_type',
      'attendance_rating',
      'professionalism_rating',
      'recommend_future',
      'average_score',
      'submitted_at',
      'narrative_excerpt',
    ],
    evals.map((e) => [
      e.evaluation_id,
      e.placement_id,
      e.evaluation_type,
      e.attendance_rating,
      e.professionalism_rating,
      String(e.recommend_future),
      Number(e.average_score).toFixed(3),
      e.submitted_at.toISOString(),
      // Anonymise/truncate narrative to 200 chars per docs/specs/outputs.md (OUT-06).
      e.narrative.slice(0, 200),
    ]),
  );

  const studentIds = Array.from(new Set(placements.map((p) => p.student_user_id)));
  const hoursAgg = studentIds.length
    ? await prisma.hoursLog.groupBy({
        by: ['student_user_id', 'status'],
        where: { student_user_id: { in: studentIds } },
        _sum: { hours: true },
      })
    : [];
  const profiles = studentIds.length
    ? await prisma.studentProfile.findMany({
        where: { user_id: { in: studentIds } },
        include: { programme: { select: { programme_code: true } } },
      })
    : [];
  const summary = new Map<string, { approved: number; pending: number; rejected: number }>();
  for (const id of studentIds) summary.set(id, { approved: 0, pending: 0, rejected: 0 });
  for (const row of hoursAgg) {
    const cell = summary.get(row.student_user_id);
    if (!cell) continue;
    const total = Number(row._sum.hours ?? 0);
    if (row.status === 'APPROVED') cell.approved = total;
    if (row.status === 'PENDING') cell.pending = total;
    if (row.status === 'REJECTED') cell.rejected = total;
  }
  const hoursCsv = csvDocument(
    ['student_user_id', 'programme_code', 'hours_required', 'approved_hours', 'pending_hours', 'rejected_hours'],
    profiles.map((p) => {
      const s = summary.get(p.user_id) ?? { approved: 0, pending: 0, rejected: 0 };
      return [
        p.user_id,
        p.programme.programme_code,
        p.hours_required,
        s.approved,
        s.pending,
        s.rejected,
      ];
    }),
  );

  const cover = `Knox PSMS — UCJ Accreditation Pack
Pack ID: ${pack_id}
Generated: ${new Date().toISOString()}
Filter start: ${filters.start_date?.toISOString() ?? '(none)'}
Filter end: ${filters.end_date?.toISOString() ?? '(none)'}
Programme codes: ${filters.programme_codes?.join(', ') ?? '(all)'}

Files in this pack:
- placements.csv (${placements.length} rows)
- organisations.csv (${orgs.length} rows)
- evaluations.csv (${evals.length} rows)
- hours_summary.csv (${profiles.length} rows)
`;

  const zip = buildStoreZip([
    { name: 'cover.txt', bytes: Buffer.from(cover, 'utf8') },
    { name: 'placements.csv', bytes: Buffer.from(placementsCsv, 'utf8') },
    { name: 'organisations.csv', bytes: Buffer.from(orgsCsv, 'utf8') },
    { name: 'evaluations.csv', bytes: Buffer.from(evalsCsv, 'utf8') },
    { name: 'hours_summary.csv', bytes: Buffer.from(hoursCsv, 'utf8') },
  ]);

  const storage_key = `reports/accreditation/${pack_id}.zip`;
  await putObject(storage_key, zip);

  return {
    pack_id,
    storage_key,
    byte_size: zip.length,
    generated_at: new Date().toISOString(),
  };
}

