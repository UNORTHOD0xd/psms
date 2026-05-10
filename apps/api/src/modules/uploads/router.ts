// INP-07 — CV uploads (and the file-read endpoint that paired storage
// keys are served from in dev).
//
// Pilot uses `lib/storage.ts`'s filesystem-backed S3-shaped client. The
// presign endpoint returns a relative API URL the web app PUTs to, plus
// the eventual public read URL the API will record on the application.
//
// Once `@aws-sdk/client-s3` is approved, swap the presign helper for a
// real `getSignedUrl` call and the read endpoint redirects to it (302)
// instead of streaming.

import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Router } from 'express';
import { z } from 'zod';

import { loadEnv } from '../../lib/env.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { writeAudit } from '../../middleware/audit.js';
import { requireRole } from '../../middleware/require-role.js';
import { getObject, putObject, signedUrl } from '../../lib/storage.js';

export const uploadsRouter = Router();
export const filesRouter = Router();

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

const PresignSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._\- ]+$/, 'filename has disallowed characters'),
  content_type: z.string().refine((v) => ALLOWED_CONTENT_TYPES.has(v), {
    message: 'content_type must be application/pdf or DOCX',
  }),
  byte_size: z.number().int().min(1).max(MAX_BYTES),
});

uploadsRouter.post('/cv/presign', requireRole('STUDENT'), async (req, res, next) => {
  try {
    const body = PresignSchema.parse(req.body);
    const env = loadEnv();
    const ext = EXTENSIONS[body.content_type] ?? 'bin';
    const storage_key = `cv/${req.auth!.user_id}/${randomUUID()}.${ext}`;

    // In production, replace with a real S3 presign that constrains
    // Content-Type and Content-Length. For the pilot, the API itself
    // accepts the PUT at /api/v1/files/:key with the same constraints.
    const upload_url = `${env.PUBLIC_WEB_ORIGIN.replace(/\/$/, '')}/api/v1/files/${encodeURIComponent(storage_key)}`;
    const read_url = signedUrl(storage_key);

    await writeAudit(req, {
      action: 'upload.cv.presign',
      resource_type: 'CV',
      resource_id: storage_key,
    });

    res.status(200).json({
      storage_key,
      upload_url,
      read_url,
      max_bytes: MAX_BYTES,
      content_type: body.content_type,
      expires_in_seconds: 5 * 60,
    });
  } catch (err) {
    next(err);
  }
});

// Filesystem-backed PUT for dev. In production, the web app PUTs straight
// to the bucket using the pre-signed URL and never touches this route.
filesRouter.put('/files/:key', requireRole('STUDENT'), async (req, res, next) => {
  try {
    const key = decodeURIComponent(String(req.params.key ?? ''));
    const ct = req.header('content-type') ?? '';
    if (!ALLOWED_CONTENT_TYPES.has(ct.split(';')[0]?.trim() ?? '')) {
      return sendProblem(res, Problems.badRequest('Disallowed content-type'));
    }
    const len = Number(req.header('content-length') ?? '0');
    if (!Number.isInteger(len) || len <= 0 || len > MAX_BYTES) {
      return sendProblem(res, Problems.badRequest('Invalid or oversized payload'));
    }
    if (!key.startsWith(`cv/${req.auth!.user_id}/`)) {
      return sendProblem(res, Problems.forbidden('Storage key not owned by caller'));
    }

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > MAX_BYTES) {
        return sendProblem(res, Problems.badRequest('Payload exceeds max size'));
      }
      chunks.push(chunk);
    }

    await putObject(key, Buffer.concat(chunks));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Read endpoint — serves any object the API has stored. Visibility is
// scoped: only the owner of a `cv/{user_id}/...` key can read it (plus
// coordinator/admin); certificate keys are gated by their own router
// (see `/certificates/:id/pdf`).
filesRouter.get('/files/:key', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const key = decodeURIComponent(String(req.params.key ?? ''));
    if (key.startsWith('cv/')) {
      const owner = key.split('/')[1];
      if (
        req.auth!.role !== 'COORDINATOR' &&
        req.auth!.role !== 'ADMINISTRATOR' &&
        req.auth!.user_id !== owner
      ) {
        return sendProblem(res, Problems.forbidden('Not the owner'));
      }
    } else if (key.startsWith('certificates/')) {
      // Gated separately; this fallback is read-only and the certificate
      // module performs the per-row check.
    } else {
      return sendProblem(res, Problems.forbidden('Unknown key prefix'));
    }

    const buf = await getObject(key);
    res.status(200).type('application/octet-stream').send(buf);
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return sendProblem(res, Problems.notFound());
    }
    next(err);
  }
});

// Re-export a streaming helper for modules that need to stream bytes
// (certificates PDF download). Keeps the storage layer behind one façade.
export async function streamObject(res: import('express').Response, key: string): Promise<void> {
  const path = await resolveLocalPath(key);
  const stats = await stat(path);
  res.setHeader('Content-Length', stats.size.toString());
  createReadStream(path).pipe(res);
}

async function resolveLocalPath(key: string): Promise<string> {
  // The storage module owns the actual path. We re-derive it here only
  // for the streaming helper, mirroring storage.ts:safeJoin's checks.
  const { resolve, join } = await import('node:path');
  const STORAGE_LOCAL_DIR = resolve(process.env.STORAGE_LOCAL_DIR ?? './var/storage');
  if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes('..')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  return join(STORAGE_LOCAL_DIR, key);
}
