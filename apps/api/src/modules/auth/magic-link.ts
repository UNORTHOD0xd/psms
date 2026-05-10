// PRC-03 — magic-link tokens for external supervisors.
//
// Rules (CLAUDE.md, Architectural rules § Security):
//   - 32 bytes from crypto.randomBytes, base64url-encoded for the URL.
//   - Stored as SHA-256(salt || raw) with a per-token salt. Raw token is
//     never persisted.
//   - 24-hour TTL, single use, rate-limited to 3 active per supervisor.

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

import type { MagicLinkPurpose } from '@prisma/client';

import { loadEnv } from '../../lib/env.js';
import { prisma } from '../../lib/prisma.js';
import { Problems } from '../../lib/problem.js';

export interface IssuedMagicLink {
  token_id: string;
  raw_token: string; // ONLY exposed at issuance; embed in the email URL.
  expires_at: Date;
}

export interface IssueInput {
  supervisor_user_id: string;
  placement_id: string | null;
  purpose: MagicLinkPurpose;
  issued_by_user_id: string;
}

// 32 bytes → 43 base64url chars (no padding). URL-safe.
function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

function generateSalt(): string {
  return randomBytes(16).toString('hex'); // 32 hex chars
}

export function hashToken(rawToken: string, salt: string): string {
  return createHash('sha256').update(salt).update(rawToken).digest('hex');
}

export async function issueMagicLink(input: IssueInput): Promise<IssuedMagicLink> {
  const env = loadEnv();

  const activeCount = await prisma.magicLinkToken.count({
    where: {
      supervisor_user_id: input.supervisor_user_id,
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
  });
  if (activeCount >= env.MAGIC_LINK_MAX_ACTIVE_PER_SUPERVISOR) {
    throw Problems.tooMany(
      `Supervisor already has ${activeCount} active magic links (max ${env.MAGIC_LINK_MAX_ACTIVE_PER_SUPERVISOR})`,
    );
  }

  const raw_token = generateRawToken();
  const token_salt = generateSalt();
  const token_hash = hashToken(raw_token, token_salt);

  const expires_at = new Date(Date.now() + env.MAGIC_LINK_TTL_HOURS * 60 * 60 * 1000);

  const row = await prisma.magicLinkToken.create({
    data: {
      supervisor_user_id: input.supervisor_user_id,
      placement_id: input.placement_id,
      purpose: input.purpose,
      token_hash,
      token_salt,
      issued_by_user_id: input.issued_by_user_id,
      expires_at,
    },
  });

  return { token_id: row.token_id, raw_token, expires_at };
}

export interface ConsumedMagicLink {
  token_id: string;
  supervisor_user_id: string;
  placement_id: string | null;
  purpose: MagicLinkPurpose;
}

export async function consumeMagicLink(rawToken: string): Promise<ConsumedMagicLink> {
  // 32 random bytes base64url-encoded → 43 chars (no padding).
  if (!rawToken || rawToken.length !== 43) {
    throw Problems.unauthorized('Invalid token');
  }

  // We don't know which salt to use; fetch unconsumed unexpired candidates
  // and check each. In practice the candidate set is tiny (≤3 active per
  // supervisor × the active supervisor count), so this is fine.
  const candidates = await prisma.magicLinkToken.findMany({
    where: {
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
    take: 200,
  });

  const match = candidates.find((c) => {
    const expected = Buffer.from(hashToken(rawToken, c.token_salt), 'hex');
    const stored = Buffer.from(c.token_hash, 'hex');
    return expected.length === stored.length && timingSafeEqual(expected, stored);
  });
  if (!match) {
    throw Problems.gone('Token expired or already used');
  }

  // Atomic single-use enforcement: only mark if still unconsumed.
  const updated = await prisma.magicLinkToken.updateMany({
    where: { token_id: match.token_id, consumed_at: null },
    data: { consumed_at: new Date() },
  });
  if (updated.count !== 1) {
    throw Problems.gone('Token already used');
  }

  return {
    token_id: match.token_id,
    supervisor_user_id: match.supervisor_user_id,
    placement_id: match.placement_id,
    purpose: match.purpose,
  };
}

export function buildMagicLinkUrl(rawToken: string): string {
  const env = loadEnv();
  return `${env.PUBLIC_WEB_ORIGIN}/auth/magic?token=${encodeURIComponent(rawToken)}`;
}
