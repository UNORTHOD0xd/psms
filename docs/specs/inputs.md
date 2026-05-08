# Input Requirements (INP-01 — INP-10)

Source-of-truth IDs for input requirements. Every requirement names the
trigger (what causes the input), the actor (which role), preconditions
that must hold, the validation rules the input must satisfy,
postconditions on success, and the error cases with their HTTP status.

Schema references are to `packages/shared/schema.prisma`. Endpoint
references are to `apps/api/openapi.yaml`. Implementation references are
to `apps/api/src/`.

## Index

| ID | Title | Implemented by |
|---|---|---|
| INP-01 | Student profile import (iSIMS CSV) | `apps/api/src/jobs/isims-import.ts`, PRC-01 |
| INP-02 | Host organisation registration | `apps/api/src/modules/orgs/` |
| INP-03 | Opportunity authoring | `apps/api/src/modules/opportunities/` |
| INP-04 | Application submission | `apps/api/src/modules/applications/`, PRC-02 |
| INP-05 | Placement record creation (on application approval) | `apps/api/src/modules/placements/` |
| INP-06 | Midterm and final evaluation submission | `apps/api/src/modules/evaluations/`, PRC-08 |
| INP-07 | CV upload (pre-signed S3 PUT) | `apps/api/src/modules/uploads/` |
| INP-08 | Coordinator site-visit notes | `apps/api/src/modules/placements/` (`/site-visits` endpoint) |
| INP-09 | Sign-in (email + password for Knox users) | `apps/api/src/modules/auth/` |
| INP-10 | User and reference-data administration | `apps/api/src/modules/admin/` |

---

## INP-01 — Student profile import (iSIMS CSV)

**Trigger.** Scheduled job firing on the `ISIMS_IMPORT_CRON` schedule
(default `0 2 * * *`), or a manual `POST /imports/isims/trigger` from
an administrator.

**Actor.** System (cron) or `ADMINISTRATOR` (manual).

**Preconditions.**
- A CSV file is present in `ISIMS_CSV_PATH`.
- The file's header row matches the agreed schema version (see PRC-01).
- For manual triggers, the request carries an `Idempotency-Key` (CTL-09).

**Validation (per row).**
| Column | Rule |
|---|---|
| `student_id` | Non-empty, ≤ 20 chars, unique within the file |
| `email` | RFC 5322 valid; unique within the file |
| `full_name` | Non-empty, ≤ 200 chars |
| `programme_code` | Must exist in `programme.programme_code` |
| `year_of_study` | Integer ≥ 1 |
| `expected_grad_date` | ISO `YYYY-MM-DD` or empty |
| `hours_required` | Integer ≥ 0; if absent, falls back to the programme's `hours_required` |

**Postconditions.**
- For each valid row, a `User` row (role = `STUDENT`) and a matching
  `StudentProfile` are upserted by `email_lower` and `student_id`.
- Invalid rows are written to `import_quarantine_row` with `reason`.
- An `import_run` row records `rows_total`, `rows_imported`,
  `rows_quarantined`, terminal status (`SUCCEEDED`, `PARTIAL`, `FAILED`).
- The job never writes to iSIMS (CTL-07).

**Error cases.**
- File missing → run records `FAILED`, no rows imported.
- Header mismatch → run records `FAILED` immediately, no rows processed.
- Duplicate `Idempotency-Key` with same payload hash → returns the
  existing `run_id` (replay).
- Duplicate `Idempotency-Key` with different payload hash → `409 Conflict`.

---

## INP-02 — Host organisation registration

**Trigger.** Coordinator submits a new host organisation, or admin
approves a pending one.

**Actor.** `COORDINATOR_OR_ADMIN` to create/edit; `ADMINISTRATOR` to
approve.

**Preconditions.**
- Authenticated via session cookie.
- For approval: `Organisation.status = PENDING`.

**Validation.** Body schema (`OrgInputSchema`,
`apps/api/src/modules/orgs/router.ts:16`):
| Field | Rule |
|---|---|
| `name` | 1..200 chars |
| `type` | One of `EMPLOYER`, `NGO`, `PUBLIC_SECTOR`, `ACADEMIC` |
| `industry_sector` | 1..100 chars |
| `address` | ≤ 500 chars, nullable |
| `primary_contact_name` | 1..200 chars |
| `primary_contact_email` | RFC 5322 valid |
| `primary_contact_phone` | 1..40 chars |
| `mou_on_file` | boolean |
| `mou_expiry_date` | `YYYY-MM-DD` or null |

