import { describe, expect, it } from 'vitest';

import { roleSatisfies } from '@psms/shared';

describe('roleSatisfies (CTL-04)', () => {
  it('PUBLIC accepts everyone, including unauthenticated', () => {
    expect(roleSatisfies(null, 'PUBLIC')).toBe(true);
    expect(roleSatisfies('STUDENT', 'PUBLIC')).toBe(true);
    expect(roleSatisfies('SUPERVISOR', 'PUBLIC')).toBe(true);
  });

  it('ANY_AUTHENTICATED accepts any role but not unauthenticated', () => {
    expect(roleSatisfies(null, 'ANY_AUTHENTICATED')).toBe(false);
    expect(roleSatisfies('STUDENT', 'ANY_AUTHENTICATED')).toBe(true);
    expect(roleSatisfies('ADMINISTRATOR', 'ANY_AUTHENTICATED')).toBe(true);
  });

  it('exact-role guards match only that role', () => {
    expect(roleSatisfies('STUDENT', 'STUDENT')).toBe(true);
    expect(roleSatisfies('SUPERVISOR', 'STUDENT')).toBe(false);
    expect(roleSatisfies('COORDINATOR', 'STUDENT')).toBe(false);
    expect(roleSatisfies(null, 'STUDENT')).toBe(false);
  });

  it('COORDINATOR_OR_ADMIN matches both', () => {
    expect(roleSatisfies('COORDINATOR', 'COORDINATOR_OR_ADMIN')).toBe(true);
    expect(roleSatisfies('ADMINISTRATOR', 'COORDINATOR_OR_ADMIN')).toBe(true);
    expect(roleSatisfies('STUDENT', 'COORDINATOR_OR_ADMIN')).toBe(false);
    expect(roleSatisfies('SUPERVISOR', 'COORDINATOR_OR_ADMIN')).toBe(false);
    expect(roleSatisfies(null, 'COORDINATOR_OR_ADMIN')).toBe(false);
  });
});
