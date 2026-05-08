# Control Requirements (CTL-01 — CTL-10)

Security, audit, and integrity guarantees the system enforces. Each
control names what it guarantees, where it is enforced, how it is
verified (test or CI gate), and what failure looks like.

## CTL-01 — Password storage uses argon2id

**Guarantee.** All stored passwords are argon2id hashes. No password
is ever written to disk in plaintext, and no other algorithm
(bcrypt, scrypt, sha256, md5) appears in the codebase.

**Enforced by.**
- `apps/api/src/modules/auth/password.ts` — sole hashing module.
- Password write paths: sign-up (admin import), password reset
  (`/auth/password-reset/confirm`), forced reset, supervisor placeholder
  hash (never used because supervisors auth via magic link only).
- argon2 parameters tracked centrally; `needsRehash` re-hashes during
  successful sign-in if parameters have advanced.

**Verified by.**
- `apps/api/tests/unit/password.test.ts` — round-trips a known
  password and asserts the hash starts with `$argon2id$`.
- ESLint rule (planned): forbid `import 'bcrypt'`, `import 'crypto'`'s
  `pbkdf2` for password use, and string literals containing
  `sha256(`/`md5(` in `auth/`.

**Failure mode.** If `password.ts` is bypassed, the unit test still
catches stored hashes that don't begin with `$argon2id$`. CI fails.

---

## CTL-02 — Magic-link tokens stored as SHA-256 hash, never plaintext

**Guarantee.** The 32-byte raw token returned from
`issueMagicLink` is **never** persisted. Only `sha256(salt || raw)`
is stored, alongside the per-token salt.

**Enforced by.**
- `apps/api/src/modules/auth/magic-link.ts:hashToken`.
- The `magic_link_token` table has no column for the raw token.
- `consumeMagicLink` recomputes the hash and atomically marks the
  matched row consumed via `updateMany ... where consumed_at = null`,
  preventing double-spend.

**Verified by.**
- `apps/api/tests/unit/magic-link-hash.test.ts` — asserts the hash
  format and that two issuances of the same conceptual link produce
  different hashes (different salts).
- Code review: any change touching `magic_link_token` schema is
  flagged.

**Failure mode.** A leaked DB dump cannot be replayed against the
verification endpoint because the raw token is not present.

---

## CTL-03 — State-changing endpoints write audit-log entries

**Guarantee.** Every endpoint that mutates a `User`, `Application`,
`Placement`, `HoursLog`, `Evaluation`, `Organisation`, `Opportunity`,
`Certificate`, `MagicLinkToken`, or `SystemConfig` writes one
`audit_log` row including `request_id`, `actor_user_id`, `action`,
`resource_type`, `resource_id`, optional `before` / `after`, `ip`,
`user_agent`.

**Enforced by.**
- `apps/api/src/middleware/audit.ts:writeAudit` — sole writer.
- Handlers call `writeAudit(req, { ... })` after a successful mutation.

**Verified by.**
- Integration tests for each mutating endpoint assert
  `prisma.auditLog.findMany` returns the expected entry.
- A planned CI lint walks `apps/api/src/modules/**/*.ts` and asserts
  every `prisma.<table>.update|create|delete|upsert` is paired with a
  `writeAudit` call in the same handler. (Heuristic but cheap.)

**Failure mode.** Audit-log write failures do not mask the original
request outcome but log loudly (`audit-log write failed`,
`apps/api/src/middleware/audit.ts:49`).

---

## CTL-04 — RBAC enforced via OpenAPI `x-required-role`

**Guarantee.** Every operation in `apps/api/openapi.yaml` declares
its required role via `x-required-role`. Allowed values:
`PUBLIC`, `ANY_AUTHENTICATED`, `STUDENT`, `SUPERVISOR`,
`COORDINATOR`, `ADMINISTRATOR`, `COORDINATOR_OR_ADMIN`. Missing or
invalid values cause CI to fail.

**Enforced by.**
- `scripts/check-openapi-rbac.ts` runs in CI (`pnpm check:openapi-rbac`).
- `apps/api/src/middleware/require-role.ts` enforces the same set in
  application code; a handler without `requireRole(...)` would not
  attach to any route group.

**Verified by.**
- `apps/api/tests/unit/role-guard.test.ts` — exercises the matrix.

**Failure mode.** A new endpoint added to the spec without
`x-required-role` fails the spec lint and is rejected by CI.

---

## CTL-05 — PII never logged

**Guarantee.** The structured logger does not emit email addresses,
full names, phone numbers, CV URLs, motivation strings, evaluation
narratives, or notification body parameters in plain text. User IDs,
request IDs, and resource IDs are logged.

**Enforced by.**
- `apps/api/src/lib/logger.ts` — pino with redaction paths set for
  `req.body.email`, `req.body.password`, `req.body.full_name`,
  `req.body.phone`, `req.body.cv_url`, `req.body.motivation`,
  `req.body.narrative`, `body_params`, plus the same paths under
  `res.body.*` for any handler echoing the input.
- Audit log fields are stored in DB; they are not subject to log
  redaction (different surface), but exports are admin-only and
  audited (CTL-08, OUT-09).

**Verified by.**
- A planned unit test runs known-PII through `logger.info` and
  asserts the rendered output contains `[Redacted]` (pino's default
  redaction marker).

**Failure mode.** A handler that logs `req.body` directly would
defeat redaction; the logger config uses path-based redaction so
emails inside other paths can leak. Code review requires any new log
line touching user input to use the request id and not the payload.

---