**Postconditions.**
- `POST /organisations` creates an `organisation` row with `status = PENDING`.
- `PATCH /organisations/:id` updates fields; only allowed before approval.
- `POST /organisations/:id/approve` flips `status = ACTIVE`.
- An audit-log entry is written for create / update / approve.

**Error cases.**
- Missing role → `403 Forbidden`.
- Validation failure → `400 Bad Request` with field paths.
- Approve when status is not `PENDING` → `422 Unprocessable Entity`.
- Approve as non-admin → `403 Forbidden`.

---

## INP-03 — Opportunity authoring

**Trigger.** Coordinator creates, edits, publishes, or closes an
opportunity.

**Actor.** `COORDINATOR`.

**Preconditions.**
- For edits and publish: `Opportunity.status = DRAFT`.
- For close: `Opportunity.status = PUBLISHED`.
- The cited `organisation_id` exists and `status = ACTIVE` (recommended;
  hard-enforced at publish time, not draft time).

**Validation.** Body schema (`OpportunityInputSchema`,
`apps/api/src/modules/opportunities/router.ts:26`):
| Field | Rule |
|---|---|
| `organisation_id` | UUID, must exist |
| `title` | 1..200 chars |
| `description` | 1..4000 chars |
| `start_date`, `end_date`, `application_deadline` | `YYYY-MM-DD`; `end_date > start_date`; `application_deadline ≤ start_date` |
| `min_hours` | Integer ≥ 1 |
| `openings` | Integer 1..50 |
| `required_competencies` | Array of `competency_code`s; every code must exist |
| `eligible_programmes` | Array of `programme_code`s; every code must exist; empty = open to all |
| `supervisor_name`, `supervisor_email` | 1..200 chars / RFC 5322 valid |
| `stipend_jmd` | Decimal or null; persisted as `stipend_amount` with `stipend_currency = 'JMD'` |

**Postconditions.**
- Create → `opportunity` row + child rows for competencies and
  programmes; `status = DRAFT`.
- Publish → `status = PUBLISHED`, `published_at = now()`.
- Close → `status = CLOSED`, `closed_at = now()`.
- Audit-log entry written for every state-changing call.

**Error cases.**
- Date constraints violated → `422`.
- Unknown competency or programme code → `400`.
- Edit / publish from non-`DRAFT` status → `422`.
- Close from non-`PUBLISHED` status → `422`.

---

## INP-04 — Application submission

**Trigger.** Student submits an application to a published opportunity,
or coordinator records a decision.

**Actor.** `STUDENT` for submit and withdraw; `COORDINATOR` for decision.

**Preconditions.**
- Submit: `Opportunity.status = PUBLISHED`,
  `application_deadline ≥ today`, the student has a `StudentProfile`,
  and (if `Opportunity.eligible_programmes` is non-empty) the student's
  programme is in the eligible set.
- Decision: `Application.status ∈ {SUBMITTED, UNDER_REVIEW}`.
- Withdraw: `Application.status ∉ {APPROVED, DECLINED, WITHDRAWN}` and
  the student is the owner.

**Validation.** Body schema (`ApplicationInputSchema`,
`apps/api/src/modules/applications/router.ts:98`):
| Field | Rule |
|---|---|
| `opportunity_id` | UUID, must exist |
| `motivation` | 50..2000 chars |
| `cv_url` | RFC 3986 URL (typically the public read URL returned by INP-07) |

Decision body (`DecisionSchema`):
| Field | Rule |
|---|---|
| `decision` | `APPROVE` or `DECLINE` |
| `decline_reason` | Required when `decision = DECLINE`; ≤ 1000 chars |

**Postconditions.**
- Submit → `application` row with `status = SUBMITTED` and a
  `score_snapshot` cached from PRC-02 at submission time.
- Approve → `status = APPROVED`, transactionally creates a `placement`
  row and ensures a `User`+`SupervisorProfile` exist for the
  opportunity's `supervisor_email`, then issues an `ONBOARDING`
  magic-link email (PRC-03).
- Decline → `status = DECLINED`, `decline_reason` recorded, student
  notified by email.
- Withdraw → `status = WITHDRAWN`.
- Unique constraint `uq_student_opportunity` prevents duplicate
  applications by the same student.

**Error cases.**
- Opportunity not published or deadline past → `422`.
- Programme not eligible → `422`.
- Duplicate application → `409 Conflict`.
- Decline missing reason → `400`.
- Approve / decline already-decided application → `422`.
- Withdraw of own non-pending application → `422`.

---

## INP-05 — Placement record creation

