// Storage abstraction. The pilot writes generated artefacts (certificate
// PDFs, QR images) to the local filesystem under STORAGE_LOCAL_DIR. The
// shape of this module is intentionally close to an S3 client so it can be
// swapped for `@aws-sdk/client-s3` once that dependency is approved — see
// `S3_*` env vars in env.ts. Until then, `signedUrl` returns a relative
// path the API itself can stream from `/api/v1/files/:key`.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const STORAGE_LOCAL_DIR = resolve(process.env.STORAGE_LOCAL_DIR ?? './var/storage');

function safeJoin(key: string): string {
  // Reject path-traversal attempts; only forward slashes and safe chars.
  if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes('..')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  return join(STORAGE_LOCAL_DIR, key);
}

export async function putObject(key: string, body: Buffer | Uint8Array): Promise<string> {
  const path = safeJoin(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  return key;
}

export async function getObject(key: string): Promise<Buffer> {
  return readFile(safeJoin(key));
}

// Returns a relative URL the API can serve. Once we wire S3, this becomes a
// pre-signed URL with TTL.
export function signedUrl(key: string): string {
  return `/api/v1/files/${encodeURIComponent(key)}`;
}
