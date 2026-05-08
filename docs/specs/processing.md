# Processing Requirements (PRC-01 — PRC-10)

Algorithms and business rules executed by the system. Each requirement
specifies inputs, the computation, outputs, idempotency / failure
behaviour, and where it lives in code.

## Index

| ID | Title | Implemented by |
|---|---|---|
| PRC-01 | iSIMS CSV import | `apps/api/src/jobs/isims-import.ts` |
| PRC-02 | Rule-based matching scorer | `packages/shared/src/matching.ts` |
| PRC-03 | Magic-link issuance for supervisors | `apps/api/src/modules/auth/magic-link.ts` |
| PRC-04 | Service-hours ledger recomputation | `apps/api/src/modules/ledger/router.ts` |
| PRC-05 | Graduation eligibility check | `apps/api/src/modules/ledger/eligibility.ts` |
| PRC-06 | Certificate generation | `apps/api/src/modules/certificates/` |
| PRC-07 | Notification dispatch | `apps/api/src/modules/notifications/` |
| PRC-08 | Evaluation aggregation | `apps/api/src/modules/evaluations/aggregator.ts` |
| PRC-09 | Coordinator-dashboard aggregation | `apps/api/src/modules/reports/dashboard.ts` |
| PRC-10 | Accreditation pack generation | `apps/api/src/modules/reports/accreditation.ts` |

---

## PRC-01 — iSIMS CSV import

**Inputs.** A CSV file at `ISIMS_CSV_PATH` (or the path argument when
manually invoked), and (for replays) the caller's `Idempotency-Key`.

**Algorithm.**
1. Open `ImportRun` with `status = RUNNING`, record
   `source = 'isims'`, `source_filename`, `started_at = now()`,
   `triggered_by_user_id` (null for cron), and `idempotency_key`.
2. Stream the CSV with `csv-parse`. The first row is the header; the
   header must match the agreed schema version exactly. Mismatch →
   close the run as `FAILED` and abort.
3. For each subsequent row:
   - Validate against the Zod row schema (see INP-01).
   - On success, upsert `User` (by `email_lower`) and `StudentProfile`
     (by `student_id`), wrapping both in a single transaction.
     Increment `rows_imported`.
   - On validation or upsert failure, write
     `import_quarantine_row { run_id, row_number, raw_payload, reason }`
     and increment `rows_quarantined`.
4. Close the run:
   - `SUCCEEDED` if `rows_quarantined == 0`.
   - `PARTIAL` if some imported, some quarantined.
   - `FAILED` if no rows imported (file empty, header bad, or every
     row failed).
5. Set `completed_at = now()`.

**Idempotency.** Manual triggers must carry an `Idempotency-Key`. If
the key already exists in `import_run.idempotency_key`, the existing
`run_id` is returned and no second run is started.

**CTL-07 invariant.** The job never opens a network connection to
iSIMS. The only iSIMS-side coupling is the file drop. A unit test
greps the module to enforce this.

**Failure handling.** Any error thrown outside a row's per-row try is
caught at the top level: the run is closed as `FAILED` and the error
is logged with `request_id` (or `run_id` for cron). The job process
itself does not crash.

---

## PRC-02 — Rule-based matching scorer

**Implementation.** `packages/shared/src/matching.ts`. Pure: identical
inputs always produce identical outputs.

**Composite formula.**
```
score = 0.40 × competency_overlap
      + 0.25 × programme_match
      + 0.20 × availability_fit
      + 0.15 × freshness
```
The weights live in `WEIGHTS` and are sanity-checked at module load to
sum to exactly 1.

**Factor definitions.**

| Factor | Definition |
|---|---|
| `competency_overlap` | Σ (matched required competency weight × proficiency/5) ÷ Σ weights. 1 if the opportunity has no required competencies. |
| `programme_match` | 1 if `eligible_programmes` is empty or includes the student's programme code, else 0. Binary because programme eligibility is a hard rule. |
| `availability_fit` | 0.5 if `expected_grad_date` is unknown. 0 if graduation is before the placement ends. Otherwise `clamp(buffer / opp_weeks, 0, 1)` where buffer is graduation-weeks-minus-placement-weeks. |
| `freshness` | Linear decay from 1.0 at publication to 0 at `FRESHNESS_HORIZON_DAYS = 30`. Unpublished opportunities score 0. |

