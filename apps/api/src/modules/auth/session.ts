// Session management — DB-backed. The cookie value is a 32-byte URL-safe
// random string; the DB stores SHA-256(value). Raw cookie is never persisted.

import { randomBytes, createHash } from 'node:crypto';
import type { Response } from 'express';

import type { Role } from '@prisma/client';

import { loadEnv } from '../../lib/env.js';
import { prisma } from '../../lib/prisma.js';

export interface SessionRecord {
  session_id: string;
  user_id: string;
  role: Role;
  scope_placement_id: string | null;
  expires_at: Date;
}

function generateCookieValue(): string {
  return randomBytes(32).toString('base64url');
}

function hashCookie(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface CreateSessionInput {
  user_id: string;
  scope_placement_id?: string | null;
  ip?: string;
  user_agent?: string;
}

export async function createSession(input: CreateSessionInput): Promise<{
  raw_cookie: string;
  expires_at: Date;
  session_id: string;
}> {
  const env = loadEnv();
  const raw_cookie = generateCookieValue();
  const cookie_hash = hashCookie(raw_cookie);
  const expires_at = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

  const row = await prisma.session.create({
    data: {
      user_id: input.user_id,
      cookie_hash,
      scope_placement_id: input.scope_placement_id ?? null,
      expires_at,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
    },
  });

  return { raw_cookie, expires_at, session_id: row.session_id };
}

export async function lookupSession(rawCookie: string): Promise<SessionRecord | null> {
  if (!rawCookie) return null;
  const cookie_hash = hashCookie(rawCookie);
  const session = await prisma.session.findUnique({
    where: { cookie_hash },
    include: { user: { select: { user_id: true, role: true, is_active: true } } },
  });
  if (!session) return null;
  if (session.revoked_at) return null;
  if (session.expires_at <= new Date()) return null;
  if (!session.user.is_active) return null;

  return {
    session_id: session.session_id,
    user_id: session.user_id,
    role: session.user.role,
    scope_placement_id: session.scope_placement_id,
    expires_at: session.expires_at,
  };
}

export async function revokeSession(rawCookie: string): Promise<void> {
  if (!rawCookie) return;
  const cookie_hash = hashCookie(rawCookie);
  await prisma.session.updateMany({
    where: { cookie_hash, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

export function setSessionCookie(res: Response, raw: string, expires_at: Date): void {
  const env = loadEnv();
  res.cookie(env.SESSION_COOKIE_NAME, raw, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expires_at,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  const env = loadEnv();
  res.clearCookie(env.SESSION_COOKIE_NAME, { path: '/' });
}
