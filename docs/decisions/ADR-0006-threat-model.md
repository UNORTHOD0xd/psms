# ADR-0006 — Threat model (pre-pilot)

**Status:** Accepted
**Date:** 2026-05-07
**Supersedes:** none
**Implements:** PLAN.md § Phase 6 (Threat model), CTL-05 / CTL-06 / CTL-07 / CTL-09

## Context

PSMS goes into a single-college pilot with real student data, real
employer relationships, and a public certificate verification surface
that any third party can hit. Before the cohort lands we walk OWASP
Top-10 (2021) and a STRIDE pass on the three highest-risk flows: the
magic-link onboarding for external supervisors, the Ed25519
certificate-signing key, and the iSIMS CSV import path. This ADR
captures the analysis, the existing mitigations, and any residual
risk that on-call needs to be aware of.

## Scope

**In scope.** Web app at `psms.knox.edu.jm`, API at
`/api/v1`, Postgres data store, S3 object store for uploads, the iSIMS
nightly CSV drop, and the SendGrid email transport.

**Out of scope.** iSIMS itself (upstream system, owned by Knox
Registrar — we read only). Knox AD / SSO (we use email + password for
Knox roles in the pilot; SSO is a Phase 2 problem and gets its own
ADR). The student's own browser endpoint security.

## Method

For each focal flow:

1. Decompose to actors, data flows, trust boundaries.
2. Walk STRIDE — Spoofing, Tampering, Repudiation, Information
   disclosure, Denial of service, Elevation of privilege.
3. Reference the implemented mitigation by file or migration.
4. Note residual risk + the ticket / runbook that owns it.

OWASP Top-10 (2021) is treated as a checklist applied to the system as
a whole — every category has at least one mitigation that crosses
multiple flows.

---

## Flow 1 — Magic-link supervisor onboarding (PRC-03)

External supervisors never get a Knox account. The coordinator
approving an application triggers an email containing a single-use
link; clicking it sets a session-scoped cookie tied to that one
placement.

### Data flow (high-level)

```
Coordinator ──POST /applications/:id/decision (APPROVE)──▶ API
                                                            │
                              Notification + magic-link email
                                                            ▼
                                               Supervisor's inbox
                                                            │
                              GET /auth/magic?token=<raw>───▶ API
                                                            │
                                          Sets psms_session cookie
                                                            │
                                                  Supervisor app
```

### STRIDE

| Threat | Vector | Mitigation | Residual |
|---|---|---|---|
| **Spoofing** an issued link | Attacker forges a token | Tokens are 32 bytes from `crypto.randomBytes`; only the SHA-256 hash + per-token salt are stored (`apps/api/src/modules/auth/magic-link.ts`). Forgery requires breaking SHA-256. | None at pilot scale. |
| **Spoofing** a delivery | Attacker intercepts the email and consumes the link before the supervisor | TLS-only SMTP via SendGrid; SPF/DKIM published on `psms.knox.edu.jm`; link is single-use. | A coordinator with mailbox-level access to the supervisor *can* intercept — accepted; coordinators are vetted Knox staff. |
| **Tampering** with the token | Path traversal or signed-blob substitution | Token format is opaque; no metadata in the URL. | None. |
| **Repudiation** ("I never approved it") | Coordinator denies the approval that triggered the email | Audit log row written for `application.approve` (`writeAudit` middleware), capturing actor + IP + UA. Audit log is append-only (CTL-08, Postgres triggers). | None. |
| **Information disclosure** | A delivery webhook leaks the token | The token is never in webhook payloads. SendGrid only sees the SMTP envelope and message-id. | None. |
| **Denial of service** | Coordinator bulk-issues links to flood SendGrid | Rate limit per coordinator: `RATE_LIMIT_MAGICLINK_ISSUE_PER_HOUR` (default 20). Active-link cap of 3 per supervisor (PRC-03 § "active cap"). | A motivated coordinator can still hit the cap; an admin can review the audit log. |
| **Elevation of privilege** | Supervisor uses a magic link to access another placement | The session cookie set on consume binds to the placement_id encoded in the token row, not the supervisor user_id. Authorization middleware checks `placement_id ∈ allowed-set` before every supervisor-scoped endpoint. | None. |

### OWASP touchpoints

- **A01 Broken Access Control** — placement-scoped session, role gate
  via `x-required-role` (CTL-04 / ADR-0005).
- **A07 Identification and Authentication Failures** — single-use,
  TTL-bounded link, rate-limited issuance, hashed at rest.
