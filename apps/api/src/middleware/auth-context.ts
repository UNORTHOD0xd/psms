// Resolves the current actor (Knox session OR magic-link token) and attaches
// it to req. Does NOT enforce — that's requireRole's job. This middleware
// runs on every /api/v1 request.

import type { RequestHandler } from 'express';

import type { Role } from '@prisma/client';

import { loadEnv } from '../lib/env.js';
import { lookupSession } from '../modules/auth/session.js';

export interface AuthContext {
  user_id: string;
  role: Role;
  scope_placement_id: string | null;
  via: 'session' | 'magic-link';
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export function authContext(): RequestHandler {
  return async (req, _res, next) => {
    try {
      const env = loadEnv();
      const cookie = req.cookies?.[env.SESSION_COOKIE_NAME];
      if (typeof cookie === 'string' && cookie.length > 0) {
        const session = await lookupSession(cookie);
        if (session) {
          req.auth = {
            user_id: session.user_id,
            role: session.role,
            scope_placement_id: session.scope_placement_id,
            via: session.scope_placement_id ? 'magic-link' : 'session',
          };
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
