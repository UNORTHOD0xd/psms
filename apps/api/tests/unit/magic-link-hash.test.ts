import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';

import { hashToken } from '../../src/modules/auth/magic-link.js';

describe('magic-link hashToken (PRC-03, CTL-02)', () => {
  it('returns 64 hex chars (SHA-256)', () => {
    const raw = randomBytes(32).toString('base64url');
    const salt = randomBytes(16).toString('hex');
    const hash = hashToken(raw, salt);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same (raw, salt) pair', () => {
    const raw = 'token-value';
    const salt = 'salt-value';
    expect(hashToken(raw, salt)).toBe(hashToken(raw, salt));
  });

  it('changes when the salt changes', () => {
    const raw = 'token-value';
    expect(hashToken(raw, 'salt-a')).not.toBe(hashToken(raw, 'salt-b'));
  });

  it('changes when the token changes', () => {
    const salt = 'salt-value';
    expect(hashToken('token-a', salt)).not.toBe(hashToken('token-b', salt));
  });

  it('does not equal the raw token (sanity — hash != plaintext)', () => {
    const raw = randomBytes(32).toString('base64url');
    const salt = randomBytes(16).toString('hex');
    expect(hashToken(raw, salt)).not.toBe(raw);
  });
});