- **A09 Security Logging and Monitoring** — audit-log row on every
  issue, consume, and revoke.

### Residual / accepted risk

- **Coordinator email compromise.** A coordinator's inbox is the same
  trust level as their account; if it falls, the attacker can issue
  links anyway. Mitigated by Knox SSO + 2FA on staff Google accounts;
  out of PSMS scope.

---

## Flow 2 — Certificate signing key (CTL-06, ADR-0004)

Every issued certificate is an Ed25519-signed PDF. The key lives in
the API container's environment, base64 in `CERT_SIGNING_KEY`. The
public key is published at `/api/v1/certificates/public-key` for any
third party to verify.

### Data flow

```
FINAL evaluation submit ──▶ certificates.service.ts
                                  │
                          Renders PDF (pdfkit)
                                  │
                          signing.sign(buffer, env.CERT_SIGNING_KEY)
                                  │
                          Stores signature + signature_hash on Certificate row
                                  │
                          Uploads PDF to S3 (psms-uploads/certificates/<id>.pdf)
```

### STRIDE

| Threat | Vector | Mitigation | Residual |
|---|---|---|---|
| **Spoofing** a forged certificate | Attacker generates their own PDF and serves it | Verification endpoint reads `signature_hash`, recomputes against the published public key. A forgery would require the private key. | None. |
| **Tampering** with an issued PDF | Attacker edits the PDF after issuance | `signature_hash` is the SHA-256 of the *signed* bytes; verification recomputes and compares. | None — the published `signature_hash` is on a row protected by audit-log triggers. |
| **Repudiation** | "Knox didn't issue this." | Public-key endpoint + verification endpoint published; `Certificate.signature` is also surfaced for offline verification with `openssl pkeyutl`. | None. |
| **Information disclosure** | Private key leak from prod env | Key is base64 in env, never logged (logger redacts `CERT_SIGNING_KEY` and SPI patterns), never written to disk. The runner image runs as a non-root user with no shell. | A container compromise still exposes env. Accepted; tracked as **risk RIS-02** in PLAN.md (planned: KMS-managed signing in Phase 2). |
| **Denial of service** | An attacker triggers many certificate generations | Generation only fires on FINAL evaluation submission, which requires a magic-link supervisor session bound to the placement. The natural rate cap is the rate of evaluations. | Negligible. |
| **Elevation of privilege** | Coordinator regenerates a certificate they didn't earn | `regenerate` is COORDINATOR_OR_ADMIN; audit row written; the regenerated row replaces the prior `signature` and the old PDF version is retained in S3 for 1 year. | None. |

### Key rotation

Rotation is procedural, not automatic. Steps:

1. Generate a new keypair on a hardened workstation (script in
   `scripts/ops/generate-cert-keys.sh`).
2. Roll the env (`CERT_SIGNING_KEY` + `CERT_PUBLIC_KEY`).
3. Old certificates remain verifiable: each row carries the
   `signature` and `signature_hash` it was signed with, and the public
   key in use at issuance is exposed via `/certificates/:id` →
   `signed_with_public_key`.
4. Publish the new public key on the verification page (already comes
   from the env, so step 2 covers it).

### OWASP touchpoints

- **A02 Cryptographic Failures** — Ed25519, key never touches disk in
  the runner stage, public key is exposed by design.
- **A08 Software and Data Integrity Failures** — signed artefact
  beats unsigned PDF + database row in every regression we considered.

---

## Flow 3 — iSIMS CSV import (CTL-07, PRC-01)

A nightly job reads a CSV from a host-mounted directory, validates each
row against a Zod schema, and upserts users + student profiles.
Invalid rows are quarantined.

### Data flow

```
iSIMS export job (upstream) ──▶ /var/lib/psms/isims-drop/<date>.csv
                                                   │
                                  read-only mount inside api container
                                                   ▼
                                  apps/api/src/jobs/isims-import.ts
                                                   │
                                  upsert User + StudentProfile
                                                   │
                                  invalid → ImportQuarantineRow
                                                   │
                                  audit log row + ImportRun row
```

### STRIDE

