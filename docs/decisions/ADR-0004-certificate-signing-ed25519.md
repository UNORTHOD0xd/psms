# ADR-0004 — Certificate signing with Ed25519

**Status:** Accepted
**Date:** 2026-05-03
**Supersedes:** none
**Implements:** PRC-06, CTL-06, OUT-04, OUT-08

## Context

Completion certificates are the primary deliverable a student carries
out of the system to a future employer or accreditation reviewer. We
need cryptographic assurance that a presented PDF was issued by Knox
and has not been tampered with. The verifier may be an external party
who only has access to:
- The certificate PDF (downloaded by the student).
- The PSMS public verification page (`OUT-08`).
- The published public key (`GET /certificates/public-key`).

## Decision

- **Algorithm.** Ed25519 signatures over the SHA-256 of the PDF
  bytes. Modern, fast, no parameter choices, fixed 64-byte signature.
- **Storage.** Both the PDF and the signature live in object storage
  (or local FS in dev). The `Certificate` row stores
  `signature_hash` (hex SHA-256), `signature` (base64), the storage
  key, and revocation metadata.
- **Key material.** Sourced from environment variables only:
  - `CERT_SIGNING_KEY` — base64-encoded PEM PKCS8 private key.
  - `CERT_PUBLIC_KEY` — base64-encoded SPKI public key.
  Never written to disk by application code; never logged; not
  committed to the repo (the keys are blank in `.env.example`).
- **Public-key endpoint.** `GET /certificates/public-key` returns the
  active public key in PEM and JWK form. PUBLIC, cacheable for 1 hour.
- **Revocation.** A flag on `Certificate` (`revoked = true`) plus
  metadata (`revoked_at`, `revoked_by_user_id`, `revoked_reason`).
  The signature itself remains valid; revocation is metadata exposed
  by the verification endpoint.
- **Rotation.** When a key is rotated, all previously-issued
  certificates remain verifiable using the public key embedded in
  their (immutable) verify response. New certificates use the new
  key. The endpoint returns the **active** public key; verifiers
  presented with an older certificate may need to fall back to a
  historical key list (added when the first rotation happens).

## Why Ed25519 over RSA / ECDSA-P256

- **Smaller signatures (64 bytes vs ≥ 256 bytes for RSA-2048).**
  Easier to embed in QR-code-adjacent contexts and small responses.
- **No malleability concerns.** Ed25519 is deterministic; ECDSA
  requires a per-signature random and is malleability-prone.
- **Standardised in Node 16+** via `crypto.sign('Ed25519', ...)`. No
  third-party dep needed.
- **Future-proof.** Resistant to algorithm-confusion attacks; small
  surface area.

## Consequences

- **External verification is straightforward.** A reviewer can take
  the public key, the PDF, and the signature, and verify offline
  using OpenSSL or any standard library. The verify page documents
  this.
- **Key compromise is recoverable.** Rotating to a new key
  invalidates new issuance only; old certificates remain
  cryptographically valid. If a compromise requires invalidating
  past issuance, we use the revocation flag — not a key rotation.
- **No HSM in the pilot.** The key sits in an environment variable
  loaded by the API process. Acceptable for a single-college pilot;
  Phase-2 scope to migrate to a managed KMS once accreditation
  scrutiny demands it. Documented as a known accepted risk.

## Alternatives considered

- **RSA-2048 / RSA-4096.** Rejected: bigger signatures, slower,
  larger key files, no real benefit at our scale.
- **ECDSA P-256.** Rejected: deterministic Ed25519 avoids RNG
  pitfalls and gives smaller signatures.
- **Detached JWS over the PDF.** Considered for interop, but the
  envelope adds complexity (header + payload + signature) for no
  win — verifiers still need both the PDF and a separate
  signature, so we do exactly that.
- **No cryptographic signing (DB row authoritative).** Rejected:
  external verifiers can't reach the DB; the public verify page
  alone is not strong evidence to a sceptical reviewer.

## Verification

- Unit test: round-trip `sign(verify(buf)) === true`; mutate one
  byte of `buf` → verify returns `false`.
- Integration test: full PRC-06 flow — generate certificate,
  fetch PDF, hit verify endpoint, assert `valid: true`. Then
  manually replace the storage object with one byte different and
  assert `valid: false`.
- CI lint: `apps/api/src/modules/certificates/signing.ts` is the
  only file allowed to import `crypto.sign` / `crypto.verify` with
  the Ed25519 algorithm.