## CTL-06 — Certificates signed with Ed25519; private key from env only

**Guarantee.** Completion certificates are signed with an Ed25519
key sourced from `CERT_SIGNING_KEY` (base64 PEM PKCS8). The
corresponding public key (`CERT_PUBLIC_KEY`) is published at
`GET /certificates/public-key` for offline verification by third
parties.

**Enforced by.**
- `apps/api/src/modules/certificates/signing.ts` (forthcoming) — sole
  signing module.
- `.gitignore` excludes `.env`, `.env.local`. `.env.example` declares
  the keys but contains empty values.

**Verified by.**
- Integration test: generate, fetch, verify locally with the public
  key, assert match. Then mutate one byte of the PDF and assert
  verification fails.

**Failure mode.** If the signing key is ever committed, treat it as
compromised: rotate the key (new pair, update env), regenerate all
non-revoked certificates, and document in an incident runbook.

---

## CTL-07 — iSIMS import is read-only

**Guarantee.** The PRC-01 import job reads a CSV drop and writes
into the PSMS database only. It does **not** open a connection to
iSIMS, post webhooks back, or expose any endpoint that accepts
iSIMS-bound data.

**Enforced by.**
- `apps/api/src/jobs/isims-import.ts` (forthcoming) module never
  imports an HTTP client targeting iSIMS.
- A grep-walking unit test asserts the module text does not contain
  any of: `iSIMS.write`, `isims.put`, `isims.post`, `axios.post`
  with an iSIMS hostname.

**Verified by.**
- The grep test described above.
- Code review: any future iSIMS integration that needs write
  capability requires an ADR superseding this control.

**Failure mode.** A back-write to iSIMS would corrupt the SoR
record. The code-level guard plus review process catches this; an
infrastructure-level network policy (egress allowlist) is the
production safety net.

---

## CTL-08 — Soft delete on user-facing records; audit log append-only

**Guarantee.** No row in `application`, `placement`, `hours_log`,
`organisation`, `opportunity`, `evaluation`, `certificate`, or
`user` is hard-deleted via `DELETE`. Status enums encode "deleted"
states (`WITHDRAWN`, `TERMINATED`, etc.). Audit entries are never
updated or deleted.

**Enforced by.**
- Handlers use `prisma.update` to flip status; no `prisma.delete`
  call exists in `apps/api/src/modules/`.
- A new Prisma migration adds a Postgres rule preventing
  `UPDATE`/`DELETE` on `audit_log`.
- FK rules use `ON DELETE RESTRICT` so a parent cannot be hard-deleted
  if children exist.

**Verified by.**
- A planned unit test greps `apps/api/src/modules/` for
  `prisma.<x>.delete` and fails CI on a hit.
- An integration test attempts an `UPDATE` on `audit_log` via raw
  SQL and asserts a Postgres error.

**Failure mode.** A hard delete in code would slip past the lint;
the DB-level rule on `audit_log` is the floor.

---

## CTL-09 — Idempotency-Key honoured on resource-creating endpoints

**Guarantee.** A POST that creates a resource may carry an
`Idempotency-Key` header (UUID v4). The middleware looks up the
key in `idempotency_key`; if it exists with the same request hash,
the prior response is replayed; if the request hash differs, the
response is `409 Conflict`. Records are retained 24 hours.

**Enforced by.**
- `apps/api/src/middleware/idempotency.ts` (forthcoming) — wired on
  `POST /applications`, `POST /placements/:id/hours`,
  `POST /imports/isims/trigger`, `POST /reports/accreditation-pack`.
- The OpenAPI spec marks these endpoints with the
  `idempotencyKeyHeader` parameter.

**Verified by.**
- Unit + integration tests cover: missing key (no-op), reuse with
  same hash (replay), reuse with different hash (409), expired key
  (treated as new).

**Failure mode.** A retry storm without the key would create
duplicates; the unique constraints catch the most common ones
(`uq_student_opportunity` on `application`, `uq_placement_week_date`
on `hours_log`).

---

## CTL-10 — Session cookies HttpOnly, Secure, SameSite=Lax

**Guarantee.** The session cookie set by `POST /auth/sign-in` and
`POST /auth/magic-link/consume` carries `HttpOnly`, `Secure`,
`SameSite=Lax`, and an explicit `Path=/`. Cookie value is a
random 32-byte base64url string; the SHA-256 hash is the only thing
stored in `session.cookie_hash`.

**Enforced by.**
- `apps/api/src/modules/auth/session.ts:setSessionCookie`. Single
  writer — no other code path mints session cookies.
- A unit test asserts the response `Set-Cookie` header includes
  `HttpOnly`, `Secure`, `SameSite=Lax`.

**Verified by.**
- The unit test described above.
- An integration test asserts that on sign-out and on password
  reset, all sessions for the user are revoked
  (`session.revoked_at` set).

**Failure mode.** A misconfigured cookie (Secure dropped in dev,
say) would be flagged by the unit test. In production, the API is
served behind TLS-terminating ingress; `Secure` is mandatory there.

---

## Cross-cutting

**Test gate.** All ten controls above are verified in CI:
`pnpm test`, `pnpm check:openapi-rbac`, plus the planned
spec-lint and grep-lint scripts. A failing CTL test blocks merge.

**Adding a new control.** New CTL-NN requirements may be added; do
not renumber existing ones. Supersession is recorded by an ADR
referencing the old ID.

**Removing a control.** Removal requires (a) the ADR explaining why
the guarantee is no longer required, and (b) deletion of the
corresponding test only after the ADR merges.
