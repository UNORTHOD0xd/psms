import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword, needsRehash } from '../../src/modules/auth/password.js';

describe('password (CTL-01)', () => {
  it('hashes look like an argon2id PHC string', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('hashes are not deterministic (per-hash salt)', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    expect(a).not.toBe(b);
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'incorrect horse battery staple')).toBe(false);
  });

  it('rejects when the stored hash is empty', async () => {
    expect(await verifyPassword('', 'anything-at-all-12chars')).toBe(false);
  });

  it('rejects when the stored hash is malformed (does not throw)', async () => {
    expect(await verifyPassword('not-a-real-hash', 'anything-at-all-12chars')).toBe(false);
  });

  it('refuses to hash passwords shorter than 12 characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 12/);
  });

  it('needsRehash returns false for a freshly produced hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(needsRehash(hash)).toBe(false);
  });
});
