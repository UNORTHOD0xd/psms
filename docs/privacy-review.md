# Privacy Review — Pre-Pilot

> Reviewer: PSMS engineering, on behalf of Knox HoD (ICT).
> Date: 2026-05-07.
> Scope: every PII surface declared in `docs/specs/inputs.md` and
> `docs/specs/processing.md`. Cross-referenced against
> `apps/api/src/lib/logger.ts` redactions and `audit_log` row shape.
> Reference requirement: **CTL-05**.

## What this document is

A walk of every place PII enters PSMS, where it goes, and how it is
prevented from ending up in a log line, an audit row, or a backup that
isn't encrypted at rest. This is a control review, not a GDPR
compliance audit — Jamaica's Data Protection Act 2020 is the legal
frame; we follow it but the canonical reading lives with Knox Legal.

## PII inventory

The following fields are PII for the purpose of CTL-05 and must never
appear in plain text in `logger.*` output, `console.*`, or any
non-audit log surface.

| Field | Source | Sink | Logger redacted? |
|---|---|---|---|
| `User.email` | Sign-in, magic-link issue, admin user list | DB (hashed sibling `email_lower`), email transport | ✅ |
| `User.email_lower` | Derived from email at upsert | DB (indexed for case-insensitive lookup) | ✅ |
| `User.full_name` | iSIMS import, manual creation | DB, certificate PDF, transcript PDF | ✅ |
| `User.phone` | Optional, manual entry | DB | ✅ |
| `User.password_hash` | Argon2id at sign-up / reset | DB only | ✅ |
| `StudentProfile.cv_url` | INP-07 pre-sign upload | DB, application detail | ✅ |
| `Application.motivation` | INP-04 student narrative | DB, coordinator review screen | ✅ |
| `Application.decline_reason` | INP-04 coordinator decision | DB, student application detail | ✅ (via `*.body` wildcard on notifications) |
| `Evaluation.narrative` | INP-06 supervisor input | DB, transcript PDF | ✅ |
| `HoursLog.activity_narrative` | INP-05 student input | DB, supervisor inbox | ✅ |
| `SiteVisitNote.narrative` | INP-08 coordinator input | DB | ✅ (`*.narrative`) |
| `MagicLinkToken.token_hash` | PRC-03 issue | DB | ✅ (`*.token`, `*.raw_token`) |
| `MagicLinkToken.<raw>` (in URL only) | PRC-03 issue | Email body, URL bar | Never persisted; never logged. |
| `Organisation.primary_contact_email` | INP-02 | DB, audit row | ✅ |
| `Organisation.primary_contact_name` | INP-02 | DB, audit row | ✅ |
| `Organisation.primary_contact_phone` | INP-02 | DB | ✅ |
| `Opportunity.supervisor_email` | INP-03 | DB, magic-link issue | ✅ |
| `Opportunity.supervisor_name` | INP-03 | DB | ✅ |
| `Notification.subject` | PRC-07 (template render) | DB, email transport | ✅ |
| `Notification.body` | PRC-07 (template render) | DB, email transport | ✅ |
| `Certificate.pdf` (raw bytes) | PRC-06 generation | S3 | Never logged; only the URL is. |

## Non-PII (intentionally logged)

These are loggable and appear in pino output / audit-log rows:

- `user_id` (UUID) — opaque without DB access; loggable.
- `request_id` (ULID) — assigned per request; loggable.
- `audit_id`, `placement_id`, `application_id`, etc. — opaque UUIDs.
- `ip` — logged on audit rows only, not in pino output (pino redacts
  `req.headers` paths and the IP middleware writes only to audit).
- `user_agent` — logged on audit rows only.

## Logger redaction list (final)

The pino redaction paths in `apps/api/src/lib/logger.ts:13` cover every
field in the PII inventory. The list, with its rationale:

```
req.headers.cookie         # session cookies are out
req.headers.authorization  # belt-and-suspenders; we don't use Bearer
res.headers["set-cookie"]  # response-side cookie headers

# Auth
*.password                 # raw passwords never reach logger anyway,
                           # but a stray req.body destructure could
*.password_hash            # likewise on the way out
*.token, *.raw_token,
*.session_token            # magic-link, password-reset, session ids

# Identity
*.email, *.email_lower
*.full_name, *.student_name
*.phone

# Free-text and uploaded URLs
*.motivation, *.narrative,
*.activity_narrative
*.cv_url

# Notification template parameters
*.body_params, *.params
*.subject, *.body          # final rendered email

# Organisation + opportunity contact PII
*.primary_contact_name,
*.primary_contact_email,
*.primary_contact_phone
*.supervisor_name,
*.supervisor_email

# Signing key (env-only — defence in depth)
*.CERT_SIGNING_KEY
*.cert_signing_key
```

The censor token is the literal string `[REDACTED]`.

## Verified by

- **Unit test:** `apps/api/tests/unit/logger-redaction.test.ts` runs a
  fixture object containing every key listed above through
  `logger.info` and asserts the captured output contains `[REDACTED]`
  for each.
- **Manual diff review:** every handler grep'd for `logger.*` calls
  with `req.body`, `user`, or `placement` arguments — all such calls
  pass scalar IDs only.

## Audit log handling

The audit log is **a different surface**: rows live in Postgres, are
exposed through `/reports/audit-log` (ADMINISTRATOR-only, OUT-09), and
are append-only by construction (CTL-08 triggers reject UPDATE/DELETE).
PII can land in `before` / `after` JSON columns — this is **by design**
because regulators need to see the change diff. Mitigations:

- The audit-log export endpoint requires ADMINISTRATOR.
- Every export writes its own audit row (`audit-log.export`).
- The CSV export does not include the `before` / `after` columns —
  only the metadata (actor, action, resource, timestamp, IP). A
  reviewer who needs the diff queries the API in JSON mode and pulls
  rows individually, leaving a trail.

## Backups & retention

- DB dumps are encrypted at rest (S3 SSE-KMS; bucket policy denies
  unencrypted PUT).
- Backup retention is 7 daily + 4 weekly (see
  `docs/runbooks/backup-recovery.md`).
- Inactive student records are not deleted; they retain
  `is_active = false`. A future ADR will land hard-delete rules per
  Jamaica Data Protection Act §22 retention requirements (deferred to
  Phase 2).

## Outstanding follow-ups (none block the pilot)

1. **Audit-log diff-column projection.** Add an admin-toggled "include
   diffs" flag on the export endpoint with a confirmation step, so the
   common case (metadata-only) becomes the default.
2. **PII vault for transcripts.** Currently
   `transcript.ts` reads `User.full_name` directly. Acceptable for the
   pilot; a Phase 2 ADR may move this through a redaction proxy.
3. **Notification body retention.** `Notification.body` is kept
   indefinitely. Consider a 90-day TTL once the SendGrid event log is
   the source of truth for delivery audit.

## Sign-off

| Role | Name | Date | Outcome |
|---|---|---|---|
| Engineering | <PSMS dev> | 2026-05-07 | Approved |
| Knox HoD (ICT) | _pending_ | _pending_ | _pending_ |
| Knox Legal | _pending_ | _pending_ | _pending_ |

The pilot does not start until the second and third rows are filled
in — track via Knox Legal ticket queue.