**Outputs.** `ScoreResult { score, factors }`. `score` is clamped to
`[0, 1]`. The factor breakdown is returned alongside so the
coordinator UI can explain the ranking (OUT-02 and the recommendations
endpoint).

**When run.**
- On `POST /applications` (cached as `Application.score_snapshot`).
- On `GET /me/recommendations?n=K` (live).
- The score snapshot is **not authoritative** — recompute on demand
  rather than rely on the snapshot for any decision; the snapshot is
  audit context only.

**Edge cases.**
- Opportunity end before opportunity start → `availability_fit = 0`.
- Future-dated `published_at` → `freshness = 1` (treat as fresh).
- NaN inputs → `clamp` rounds them down to the lower bound rather
  than propagating.

---

## PRC-03 — Magic-link issuance and consumption (supervisors)

**Implementation.** `apps/api/src/modules/auth/magic-link.ts`.

**Issuance (`issueMagicLink`).**
1. Reject if the supervisor already has
   `MAGIC_LINK_MAX_ACTIVE_PER_SUPERVISOR` (default 3) active links
   (`consumed_at IS NULL` AND `expires_at > now()`). 429 to the
   originating endpoint.
2. Generate `raw_token = randomBytes(32).toString('base64url')` (43
   URL-safe characters).
3. Generate `token_salt = randomBytes(16).toString('hex')`.
4. Compute `token_hash = sha256(salt || raw_token)`.
5. Persist `magic_link_token` with `token_hash`, `token_salt`,
   `expires_at = now() + MAGIC_LINK_TTL_HOURS` (default 24),
   `purpose`, `placement_id`, `issued_by_user_id`.
6. Return `{ token_id, raw_token, expires_at }`. The raw token is
   only ever exposed at this step; it is embedded in the email URL
   and immediately forgotten in memory.

**Consumption (`consumeMagicLink`).**
1. Reject tokens shorter than 32 chars (cheap pre-filter).
2. Fetch up to 200 unconsumed unexpired candidates and find one whose
   `sha256(salt || rawToken) === token_hash`. The candidate set is
   tiny in practice (≤ 3 per active supervisor).
3. Atomically mark the matched token consumed via
   `updateMany ... where consumed_at = null` so concurrent consumers
   cannot both win. If the update returns 0, return `410 Gone`.
4. Return `{ token_id, supervisor_user_id, placement_id, purpose }`.

**Session result.** The auth router (`router.ts:275`) creates a
session bound to `placement_id` (`scope_placement_id`) so the
supervisor's session is scoped to one placement only.

**Storage rule (CTL-02).** The raw token is **never** persisted. Only
the salted SHA-256 hash and the salt are stored.

**Rate limiting.** `magicLinkIssueLimiter` caps issuance per
coordinator at `RATE_LIMIT_MAGICLINK_ISSUE_PER_HOUR` (default 20).

---

## PRC-04 — Service-hours ledger

**Implementation.** `apps/api/src/modules/ledger/router.ts`.

**Design choice.** No materialised ledger table. Aggregates are
computed on demand from `hours_log` because the pilot scale (≤ 200
students × ~12 weekly logs) makes Postgres aggregates fast enough
(< 50 ms p95 in seeded tests).

**Per-placement breakdown** (`GET /placements/:id/ledger`).
```sql
SELECT status, SUM(hours), COUNT(*) FROM hours_log
WHERE placement_id = $1 GROUP BY status;
```
Returned shape:
`{ approved_hours, pending_hours, rejected_hours,
   approved_log_count, pending_log_count, rejected_log_count }`.

**Per-student summary** (`GET /me/ledger`,
`GET /students/:user_id/ledger`).
- Joins to `student_profile` to surface `programme_code`,
  `programme_name`, `hours_required`.
- Returns `hours_remaining = max(hours_required - approved_hours, 0)`
  and `placement_count`.

**Recomputation triggers.** None needed — every read is a fresh
aggregate. APPROVED transitions in
`POST /placements/:id/hours/:log_id/decision` immediately affect the
next read.

**Visibility.** Coordinator and admin see any student. Students see
themselves. Supervisors see per-placement ledger only for placements
they are assigned to.

---

## PRC-05 — Graduation eligibility

**Implementation.**
`apps/api/src/modules/ledger/eligibility.ts:evaluateEligibility`.

**Inputs.**
- `hours_required` from `student_profile`.
- `approved_hours` from `SUM(hours_log.hours WHERE status = APPROVED)`.
- `has_completed_placement` — at least one `placement.status = COMPLETED`.
- `has_final_evaluation` — at least one FINAL evaluation exists for
  any of the student's placements.

