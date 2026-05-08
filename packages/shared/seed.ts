import { PrismaClient } from '@prisma/client';

// Seed reference data only. Demo data lives in a separate command.
const prisma = new PrismaClient();

const PROGRAMMES = [
  { programme_code: 'ICT-DIP', name: 'Diploma in Information & Communications Technology', hours_required: 120 },
  { programme_code: 'CS-BSC', name: 'BSc Computer Science', hours_required: 240 },
  { programme_code: 'IS-BSC', name: 'BSc Information Systems', hours_required: 240 },
  { programme_code: 'NET-CERT', name: 'Network Engineering Certificate', hours_required: 80 },
];

const COMPETENCIES = [
  { competency_code: 'PROG-WEB', name: 'Web development (HTML/CSS/JS)', category: 'programming' },
  { competency_code: 'PROG-BE', name: 'Backend development', category: 'programming' },
  { competency_code: 'PROG-DB', name: 'Relational databases & SQL', category: 'data' },
  { competency_code: 'NET-LAN', name: 'LAN administration', category: 'networking' },
  { competency_code: 'NET-SEC', name: 'Network security fundamentals', category: 'security' },
  { competency_code: 'CLOUD-AWS', name: 'AWS cloud services', category: 'cloud' },
  { competency_code: 'OS-LINUX', name: 'Linux system administration', category: 'systems' },
  { competency_code: 'SOFT-COMM', name: 'Professional communication', category: 'soft' },
  { competency_code: 'SOFT-TEAM', name: 'Team collaboration', category: 'soft' },
  { competency_code: 'PM-AGILE', name: 'Agile project management', category: 'process' },
];

async function main(): Promise<void> {
  for (const p of PROGRAMMES) {
    await prisma.programme.upsert({
      where: { programme_code: p.programme_code },
      update: { name: p.name, hours_required: p.hours_required },
      create: p,
    });
  }
  for (const c of COMPETENCIES) {
    await prisma.competency.upsert({
      where: { competency_code: c.competency_code },
      update: { name: c.name, category: c.category },
      create: c,
    });
  }
  console.warn(`seeded ${PROGRAMMES.length} programmes, ${COMPETENCIES.length} competencies`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
