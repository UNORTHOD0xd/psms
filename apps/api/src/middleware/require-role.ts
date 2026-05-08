// requireRole — runtime enforcement of OpenAPI x-required-role.
//
// CLAUDE.md (CTL-04): "every endpoint that returns or mutates user data
// declares its required role(s) in openapi.yaml via the x-required-role
// extension and enforces it in middleware. There is no implicit
// authorization."

import type { RequestHandler } from 'express';

import { roleSatisfies, type RoleGuard } from '@psms/shared';

import { Problems } from '../lib/problem.js';

export function requireRole(guard: RoleGuard): RequestHandler {
  return (req, _res, next) => {
    if (guard === 'PUBLIC') return next();
    if (!req.auth) return next(Problems.unauthorized());
    if (!roleSatisfies(req.auth.role, guard)) {
      return next(Problems.forbidden(`Requires ${guard}`));
    }
    next();
  };
}
