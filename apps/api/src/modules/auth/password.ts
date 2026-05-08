// Password hashing — argon2id only (per CLAUDE.md CTL-01).
//
// All hashing and verification flows through this file. No other code in the
// repo is permitted to call argon2 directly. If you find yourself wanting to,
// add a function here instead.

import * as argon2 from 'argon2';

// OWASP-recommended argon2id parameters as of 2024:
//   memory:   46 MiB  (memoryCost = 47104 KiB)
//   time:     1
//   parallel: 1
// These can be tuned in production via env (CTL-01 audit hook), but the
// defaults are fine for the pilot's traffic profile.
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 47104,
  timeCost: 1,
  parallelism: 1,
};

export async function hashPassword(plaintext: string): Promise<string> {
  if (typeof plaintext !== 'string' || plaintext.length < 12) {
    throw new Error('Password must be at least 12 characters');
  }
  return argon2.hash(plaintext, OPTIONS);
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    // Malformed hash — treat as failed verification rather than a 500.
    return false;
  }
}

// Returns true if the stored hash was produced with weaker parameters than
// the current OPTIONS. Callers should re-hash on next successful sign-in.
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, OPTIONS);
}
