// PRC-01 — iSIMS CSV import job.
//
// CTL-07 invariant: this module **never** opens a network connection
// to iSIMS, never writes back. The only iSIMS-side coupling is the
// CSV file at ISIMS_CSV_PATH. A unit test asserts there are no string
// literals containing iSIMS write verbs.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { parse } from 'csv-parse';
import { z } from 'zod';

import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../modules/auth/password.js';

// Header version we accept. Bumping this number is the explicit signal
// that the contract with iSIMS has changed; mismatches fail loud.
export const SUPPORTED_HEADER_VERSION = 'v1';
export const EXPECTED_HEADER = [
  'schema_version',
  'student_id',
  'email',
  'full_name',
  'programme_code',
  'year_of_study',
  'expected_grad_date',
  'hours_required',
] as const;

const RowSchema = z.object({
  schema_version: z.string(),
  student_id: z.string().min(1).max(20),
  email: z.string().email().max(254),
  full_name: z.string().min(1).max(200),
  programme_code: z.string().min(1).max(20),
  year_of_study: z.coerce.number().int().min(1).max(8),
  expected_grad_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  hours_required: z.coerce.number().int().min(0).optional(),
});

export interface ImportSummary {
  run_id: string;
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  rows_total: number;
  rows_imported: number;
  rows_quarantined: number;
}

export interface ImportOptions {
  csv_path: string;
  source_filename?: string;
  triggered_by_user_id?: string;
  idempotency_key?: string;
}

export async function runIsimsImport(opts: ImportOptions): Promise<ImportSummary> {
  // Idempotency: if the key already maps to a run, return the existing one.
  if (opts.idempotency_key) {
    const prior = await prisma.importRun.findUnique({
      where: { idempotency_key: opts.idempotency_key },
    });
    if (prior) {
      return {
        run_id: prior.run_id,
        status: prior.status === 'RUNNING' ? 'PARTIAL' : prior.status,
        rows_total: prior.rows_total,
        rows_imported: prior.rows_imported,
        rows_quarantined: prior.rows_quarantined,
      };
    }
  }

  const run = await prisma.importRun.create({
    data: {
      source: 'isims',
      source_filename: opts.source_filename ?? null,
      idempotency_key: opts.idempotency_key ?? null,
      triggered_by_user_id: opts.triggered_by_user_id ?? null,
    },
  });

  // Pre-flight: file must exist.
  try {
    const s = await stat(opts.csv_path);
    if (!s.isFile()) throw new Error('Not a regular file');
  } catch (err) {
    await prisma.importRun.update({
      where: { run_id: run.run_id },
      data: { status: 'FAILED', completed_at: new Date() },
    });
    logger.error({ err, csv_path: opts.csv_path }, 'iSIMS CSV file unavailable');
    return {
      run_id: run.run_id,
      status: 'FAILED',
      rows_total: 0,
      rows_imported: 0,
      rows_quarantined: 0,
    };
  }

  // Look up programmes once.
  const programmes = await prisma.programme.findMany({
    select: { programme_id: true, programme_code: true, hours_required: true },
  });
  const programmeByCode = new Map(programmes.map((p) => [p.programme_code, p]));

  let rows_total = 0;
  let rows_imported = 0;
  let rows_quarantined = 0;
  let header_ok = false;

  const parser = createReadStream(opts.csv_path).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
      relax_quotes: true,
    }),
  );

  try {
    for await (const raw of parser as AsyncIterable<Record<string, string>>) {
      // Header check on the first row's known column.
      if (!header_ok) {
        const cols = Object.keys(raw);
        const missing = EXPECTED_HEADER.filter((c) => !cols.includes(c));
        if (missing.length > 0) {
          await prisma.importRun.update({
            where: { run_id: run.run_id },
            data: { status: 'FAILED', completed_at: new Date() },
          });
          logger.error({ missing, run_id: run.run_id }, 'iSIMS header mismatch');
          return {
            run_id: run.run_id,
            status: 'FAILED',
            rows_total: 0,
            rows_imported: 0,
            rows_quarantined: 0,
          };
        }
        header_ok = true;
      }

      rows_total += 1;
      const parsed = RowSchema.safeParse(raw);
      if (!parsed.success) {
        await prisma.importQuarantineRow.create({
          data: {
            run_id: run.run_id,
            row_number: rows_total,
            raw_payload: raw as never,
            reason: parsed.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; ')
              .slice(0, 500),
          },
        });
        rows_quarantined += 1;
        continue;
      }
      const row = parsed.data;

      if (row.schema_version !== SUPPORTED_HEADER_VERSION) {
        await prisma.importQuarantineRow.create({
          data: {
            run_id: run.run_id,
            row_number: rows_total,
            raw_payload: raw as never,
            reason: `Unsupported schema_version ${row.schema_version}, expected ${SUPPORTED_HEADER_VERSION}`,
          },
        });
        rows_quarantined += 1;
        continue;
      }
      const programme = programmeByCode.get(row.programme_code);
      if (!programme) {
        await prisma.importQuarantineRow.create({
          data: {
            run_id: run.run_id,
            row_number: rows_total,
            raw_payload: raw as never,
            reason: `Unknown programme_code ${row.programme_code}`,
          },
        });
        rows_quarantined += 1;
        continue;
      }

      try {
        await upsertStudent({
          email: row.email,
          full_name: row.full_name,
          student_id: row.student_id,
          programme_id: programme.programme_id,
          year_of_study: row.year_of_study,
          expected_grad_date: row.expected_grad_date ? new Date(row.expected_grad_date) : null,
          hours_required: row.hours_required ?? programme.hours_required,
        });
        rows_imported += 1;
      } catch (err) {
        await prisma.importQuarantineRow.create({
          data: {
            run_id: run.run_id,
            row_number: rows_total,
            raw_payload: raw as never,
            reason: (err instanceof Error ? err.message : String(err)).slice(0, 500),
          },
        });
        rows_quarantined += 1;
      }
    }
  } catch (err) {
    logger.error({ err, run_id: run.run_id }, 'iSIMS import top-level failure');
    await prisma.importRun.update({
      where: { run_id: run.run_id },
      data: { status: 'FAILED', completed_at: new Date(), rows_total, rows_imported, rows_quarantined },
    });
    return {
      run_id: run.run_id,
      status: 'FAILED',
      rows_total,
      rows_imported,
      rows_quarantined,
    };
  }

  const status: ImportSummary['status'] =
    rows_imported === 0 ? 'FAILED' : rows_quarantined === 0 ? 'SUCCEEDED' : 'PARTIAL';

  await prisma.importRun.update({
    where: { run_id: run.run_id },
    data: {
      status,
      completed_at: new Date(),
      rows_total,
      rows_imported,
      rows_quarantined,
    },
  });

  logger.info(
    { run_id: run.run_id, status, rows_total, rows_imported, rows_quarantined },
    'iSIMS import complete',
  );

  return { run_id: run.run_id, status, rows_total, rows_imported, rows_quarantined };
}