**Decision.**
- `ELIGIBLE` when all three checks pass.
- `ELIGIBLE_WITH_CAUTION` when both placement and FINAL conditions
  hold AND `approved_hours ≥ 0.80 × hours_required` (just short).
- `INELIGIBLE` otherwise.

**Output.**
`{ status, approved_hours, hours_required, hours_remaining,
   has_completed_placement, has_final_evaluation, reasons[] }`.
The `reasons` array contains a human-readable string for every failed
check.

**When run.**
- On demand via `GET /me/eligibility` and
  `GET /students/:id/eligibility`.
- Implicitly by PRC-06 before generating a certificate (only when
  status is `ELIGIBLE`).

---

## PRC-06 — Certificate generation

**Trigger.**
1. A FINAL evaluation lands and the placement transitions to
   `COMPLETED` (`apps/api/src/modules/evaluations/router.ts:144`).
2. PRC-05 returns `ELIGIBLE`.
3. No `Certificate` row exists for the placement
   (`uq_placement_certificate`, see schema `Certificate.placement_id`
   `@unique`).

**Algorithm.**
1. Render the PDF with `pdfkit`. Single A4 page, includes student
   name, programme, total approved hours, composite rating from
   PRC-08, organisation name, placement window, certificate ID, QR
   code.
2. Compute `signature_hash = sha256(pdf_bytes)`.
3. Sign with Ed25519 over `signature_hash` using the key from
   `CERT_SIGNING_KEY` (base64-PEM PKCS8). The corresponding public
   key (`CERT_PUBLIC_KEY`, base64 SPKI) is exposed at
   `GET /certificates/public-key` for third-party verification (CTL-06).
4. Persist the PDF in object storage at
   `certificates/{certificate_id}.pdf` and write a `certificate` row.
5. Send the `certificate-issued` email to the student.

**Idempotency.** If a certificate for the placement already exists and
is not revoked, the trigger returns the existing row.
`POST /certificates/:id/regenerate` (coordinator/admin) deletes the
storage object and rebuilds with the latest data.

**Revocation.** `POST /certificates/:id/revoke` (admin) sets
`revoked = true`, `revoked_at = now()`, `revoked_by_user_id`,
`revoked_reason`. The verify endpoint exposes the revocation but
keeps the signature valid (revocation is metadata, not invalidation).

**Verification (`GET /certificates/verify/:id`).** Returns
`{ valid, student_name, programme_name, organisation_name,
   issued_at, revoked, revoked_at, signature_hash }` for a revoked
or valid certificate. `valid` is `true` if the row exists and the
recomputed `sha256(stored_pdf_bytes)` matches `signature_hash`.

---

## PRC-07 — Notification dispatch

**Implementation.** `apps/api/src/modules/notifications/email.ts`
(transport), `templates/` (rendering), router (forthcoming) for
inbox + webhook.

**Lifecycle.**
1. A handler calls `sendEmail({ to, subject, template, params })`.
2. The template is rendered (`templates/index.ts`) and a
   `Notification` row is persisted with `status = QUEUED`.
3. The transport sends via SendGrid HTTP API if
   `SENDGRID_API_KEY` is set, else SMTP (Mailpit in dev). On send,
   `status = SENT`, `sent_at = now()`, `sendgrid_message_id`
   recorded if available.
4. SendGrid webhooks at `POST /webhooks/sendgrid` carry delivery
   events (`processed`, `delivered`, `bounce`, `dropped`, `open`,
   `click`). Each event is appended to
   `notification_delivery_event` and the parent `Notification.status`
   is updated to `DELIVERED`, `BOUNCED`, or `FAILED`. Read events
   from the in-app inbox flip `status = READ` and set `read_at`.

**Templates.** Subject + plain + HTML with a shared layout
(`templates/_layout.ts`). Templates: `magic-link`,
`password-reset`, `application-decision`, `hours-decision`,
`evaluation-reminder`, `certificate-issued`.

**Webhook security (CTL-03 + new).**
- Signature verification with the ECDSA public key stored in
  `SENDGRID_WEBHOOK_PUBLIC_KEY`. Invalid signature → `401`.
- The webhook handler is `PUBLIC` in OpenAPI but enforces the
  signature check before any DB write.

**PII rule (CTL-05).** Template parameters (`body_params`) are
redacted from log lines; recipient email addresses are stored on the
`notification` row but never logged in plain text.

