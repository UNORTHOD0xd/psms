// CTL-06 + ADR-0004 — Ed25519 certificate signing roundtrip.
//
// Generate a fresh Ed25519 keypair in-memory, point the env at it,
// sign a synthetic PDF, and assert verifyPdf returns true. Then mutate
// a single byte of the PDF and assert verification fails. This proves
// (a) we can produce a verifiable signature, (b) the signature is over
// the actual PDF bytes, not a placeholder.

import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it, beforeAll } from 'vitest';

import { resetEnvCacheForTesting } from '../../src/lib/env.js';
import {
  publicKeyJwk,
  publicKeyPem,
  resetKeyCacheForTesting,
  signPdf,
  verifyPdf,
} from '../../src/modules/certificates/signing.js';

describe('certificate signing (CTL-06)', () => {
  beforeAll(() => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgres://localhost/psms';
    process.env.SESSION_SECRET = 'x'.repeat(32);
    process.env.CERT_SIGNING_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    process.env.CERT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    resetEnvCacheForTesting();
    resetKeyCacheForTesting();
  });

  it('signPdf produces a verifiable signature over the PDF bytes', () => {
    const pdf = Buffer.from('%PDF-1.4 ... fake content ... %%EOF');
    const { signature, signature_hash } = signPdf(pdf);

    expect(signature).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(signature_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyPdf(pdf, signature)).toBe(true);
  });

  it('mutating a single byte of the PDF invalidates the signature', () => {
    const pdf = Buffer.from('%PDF-1.4 deterministic body for hashing %%EOF');
    const { signature } = signPdf(pdf);

    const tampered = Buffer.from(pdf);
    tampered[10] = (tampered[10]! ^ 0xff) & 0xff;

    expect(verifyPdf(tampered, signature)).toBe(false);
  });

  it('produces different signatures from different PDF bodies', () => {
    const a = signPdf(Buffer.from('payload A'));
    const b = signPdf(Buffer.from('payload B'));
    expect(a.signature_hash).not.toBe(b.signature_hash);
    // Ed25519 itself is deterministic, so signatures over different
    // hashes must differ as well.
    expect(a.signature).not.toBe(b.signature);
  });

  it('verifyPdf returns false for a malformed signature instead of throwing', () => {
    const pdf = Buffer.from('any');
    expect(verifyPdf(pdf, 'not-base64-!!!')).toBe(false);
    expect(verifyPdf(pdf, '')).toBe(false);
  });

  it('exposes the public key in PEM and JWK form', () => {
    expect(publicKeyPem()).toContain('-----BEGIN PUBLIC KEY-----');
    const jwk = publicKeyJwk();
    expect(jwk.kty).toBe('OKP');
    expect(jwk.crv).toBe('Ed25519');
    expect(typeof jwk.x).toBe('string');
  });
});