**Trigger.** Coordinator approves an application (the only path for the
pilot — placements are not authored standalone).

**Actor.** `COORDINATOR` (indirectly, via approval).

**Preconditions.**
- The approval transaction in
  `apps/api/src/modules/applications/router.ts:269` has begun.
- A supervisor `User` row is ensured (created lazily; see
  `ensureSupervisorUser`, line 371).

**Validation.** Inherited from the parent application — no separate
input.

**Postconditions.**
- `placement` row created with `status = PENDING_START`,
  `start_date`/`end_date` copied from the opportunity.
- `application.placement` relation populated.
- An `ONBOARDING` magic-link is issued to the supervisor (PRC-03).

**State machine** (`apps/api/src/modules/placements/router.ts:127`):
- `PENDING_START → ACTIVE` (coordinator) — opens hours logging.
- `ACTIVE → COMPLETED` (auto on FINAL evaluation, or coordinator
  override).
- `* → TERMINATED` (coordinator only; requires `terminated_reason`).

**Hours-log sub-input** (`HoursInputSchema`, line 166):
| Field | Rule |
|---|---|
| `week_number` | Integer 1..52 |
| `date` | `YYYY-MM-DD` within `[start_date, end_date]` |
| `hours` | Decimal 0.25..60 |
| `activity_narrative` | 20..2000 chars |

**Error cases.**
- Logging hours when placement is not `ACTIVE` → `422`.
- Logging hours outside the placement window → `422`.
- Duplicate (placement, week_number, date) → `409` from
  `uq_placement_week_date`.
- Non-allowed status transition → `422`.

---

## INP-06 — Midterm and final evaluation submission

**Trigger.** Supervisor (or coordinator override) submits a midterm or
final evaluation.

**Actor.** Assigned `SUPERVISOR` (placement.supervisor_user_id =
auth.user_id), or `COORDINATOR`.

**Preconditions.**
- `Placement.status = ACTIVE`.
- No prior evaluation of the same `evaluation_type` for this placement
  (enforced by `uq_placement_eval_type`).

**Validation.** Body schema (`EvaluationInputSchema`,
`apps/api/src/modules/evaluations/router.ts:27`):
| Field | Rule |
|---|---|
| `placement_id` | UUID, must exist |
| `evaluation_type` | `MIDTERM` or `FINAL` |
| `attendance_rating`, `professionalism_rating` | Integer 1..5 |
| `narrative` | 20..4000 chars |
| `recommend_future` | boolean |
| `competency_ratings[].competency_code` | Must exist |
| `competency_ratings[].rating` | Integer 1..5 |

**Postconditions.**
- An `evaluation` row + `evaluation_competency_rating` rows are
  created in one transaction (`router.ts:116`).
- `evaluation.average_score` computed by PRC-08 `evaluationAverage`.
- `placement.composite_rating` recomputed from all submitted
  evaluations via `placementComposite`.
- If `evaluation_type = FINAL`, `placement.status = COMPLETED`. This
  is the trigger for certificate generation (PRC-06).
- The student is notified by email (best effort).

**Error cases.**
- Placement not `ACTIVE` → `422`.
- Caller is not the assigned supervisor or a coordinator → `403`.
- Duplicate `(placement_id, evaluation_type)` → `409`.
- Unknown `competency_code` → `400`.
- Rating out of range [1,5] → `400` (Zod).

---

## INP-07 — CV upload (pre-signed PUT)

**Trigger.** Student initiates CV upload from the application form.

**Actor.** `STUDENT`.

**Preconditions.**
- Authenticated via session cookie.
- The intended file content type and size are within policy.

