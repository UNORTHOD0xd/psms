// Integration-test harness.
//
// CLAUDE.md "Testing pyramid": integration tests run against a real
// Postgres in Docker, with no DB mocks. This module is the bridge:
// it exposes a Supertest agent over the real Express app and a small
// set of helpers for creating users / placements / sessions so each
// spec stays focused on the behaviour under test.
//
// Each spec calls `await resetDb()` in beforeEach to truncate every
// transactional table (we keep reference data: Programme, Competency).
// Sessions are issued by inserting directly with the same shape the
// real session middleware produces, so handlers see `req.auth` as
// they would in production.

import { afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import type { SuperAgentTest } from 'supertest';
import { PrismaClient, Role } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';

let prisma: PrismaClient | null = null;
let app: ReturnType<typeof createApp> | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

export function getApp(): ReturnType<typeof createApp> {
  if (!app) app = createApp();
  return app;
}

export function agent(): SuperAgentTest {
  return request.agent(getApp()) as unknown as SuperAgentTest;
}

// Tables in dependency order (children first). Reference tables
// (Programme, Competency) are skipped — `pnpm db:seed` populates them
// once per CI run.
const TRUNCATE_TABLES = [
  'audit_log',
  'idempotency_key',
  'notification_delivery_event',
  'notification',
  'site_visit_followup',
  'site_visit_note',
  'hours_log',
  'evaluation_competency_rating',
  'evaluation',
  'certificate',
  'placement',
  'application',
  'opportunity_competency',
  'opportunity_programme',
  'opportunity',
  'supervisor_profile',
  'staff_profile',
  'student_competency',
  'student_profile',
  'magic_link_token',
  'password_reset_token',
  'session',
  'organisation',
  'import_quarantine_row',
  'import_run',
  'system_config',
  '"user"',
];

export async function resetDb(): Promise<void> {
  const p = getPrisma();
  // CTL-08 — audit_log has UPDATE/DELETE-blocking triggers. Disable
  // session_replication_role so TRUNCATE can run cleanly between
  // specs. The CI Postgres role is superuser; in shared envs use a
  // dedicated test DB that the test user owns.
  await p.$executeRawUnsafe(`SET session_replication_role = 'replica';`);
  await p.$executeRawUnsafe(
    `TRUNCATE TABLE ${TRUNCATE_TABLES.join(', ')} RESTART IDENTITY CASCADE;`,
  );
  await p.$executeRawUnsafe(`SET session_replication_role = 'origin';`);
}

export interface SeededUser {
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
  password: string;
}

export async function createUser(opts: {
  role: Role;
  email?: string;
  full_name?: string;
  password?: string;
  programme_code?: string;
}): Promise<SeededUser> {
  const p = getPrisma();
  const password = opts.password ?? 'integration-test-password-XYZ';
  const password_hash =
    opts.role === 'SUPERVISOR' ? null : await hashPassword(password);
  const email = opts.email ?? `${randomBytes(6).toString('hex')}@test.psms`;
  const full_name = opts.full_name ?? `Test ${opts.role}`;

  const user = await p.user.create({
    data: {
      email,
      email_lower: email.toLowerCase(),
      full_name,
      role: opts.role,
      is_active: true,
      password_hash,
    },
  });

  if (opts.role === 'STUDENT') {
    const programme = await p.programme.findUniqueOrThrow({
      where: { programme_code: opts.programme_code ?? 'ICT-DIP' },
    });
    await p.studentProfile.create({
      data: {
        user_id: user.user_id,
        student_id: `STU-${randomBytes(3).toString('hex').toUpperCase()}`,
        programme_id: programme.programme_id,
        year_of_study: 2,
        hours_required: programme.hours_required,
      },
    });
  }

  if (opts.role === 'COORDINATOR' || opts.role === 'ADMINISTRATOR') {
    await p.staffProfile.create({
      data: {
        user_id: user.user_id,
        staff_id: `STAFF-${randomBytes(3).toString('hex').toUpperCase()}`,
        department: 'ICT',
      },
    });
  }

  return {
    user_id: user.user_id,
    email,
    full_name,
    role: opts.role,
    password,
  };
}

// Creates a session row directly and hands back the raw cookie value
// that the API would have set. Specs attach this with
// `req.set('Cookie', cookieFor(user))`.
export async function cookieFor(
  user: SeededUser,
  opts?: {
    scope_placement_id?: string;
    ttl_hours?: number;
  },
): Promise<string> {
  const p = getPrisma();
  const raw = randomBytes(32).toString('base64url');
  const cookie_hash = createHash('sha256').update(raw).digest('hex');
  const expires_at = new Date(
    Date.now() + (opts?.ttl_hours ?? 8) * 60 * 60 * 1000,
  );
  await p.session.create({
    data: {
      user_id: user.user_id,
      cookie_hash,
      expires_at,
      scope_placement_id: opts?.scope_placement_id ?? null,
      ip: '127.0.0.1',
      user_agent: 'integration-tests',
    },
  });
  return `psms_session=${raw}`;
}

export async function createOrganisation(opts?: {
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  name?: string;
}): Promise<{ organisation_id: string }> {
  const p = getPrisma();
  const row = await p.organisation.create({
    data: {
      name: opts?.name ?? `Acme ${randomBytes(3).toString('hex')}`,
      type: 'EMPLOYER',
      industry_sector: 'Technology',
      primary_contact_name: 'A. Contact',
      primary_contact_email: `contact-${randomBytes(3).toString('hex')}@acme.test`,
      primary_contact_phone: '+1-876-555-0100',
      mou_on_file: true,
      status: opts?.status ?? 'ACTIVE',
    },
  });
  return { organisation_id: row.organisation_id };
}

export async function createOpportunity(opts: {
  organisation_id: string;
  created_by_user_id: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
  supervisor_email?: string;
  required_competencies?: string[];
  eligible_programmes?: string[];
  min_hours?: number;
}): Promise<{ opportunity_id: string }> {
  const p = getPrisma();
  const start = new Date(Date.now() + 7 * 86400_000);
  const end = new Date(Date.now() + 90 * 86400_000);

  const programmes = await p.programme.findMany({
    where: { programme_code: { in: opts.eligible_programmes ?? ['ICT-DIP'] } },
  });
  const competencies = await p.competency.findMany({
    where: { competency_code: { in: opts.required_competencies ?? ['PROG-WEB'] } },
  });

  const row = await p.opportunity.create({
    data: {
      organisation_id: opts.organisation_id,
      created_by_user_id: opts.created_by_user_id,
      title: `Internship ${randomBytes(2).toString('hex')}`,
      description: 'Build software with adult supervision.',
      start_date: start,
      end_date: end,
      application_deadline: new Date(Date.now() + 5 * 86400_000),
      min_hours: opts.min_hours ?? 60,
      openings: 2,
      supervisor_name: 'External Supervisor',
      supervisor_email:
        opts.supervisor_email ?? `sup-${randomBytes(3).toString('hex')}@acme.test`,
      status: opts.status ?? 'PUBLISHED',
      published_at: opts.status === 'DRAFT' ? null : new Date(),
      eligible_programmes: {
        create: programmes.map((p) => ({ programme_id: p.programme_id })),
      },
      required_competencies: {
        create: competencies.map((c) => ({ competency_id: c.competency_id })),
      },
    },
  });
  return { opportunity_id: row.opportunity_id };
}

export async function createPlacement(opts: {
  student_user_id: string;
  supervisor_user_id: string;
  opportunity_id: string;
  status?: 'PENDING_START' | 'ACTIVE' | 'COMPLETED' | 'TERMINATED';
}): Promise<{ placement_id: string; application_id: string }> {
  const p = getPrisma();
  const application = await p.application.create({
    data: {
      student_user_id: opts.student_user_id,
      opportunity_id: opts.opportunity_id,
      motivation: 'Auto-generated motivation for an integration-test placement.',
      cv_url: 'https://files.test/test-cv.pdf',
      status: 'APPROVED',
      decided_at: new Date(),
    },
  });
  const placement = await p.placement.create({
    data: {
      application_id: application.application_id,
      student_user_id: opts.student_user_id,
      supervisor_user_id: opts.supervisor_user_id,
      opportunity_id: opts.opportunity_id,
      start_date: new Date(Date.now() - 14 * 86400_000),
      end_date: new Date(Date.now() + 60 * 86400_000),
      status: opts.status ?? 'ACTIVE',
    },
  });
  return {
    placement_id: placement.placement_id,
    application_id: application.application_id,
  };
}

beforeAll(async () => {
  // Force a single Prisma client across the suite.
  getPrisma();
  getApp();
});

afterAll(async () => {
  await prisma?.$disconnect();
  prisma = null;
  app = null;
});