| Threat | Vector | Mitigation | Residual |
|---|---|---|---|
| **Spoofing** | Attacker drops a malicious CSV claiming to be from iSIMS | Mount is read-only from the perspective of the API, and the iSIMS job is the only producer. The directory is on a private volume reachable only by the iSIMS export user. | An attacker on the host can drop a file; mitigated by host hardening (out of PSMS scope) and by every imported row going to a Zod schema that rejects unknown columns. |
| **Tampering** with imported rows | Attacker edits user records via a forged CSV row | The job is upsert-only, never delete. Role assignment is constrained — STUDENT only; any row asking for SUPERVISOR / COORDINATOR / ADMINISTRATOR is quarantined. | A motivated attacker can still create student rows. Treated as a known limitation (logged in PLAN.md risks). |
| **Repudiation** | "We never ran an import that night." | Each run writes an `ImportRun` row + audit-log row with the `triggered_by_user_id` (NULL for cron). | None. |
| **Information disclosure** | The CSV contains PII; an attacker reads the file | CSV is on a 0640 host file owned by `psms-isims:psms`, mount is read-only into the API container. After import, the file is moved to `/var/lib/psms/isims-archive/` and gzipped. | None at pilot scale. |
| **Denial of service** | Attacker drops a 10 GB CSV | Job streams via `csv-parse` and stops at row N (current cap = 50,000); rows past that quarantine the rest of the file as `csv_too_large`. | Acceptable. |
| **Elevation of privilege** | Import writes an admin user | Schema rejects any role other than STUDENT; explicit `if (row.role && row.role !== 'STUDENT') quarantine(...)`. **Unit test guards this:** `apps/api/tests/unit/isims-import-readonly.test.ts` greps the module for any string suggesting iSIMS write traffic. | None. |

### OWASP touchpoints

- **A01 Broken Access Control** — strict role allow-list on import.
- **A03 Injection** — Zod parses every row; no string interpolation.
- **A05 Security Misconfiguration** — read-only mount + dedicated user.
- **A08 Software and Data Integrity Failures** — quarantine on
  validation failure; status = `PARTIAL` if any row failed; never
  silently dropped.
- **A09 Security Logging and Monitoring** — `ImportRun` + audit row +
  per-quarantined-row record with reason.

---

## Cross-cutting OWASP Top-10 (2021) coverage

| Category | Mitigation |
|---|---|
| **A01 Broken Access Control** | `x-required-role` on every operation (CTL-04 / ADR-0005); placement-scoped supervisor sessions; tests in `role-guard.test.ts`. |
| **A02 Cryptographic Failures** | argon2id for passwords (CTL-06); Ed25519 for certificates; HTTPS-only cookies; SHA-256 + salt for magic-link tokens. |
| **A03 Injection** | Zod parsing on every request body / CSV row; Prisma parameterised queries; `csvDocument()` escapes `,` and `"` (test in `zip.test.ts`). |
| **A04 Insecure Design** | Spec-first hierarchy (ADR-0001), idempotency middleware (CTL-09), audit-log immutability (CTL-08). |
| **A05 Security Misconfiguration** | Helmet middleware, env validation via Zod (refuses to start with missing required vars), non-root container user. |
| **A06 Vulnerable Components** | `pnpm audit` in the CI fast-lane (planned in `.github/workflows/ci.yml` follow-up); no transitive deps without an ADR. |
| **A07 Auth Failures** | Argon2id, password reset uses single-use tokens with 1h TTL, magic-link cap of 3 active per supervisor, sign-in rate-limited per IP. |
| **A08 Integrity Failures** | Ed25519-signed certificates; audit-log immutable; idempotency-key prevents replay corruption. |
| **A09 Logging & Monitoring** | request-id middleware (ULID per request); pino + redaction; AuditLog rows on every state-change. |
| **A10 SSRF** | API has no outbound HTTP except to SendGrid (allowlisted) and S3 (allowlisted); the verify endpoint takes a UUID, not a URL; the magic-link consume takes only a token, not a redirect URL. |

---

## Decision

We accept this threat model for the pilot. The residual risks listed
above are tracked individually in PLAN.md § 4 (Risks). Re-walk this
ADR if **any** of the following changes:

- A new flow that crosses a trust boundary not modelled here (e.g. a
  Knox SSO integration, a public REST surface beyond `/verify`).
- The certificate-signing key moves out of env (e.g. into KMS).
- The iSIMS import gains write traffic upstream (CTL-07 break — must
  be a separate ADR that supersedes this one).

## Consequences

**Positive.** A single document on-call can read at 02:00 to know what
the system was *designed to* defend against, what was punted, and
where the audit-log lookups and rate-limit knobs live.

**Negative.** Threat models age. We commit to re-walking this ADR at
the start of each phase (Phase 2, Phase 3) and at any RFC for an
externally-facing surface.

**Neutral.** This ADR does not introduce code changes — it captures
the analysis that supports the existing code.
