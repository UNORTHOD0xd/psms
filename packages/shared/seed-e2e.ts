// E2E fixture seeder.
//
// Adds: one user per role, an ACTIVE organisation, and a PUBLISHED
// opportunity. Credentials are written to `tests/e2e/.fixture.json`
// for the Playwright suite to read.
//
// This script is **only** invoked by CI / local dev — never in
// production. It refuses to run when NODE_ENV=production.

import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hash } from 'argon2';
import { randomBytes } from 'node:crypto';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed e2e fixtures in production.');
  process.exit(1);
}

const prisma = new PrismaClient();

const STUDENT_EMAIL = 'e2e.student@test.psms';
const COORDINATOR_EMAIL = 'e2e.coord@test.psms';
const ADMIN_EMAIL = 'e2e.admin@test.psms';
const SUPERVISOR_EMAIL = 'e2e.supervisor@test.psms';
const PASSWORD = 'e2e-test-password-XYZ-12345';

async function ensureUser(opts: {
  email: string;
  full_name: string;
  role: 'STUDENT' | 'COORDINATOR' | 'ADMINISTRATOR' | 'SUPERVISOR';
}): Promise<string> {
  const password_hash = opts.role === 'SUPERVISOR' ? null : await hash(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email_lower: opts.email.toLowerCase() },
    create: {
      email: opts.email,
      email_lower: opts.email.toLowerCase(),
      full_name: opts.full_name,
      role: opts.role,
      is_active: true,
      password_hash,
    },
    update: {
      is_active: true,
      ...(password_hash ? { password_hash } : {}),
    },
  });

  if (opts.role === 'STUDENT') {
    const programme = await prisma.programme.findUniqueOrThrow({
      where: { programme_code: 'ICT-DIP' },
    });
    await prisma.studentProfile.upsert({
      where: { user_id: user.user_id },
      create: {
        user_id: user.user_id,
        student_id: 'E2E-STU-001',
        programme_id: programme.programme_id,
        year_of_study: 2,
        hours_required: programme.hours_required,
      },
      update: {},
    });
  }
  if (opts.role === 'COORDINATOR' || opts.role === 'ADMINISTRATOR') {
    await prisma.staffProfile.upsert({
      where: { user_id: user.user_id },
      create: {
        user_id: user.user_id,
        staff_id: opts.role === 'COORDINATOR' ? 'E2E-COORD-001' : 'E2E-ADMIN-001',
        department: 'ICT',
      },
      update: {},
    });
  }

  return user.user_id;
}

async function main(): Promise<void> {
  const studentId = await ensureUser({
    email: STUDENT_EMAIL,
    full_name: 'E2E Student',
    role: 'STUDENT',
  });
  const coordId = await ensureUser({
    email: COORDINATOR_EMAIL,
    full_name: 'E2E Coordinator',
    role: 'COORDINATOR',
  });
  await ensureUser({
    email: ADMIN_EMAIL,
    full_name: 'E2E Admin',
    role: 'ADMINISTRATOR',
  });
  await ensureUser({
    email: SUPERVISOR_EMAIL,
    full_name: 'E2E Supervisor',
    role: 'SUPERVISOR',
  });

  const org = await prisma.organisation.upsert({
    where: { organisation_id: '00000000-0000-0000-0000-000000000e2e' },
    create: {
      organisation_id: '00000000-0000-0000-0000-000000000e2e',
      name: 'E2E Acme Ltd',
      type: 'EMPLOYER',
      industry_sector: 'Technology',
      primary_contact_name: 'E2E Contact',
      primary_contact_email: 'contact@e2e.acme.test',
      primary_contact_phone: '+1-876-555-0101',
      mou_on_file: true,
      status: 'ACTIVE',
    },
    update: { status: 'ACTIVE' },
  });

  const programme = await prisma.programme.findUniqueOrThrow({
    where: { programme_code: 'ICT-DIP' },
  });
  const competency = await prisma.competency.findUniqueOrThrow({
    where: { competency_code: 'PROG-WEB' },
  });

  const oppId = '00000000-0000-0000-0000-000000000abc';
  await prisma.opportunity.upsert({
    where: { opportunity_id: oppId },
    create: {
      opportunity_id: oppId,
      organisation_id: org.organisation_id,
      created_by_user_id: coordId,
      title: 'E2E Frontend Internship',
      description: 'Build the PSMS UI alongside the project team.',
      start_date: new Date(Date.now() + 7 * 86400_000),
      end_date: new Date(Date.now() + 90 * 86400_000),
      application_deadline: new Date(Date.now() + 5 * 86400_000),
      min_hours: 60,
      openings: 2,
      supervisor_name: 'E2E Supervisor',
      supervisor_email: SUPERVISOR_EMAIL,
      status: 'PUBLISHED',
      published_at: new Date(),
      eligible_programmes: {
        create: [{ programme_id: programme.programme_id }],
      },
      required_competencies: {
        create: [{ competency_id: competency.competency_id }],
      },
    },
    update: { status: 'PUBLISHED' },
  });

  // Avoid unused-binding warning.
  void studentId;

  const fixture = {
    student_email: STUDENT_EMAIL,
    student_password: PASSWORD,
    coordinator_email: COORDINATOR_EMAIL,
    coordinator_password: PASSWORD,
    admin_email: ADMIN_EMAIL,
    admin_password: PASSWORD,
    supervisor_email: SUPERVISOR_EMAIL,
    organisation_id: org.organisation_id,
    opportunity_id: oppId,
  };

  const out = resolve(process.cwd(), 'tests/e2e/.fixture.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(fixture, null, 2));
  console.warn(`wrote e2e fixture to ${out}`);
  void randomBytes; // imported for parity with sibling seed.ts; fine to leave.
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