**Validation (request).**
| Field | Rule |
|---|---|
| `filename` | 1..200 chars; ASCII; no path separators |
| `content_type` | `application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX) |
| `byte_size` | Integer 1..5 242 880 (5 MB) |

**Validation (PUT enforcement).** The pre-signed URL is constrained by
`Content-Type` and `Content-Length`; uploads with a different
content-type or larger size are rejected by the storage layer.

**Postconditions.**
- The presign endpoint returns:
  - `upload_url` — short-lived (≤ 5 min) PUT URL.
  - `read_url` — the public URL the API will record on the application
    (`Application.cv_url`).
  - `storage_key` — opaque identifier, derived as
    `cv/{user_id}/{ulid}.{ext}`.
- No DB row is written until the application referencing the upload is
  submitted (INP-04). Orphan objects expire under bucket lifecycle.

**Error cases.**
- Disallowed content type → `400`.
- Size cap exceeded → `400`.
- Unauthenticated → `401`.

---

## INP-08 — Coordinator site-visit notes

**Trigger.** Coordinator records a site visit (live or virtual) for an
active placement.

**Actor.** `COORDINATOR`.

**Preconditions.**
- The placement exists.
- Visibility is enforced via `placementWhereForRole`
  (`apps/api/src/modules/placements/router.ts:41`); coordinators see all.

**Validation.** Body schema (`SiteVisitInputSchema`, line 391):
| Field | Rule |
|---|---|
| `visit_date` | `YYYY-MM-DD` |
| `narrative` | 20..4000 chars |
| `overall_assessment` | `SATISFACTORY`, `CONCERNS`, or `UNSATISFACTORY` |
| `follow_up_actions[].action` | 1..500 chars |
| `follow_up_actions[].due_date` | `YYYY-MM-DD` |

**Postconditions.**
- A `site_visit_note` row is created with optional child
  `site_visit_followup` rows.
- A follow-up can later be marked resolved via
  `POST /placements/:id/site-visits/:note_id/follow-ups/:followup_id/resolve`.
- Audit-log entries record creation and each resolution.

**Error cases.**
- Caller not coordinator → `403`.
- Resolving an already-resolved follow-up → `422`.

---

## INP-09 — Sign-in (Knox accounts)

**Trigger.** A user submits credentials at `POST /auth/sign-in`.

**Actor.** `PUBLIC` (no session required to call). Roles
`STUDENT`, `COORDINATOR`, `ADMINISTRATOR` use this path.
`SUPERVISOR` does **not** — supervisors authenticate via magic link
(PRC-03) only.

**Preconditions.**
- The endpoint is rate-limited (`signInLimiter`,
  `apps/api/src/middleware/rate-limit.ts:9`):
  `RATE_LIMIT_SIGNIN_PER_IP_PER_5MIN` attempts per IP per 5 minutes
  (default 5).

**Validation.** Body schema (`SignInSchema`,
`apps/api/src/modules/auth/router.ts:34`):
| Field | Rule |
|---|---|
| `email` | RFC 5322 valid |
| `password` | ≥ 12 chars |

**Postconditions.**
- On success: a session row is created, a session cookie is set on the
  response (HttpOnly, Secure, SameSite=Lax — CTL-10), `last_signin_at`
  is updated, an `auth.sign_in` audit-log entry is written, and the
  password is silently re-hashed with the current argon2id parameters
  if `needsRehash` reports true.
- The response body is `{ user: Me }` from `renderMeFromUserId`.

**Error cases.**
- Invalid email format or short password → `400`.
- Wrong email or wrong password → `401 Unauthorized` with detail
  `"Invalid credentials"` (the response is identical for both, to
  prevent user enumeration).
- Inactive account → `401` (same message).
- Rate-limit hit → `429 Too Many Requests`.

**Sister flows in the same module.**
- `POST /auth/sign-out` — revokes the session, clears the cookie.
- `GET /auth/me` — returns current user.
- `POST /auth/password-reset/request` — always returns `204`; emits an
  email containing a 1-hour token if the email is registered.
- `POST /auth/password-reset/confirm` — validates the token, hashes the
  new password (argon2id), revokes all existing sessions for the user.

---

## INP-10 — User and reference-data administration

**Trigger.** Administrator manages users or system configuration.

**Actor.** `ADMINISTRATOR`.

**Endpoints.**
- `GET /admin/users` — paginated list, filterable by `role` and free
  text `q` (matches name and email).
- `POST /admin/users/:user_id/deactivate` — sets `is_active = false`,
  revokes all of the user's active sessions.
- `POST /admin/users/:user_id/force-password-reset` — issues a 1-hour
  reset token, dispatches the email, and revokes the user's prior
  unconsumed reset tokens.
- `GET /admin/config`, `PATCH /admin/config` — read/write entries in
  `system_config`. Allowed keys are restricted to a server-side
  whitelist (see PRC-09 for the consumed set).

**Preconditions.**
- Admin role.
- Target user exists.

**Validation.** UUID path params; PATCH body keys must be in the
whitelist (unknown key → `400`).

**Postconditions.**
- Deactivation immediately invalidates ongoing sessions (CTL-10).
- Force-reset sends exactly one email and audit-logs the issuance.
- Config writes are audited with before/after values.

**Error cases.**
- Non-admin caller → `403`.
- Target user not found → `404`.
- Deactivating an already-inactive user → `422` (idempotent
  deactivation is fine, but we surface it explicitly so the caller
  knows the state).
- Unknown config key → `400`.
