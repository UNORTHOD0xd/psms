// CTL-07 — iSIMS import is read-only against iSIMS.
//
// Static guard: the import module must not contain any code path that
// posts back to iSIMS. We grep the source bytes for forbidden patterns.
// This is a heuristic, not a proof — the production safety net is an
// egress allowlist on the network — but it catches the obvious slips.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const FORBIDDEN_PATTERNS = [
  /isims[^"]*\.(post|put|delete|patch)/i,
  /https?:\/\/[^\s"]*isims[^\s"]*/i,
  /axios\s*\.\s*(post|put|delete|patch)/i,
  /fetch\s*\(\s*['"][^'"]*isims/i,
];

describe('CTL-07 iSIMS import is read-only', () => {
  it('does not contain write-back code paths', () => {
    const path = resolve(__dirname, '..', '..', 'src', 'jobs', 'isims-import.ts');
    const src = readFileSync(path, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(src).not.toMatch(pattern);
    }
  });
});