interface UpsertStudentInput {
  email: string;
  full_name: string;
  student_id: string;
  programme_id: number;
  year_of_study: number;
  expected_grad_date: Date | null;
  hours_required: number;
}

async function upsertStudent(input: UpsertStudentInput): Promise<void> {
  const lower = input.email.toLowerCase();
  // Students authenticate via password; until they reset, the password
  // hash is a randomised placeholder that cannot match any input.
  // INP-01 onboarding email + password-reset gives them their password.
  const placeholder_hash = await hashPassword(`isims-import-${Date.now()}-${Math.random()}`);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email_lower: lower },
      create: {
        email: input.email,
        email_lower: lower,
        full_name: input.full_name,
        role: 'STUDENT',
        password_hash: placeholder_hash,
      },
      update: {
        full_name: input.full_name,
        // Don't overwrite password on subsequent imports.
      },
    });

    await tx.studentProfile.upsert({
      where: { user_id: user.user_id },
      create: {
        user_id: user.user_id,
        student_id: input.student_id,
        programme_id: input.programme_id,
        year_of_study: input.year_of_study,
        expected_grad_date: input.expected_grad_date,
        hours_required: input.hours_required,
        hours_imported_at: new Date(),
      },
      update: {
        student_id: input.student_id,
        programme_id: input.programme_id,
        year_of_study: input.year_of_study,
        expected_grad_date: input.expected_grad_date,
        hours_required: input.hours_required,
        hours_imported_at: new Date(),
      },
    });
  });
}
