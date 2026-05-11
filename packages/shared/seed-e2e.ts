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
import { fileURLToPath } from 'node:url';
import { hash } from 'argon2';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..');

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

  const programmes = await prisma.programme.findMany();
  const programmeByCode = new Map(programmes.map((p) => [p.programme_code, p]));
  const competencies = await prisma.competency.findMany();
  const competencyByCode = new Map(competencies.map((c) => [c.competency_code, c]));

  const secondOrg = await prisma.organisation.upsert({
    where: { organisation_id: '00000000-0000-0000-0000-000000000e2f' },
    create: {
      organisation_id: '00000000-0000-0000-0000-000000000e2f',
      name: 'Kingston Cloud Co-op',
      type: 'EMPLOYER',
      industry_sector: 'Cloud services',
      primary_contact_name: 'Marcia Henry',
      primary_contact_email: 'marcia@kingston-cloud.test',
      primary_contact_phone: '+1-876-555-0144',
      mou_on_file: true,
      status: 'ACTIVE',
    },
    update: { status: 'ACTIVE' },
  });

  const oppId = '00000000-0000-0000-0000-000000000abc';
  interface OppSpec {
    opportunity_id: string;
    organisation_id: string;
    title: string;
    description: string;
    days_until_start: number;
    duration_days: number;
    min_hours: number;
    openings: number;
    eligible_programme_codes: ReadonlyArray<string>;
    required_competency_codes: ReadonlyArray<string>;
    supervisor_name: string;
    supervisor_email: string;
  }
  const oppSpecs: ReadonlyArray<OppSpec> = [
    {
      opportunity_id: oppId,
      organisation_id: org.organisation_id,
      title: 'E2E Frontend Internship',
      description: 'Build the PSMS UI alongside the project team.',
      days_until_start: 7,
      duration_days: 83,
      min_hours: 60,
      openings: 2,
      eligible_programme_codes: ['ICT-DIP'],
      required_competency_codes: ['PROG-WEB'],
      supervisor_name: 'E2E Supervisor',
      supervisor_email: SUPERVISOR_EMAIL,
    },
    {
      opportunity_id: '00000000-0000-0000-0000-000000000ab1',
      organisation_id: org.organisation_id,
      title: 'Backend API Engineering Internship',
      description: 'Pair with the platform team on a TypeScript REST API: authentication, data modelling, observability.',
      days_until_start: 14,
      duration_days: 84,
      min_hours: 120,
      openings: 1,
      eligible_programme_codes: ['ICT-DIP', 'CS-BSC'],
      required_competency_codes: ['PROG-BE', 'PROG-DB'],
      supervisor_name: 'E2E Supervisor',
      supervisor_email: SUPERVISOR_EMAIL,
    },
    {
      opportunity_id: '00000000-0000-0000-0000-000000000ab2',
      organisation_id: secondOrg.organisation_id,
      title: 'AWS Cloud Operations Attachment',
      description: 'Shadow the SRE rotation: incident response, infrastructure-as-code, cost dashboards on AWS.',
      days_until_start: 21,
      duration_days: 70,
      min_hours: 90,
      openings: 2,
      eligible_programme_codes: ['CS-BSC', 'IS-BSC'],
      required_competency_codes: ['CLOUD-AWS', 'OS-LINUX'],
      supervisor_name: 'Marcia Henry',
      supervisor_email: 'marcia@kingston-cloud.test',
    },
    {
      opportunity_id: '00000000-0000-0000-0000-000000000ab3',
      organisation_id: secondOrg.organisation_id,
      title: 'Network Operations Helpdesk',
      description: 'Triage LAN/WiFi tickets for the campus network team; weekly site visits to two satellite offices.',
      days_until_start: 5,
      duration_days: 60,
      min_hours: 40,
      openings: 3,
      eligible_programme_codes: ['NET-CERT', 'ICT-DIP'],
      required_competency_codes: ['NET-LAN', 'NET-SEC'],
      supervisor_name: 'Tariq Bryan',
      supervisor_email: 'tariq@kingston-cloud.test',
    },
    {
      opportunity_id: '00000000-0000-0000-0000-000000000ab4',
      organisation_id: org.organisation_id,
      title: 'Community ICT Skills Volunteer',
      description: 'Run Saturday computer-literacy clinics at the Spanish Town parish library — service-hours only, no stipend.',
      days_until_start: 3,
      duration_days: 120,
      min_hours: 30,
      openings: 5,
      eligible_programme_codes: [], // open to all programmes
      required_competency_codes: ['SOFT-COMM', 'SOFT-TEAM'],
      supervisor_name: 'E2E Supervisor',
      supervisor_email: SUPERVISOR_EMAIL,
    },
  ];

  for (const spec of oppSpecs) {
    const programmeRows = spec.eligible_programme_codes.map((code) => {
      const p = programmeByCode.get(code);
      if (!p) throw new Error(`seed-e2e: unknown programme_code "${code}"`);
      return { programme_id: p.programme_id };
    });
    const competencyRows = spec.required_competency_codes.map((code) => {
      const c = competencyByCode.get(code);
      if (!c) throw new Error(`seed-e2e: unknown competency_code "${code}"`);
      return { competency_id: c.competency_id };
    });

    await prisma.opportunityProgramme.deleteMany({
      where: { opportunity_id: spec.opportunity_id },
    });
    await prisma.opportunityCompetency.deleteMany({
      where: { opportunity_id: spec.opportunity_id },
    });

    await prisma.opportunity.upsert({
      where: { opportunity_id: spec.opportunity_id },
      create: {
        opportunity_id: spec.opportunity_id,
        organisation_id: spec.organisation_id,
        created_by_user_id: coordId,
        title: spec.title,
        description: spec.description,
        start_date: new Date(Date.now() + spec.days_until_start * 86400_000),
        end_date: new Date(Date.now() + (spec.days_until_start + spec.duration_days) * 86400_000),
        application_deadline: new Date(
          Date.now() + Math.max(spec.days_until_start - 2, 1) * 86400_000,
        ),
        min_hours: spec.min_hours,
        openings: spec.openings,
        supervisor_name: spec.supervisor_name,
        supervisor_email: spec.supervisor_email,
        status: 'PUBLISHED',
        published_at: new Date(),
        eligible_programmes: { create: programmeRows },
        required_competencies: { create: competencyRows },
      },
      update: {
        title: spec.title,
        description: spec.description,
        status: 'PUBLISHED',
        eligible_programmes: { create: programmeRows },
        required_competencies: { create: competencyRows },
      },
    });
  }

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

  const out = resolve(REPO_ROOT, 'tests/e2e/.fixture.json');
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
