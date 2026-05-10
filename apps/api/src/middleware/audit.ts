// Audit-log writer (CTL-03). Every state-changing API call writes one entry.
//
// Usage from within a handler:
//
//   import { writeAudit } from '../../middleware/audit.js';
//   await writeAudit(req, {
//     action: 'application.approve',
//     resource_type: 'Application',
//     resource_id: applicationId,
//     before: prevSnapshot,
//     after: nextSnapshot,
//   });
//
// Audit entries are append-only — never updated, never deleted. The
// underlying table has no updated_at column for that reason.

import type { Request } from 'express';

import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

export interface AuditEntry {
  action: string;
  resource_type: string;
  resource_id?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(req: Request, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        request_id: String(req.id),
        actor_user_id: req.auth?.user_id ?? null,
        actor_role: req.auth?.role ?? null,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id ?? null,
        before: (entry.before ?? null) as never,
        after: (entry.after ?? null) as never,
        ip: req.ip ?? null,
        user_agent: req.header('user-agent')?.slice(0, 500) ?? null,
      },
    });
  } catch (err) {
    // Audit failure must not mask the original request outcome — but it
    // is a serious operational issue, so log loudly.
    logger.error({ err, action: entry.action }, 'audit-log write failed');
  }
}
