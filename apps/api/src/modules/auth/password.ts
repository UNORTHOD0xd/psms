// Password hashing — argon2id only (per CLAUDE.md CTL-01).
//
// All hashing and verification flows through this file. No other code in the
// repo is permitted to call argon2 directly. If you find yourself wanting to,
// add a function here instead.

import * as argon2 from 'argon2';

// argon2id parameters. OWASP's 2024 cheat-sheet floor for argon2id is
//   memory:   46 MiB (47104 KiB)
//   time:     1
//   parallel: 1
// The npm `argon2` package, however, asserts timeCost >= 2 (see the
// `Invalid timeCost` error it throws). We bump time to 2 to satisfy
// the library; that's still well within OWASP guidance.
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 47104,
  timeCost: 2,
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
