// Test-data fixtures for the e2e suite.
//
// The CI job `e2e` runs `pnpm db:seed:e2e` (a dedicated script in
// `packages/shared/seed-e2e.ts`) before Playwright starts. That script
// creates one user per role, an active organisation, and a published
// opportunity, and writes their credentials to `tests/e2e/.fixture.json`.
// Specs read this file once at module load; if the file is missing
// the spec aborts with a clear error rather than silently testing
// against a wrong DB.
//
// Locally: run `pnpm db:reset && pnpm db:seed && pnpm db:seed:e2e`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface E2EFixture {
  student_email: string;
  student_password: string;
  coordinator_email: string;
  coordinator_password: string;
  admin_email: string;
  admin_password: string;
  supervisor_email: string;
  organisation_id: string;
  opportunity_id: string;
  certificate_id?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '.fixture.json');

let cached: E2EFixture | null = null;

export function fixture(): E2EFixture {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(fixturePath, 'utf8')) as E2EFixture;
  } catch (err) {
    throw new Error(
      `e2e fixture not found at ${fixturePath}. Run \`pnpm db:seed:e2e\` first. Cause: ${(err as Error).message}`,
    );
  }
  return cached;
}
