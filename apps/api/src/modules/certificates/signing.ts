// CTL-06 + ADR-0004 — Ed25519 signing for completion certificates.
//
// Keys are loaded from environment variables only (CERT_SIGNING_KEY,
// CERT_PUBLIC_KEY). The values may be:
//   - a base64-encoded PEM block (single line, no header), OR
//   - a PEM block with `-----BEGIN`/`-----END` markers verbatim.
// Either form is accepted; we normalise on load.

import { createHash, createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify, type KeyObject } from 'node:crypto';

import { loadEnv } from '../../lib/env.js';

let cachedPrivateKey: KeyObject | null = null;
let cachedPublicKey: KeyObject | null = null;

function decodePem(value: string, header: string): string {
  if (value.includes('-----BEGIN')) return value;
  // Treat as base64 of the PEM block.
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  if (decoded.includes('-----BEGIN')) return decoded;
  throw new Error(`CERT_*_KEY does not look like a ${header} key`);
}

function loadPrivateKey(): KeyObject {
  if (cachedPrivateKey) return cachedPrivateKey;
  const env = loadEnv();
  if (!env.CERT_SIGNING_KEY) {
    throw new Error('CERT_SIGNING_KEY is not set');
  }
  cachedPrivateKey = createPrivateKey(decodePem(env.CERT_SIGNING_KEY, 'PRIVATE'));
  return cachedPrivateKey;
}

function loadPublicKey(): KeyObject {
  if (cachedPublicKey) return cachedPublicKey;
  const env = loadEnv();
  if (!env.CERT_PUBLIC_KEY) {
    throw new Error('CERT_PUBLIC_KEY is not set');
  }
  cachedPublicKey = createPublicKey(decodePem(env.CERT_PUBLIC_KEY, 'PUBLIC'));
  return cachedPublicKey;
}

export function resetKeyCacheForTesting(): void {
  cachedPrivateKey = null;
  cachedPublicKey = null;
}

export function signatureHash(pdfBytes: Buffer): string {
  return createHash('sha256').update(pdfBytes).digest('hex');
}

export interface SignResult {
  signature_hash: string; // hex SHA-256 of the PDF bytes
  signature: string; // base64 Ed25519 signature over the hash
}

// We sign the SHA-256 of the PDF rather than the PDF itself so the
// signature length stays bounded. Verifiers recompute the hash and verify
// the 64-byte Ed25519 signature against it.
export function signPdf(pdfBytes: Buffer): SignResult {
  const hash = signatureHash(pdfBytes);
  const sig = nodeSign(null, Buffer.from(hash, 'hex'), loadPrivateKey());
  return { signature_hash: hash, signature: sig.toString('base64') };
}

export function verifyPdf(pdfBytes: Buffer, signatureBase64: string): boolean {
  try {
    const hash = signatureHash(pdfBytes);
    return nodeVerify(
      null,
      Buffer.from(hash, 'hex'),
      loadPublicKey(),
      Buffer.from(signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}

export function publicKeyPem(): string {
  return loadPublicKey().export({ type: 'spki', format: 'pem' }) as string;
}

export function publicKeyJwk(): import('node:crypto').JsonWebKey {
  return loadPublicKey().export({ format: 'jwk' });
}
