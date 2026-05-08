// CTL-04: every operation in apps/api/openapi.yaml must declare
// `x-required-role`. A missing extension is a CI failure.
//
// Run: pnpm tsx scripts/check-openapi-rbac.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const SPEC_PATH = resolve(import.meta.dirname, '..', 'apps', 'api', 'openapi.yaml');
const VALID_GUARDS = new Set([
  'PUBLIC',
  'ANY_AUTHENTICATED',
  'STUDENT',
  'SUPERVISOR',
  'COORDINATOR',
  'ADMINISTRATOR',
  'COORDINATOR_OR_ADMIN',
]);

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

interface Operation {
  'x-required-role'?: string;
}

interface PathItem {
  [method: string]: Operation;
}

const spec = parseYaml(readFileSync(SPEC_PATH, 'utf8')) as {
  paths: Record<string, PathItem>;
};

let problems = 0;
let checked = 0;

for (const [route, item] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(item)) {
    if (!HTTP_METHODS.has(method)) continue;
    checked += 1;
    const guard = op['x-required-role'];
    if (!guard) {
      console.error(`✗ ${method.toUpperCase()} ${route}: missing x-required-role`);
      problems += 1;
      continue;
    }
    if (!VALID_GUARDS.has(guard)) {
      console.error(
        `✗ ${method.toUpperCase()} ${route}: invalid x-required-role "${guard}". ` +
          `Allowed: ${[...VALID_GUARDS].join(', ')}`,
      );
      problems += 1;
    }
  }
}

if (problems > 0) {
  console.error(`\n${problems} problem(s) across ${checked} operation(s).`);
  process.exit(1);
} else {
  console.warn(`✓ All ${checked} operations declare a valid x-required-role.`);
}