**Quiet hours.** A `quiet_hours_local` value in `system_config`
(start/end in JM time) defers non-urgent dispatches; magic-link and
hours-decision emails are urgent and always dispatched. Quiet-hour
deferral is best-effort — a queued row is held for sending on the
next minute past the window's end.

---

## PRC-08 — Evaluation aggregation

**Implementation.**
`apps/api/src/modules/evaluations/aggregator.ts`.

**Per-evaluation average.**
```
if competency_ratings.length > 0:
    competency_mean = mean(competency_ratings)
    average = mean(attendance, professionalism, competency_mean)
else:
    average = mean(attendance, professionalism)
```
All ratings must be integers in `[1, 5]` (validated). Output rounded
to 3 decimal places, persisted as `evaluation.average_score`
(`Decimal(4,3)`).

**Placement composite.**
```
composite = mean(evaluation.average_score for all submitted evaluations)
```
Rounded to 3 decimal places, persisted as
`placement.composite_rating` (`Decimal(3,2)` truncated to 2 dp on
write — Postgres rounds half-to-even).

**Recomputation.** Runs inside the same transaction as the evaluation
insert (`evaluations/router.ts:138`). MIDTERM-then-FINAL produces a
composite that is the mean of both averages — it is not a weighted
final-only score.

**Edge cases.**
- Re-submission of the same `evaluation_type` is blocked at the DB
  level (`uq_placement_eval_type`); the handler returns `409`.
- A placement with zero evaluations has `composite_rating = NULL`;
  PRC-06 will not generate a certificate in that state.

---

## PRC-09 — Coordinator dashboard aggregation

**Implementation.** `apps/api/src/modules/reports/dashboard.ts`
(forthcoming).

**Inputs.** None (computed for the calling coordinator's full visibility
scope).

**Computation.** A single Postgres query (or a small set, joined by
the handler) producing:
- `active_placements` — count where `placement.status = ACTIVE`.
- `pending_hours` — count and sum of `hours_log` where `status = PENDING`.
- `evaluations_due` — count of placements with no `MIDTERM` and now is
  inside the placement's middle third, plus placements with no `FINAL`
  whose `end_date < now() + 14 days`.
- `students_at_risk` — count where
  `approved_hours / hours_required < 0.5` and the placement window's
  remaining days < 60.
- `opportunities` — counts grouped by status (DRAFT, PUBLISHED,
  CLOSED).
- `applications_pending` — count where `status IN (SUBMITTED,
  UNDER_REVIEW)`.

**Refresh cadence.** On demand. The web app polls every 60 seconds
(deliberate non-goal: real-time WebSockets per CLAUDE.md). The query
is expected to complete within `PRF-07` (≤ 2 s).

**Caching.** None for the pilot. A short-TTL in-process cache may be
added if PRF-07 cannot be met; that decision goes in an ADR.

---

## PRC-10 — Accreditation pack generation

**Implementation.** `apps/api/src/modules/reports/accreditation.ts`
(forthcoming).

**Trigger.** Coordinator or admin posts to
`POST /reports/accreditation-pack` with optional filters
(`start_date`, `end_date`, `programme_codes[]`).

**Algorithm.**
1. Synchronously create a `report_run` row (`status = RUNNING`) and
   return `202` with `pack_id`.
2. Asynchronously, compose:
   - `placements.csv` — one row per placement in scope.
   - `organisations.csv` — distinct host organisations referenced.
   - `evaluations.csv` — every evaluation, anonymised narrative
     truncated to 200 chars (PII-aware).
   - `hours_summary.csv` — per-student approved/pending totals.
   - `cover.pdf` — generated summary page (counts, date range,
     coordinator signature line).
3. ZIP the artefacts. Upload to storage at
   `reports/accreditation/{pack_id}.zip`. Update `report_run` to
   `SUCCEEDED` with `output_storage_key`.
4. The caller polls `GET /reports/accreditation-pack/:pack_id`
   until `status = SUCCEEDED`, then downloads via the signed URL in
   the response.

**Idempotency.** The endpoint accepts `Idempotency-Key`. Identical
key + payload returns the original `pack_id`.

**PRF target.** ≤ 5 minutes for a pilot-scale dataset (200 students,
12 months). The job is bounded by the largest CSV (`hours_summary`)
and ZIP compression — both linear in row count.

**Retention.** Generated packs are retained for 24 months; storage
lifecycle deletes them after.
