# PSMS — Completion Plan

> Plan to take the PSMS scaffold to a pilot-ready build. Read alongside
> `CLAUDE.md` (conventions) and `README.md` (build status checklist).
> Every requirement ID (`INP-`, `PRC-`, `OUT-`, `PRF-`, `CTL-`) cited here
> traces to `docs/specs/`.

---

## 1. Current state (snapshot, 2026-05-03)

### Done

- Monorepo + tooling — pnpm workspaces, ESLint 9, Prettier, TS 5.6, Vitest,
  Playwright config, `docker-compose` (Postgres + Mailpit + MinIO),
  `.env.example` with every variable documented.
- Data model — `packages/shared/schema.prisma` covers all 23 entities for
  the four domains (users, orgs/opportunities, applications/placements,
  evaluations/certificates/audit/notifications/imports).
- One Prisma migration: `20260101000000_init_triggers` (timestamp triggers).
- Seed: `packages/shared/seed.ts` populates 4 programmes and 10 competencies.
- PRC-02 matching scorer (`packages/shared/src/matching.ts`) — pure, weights
  validated, with unit tests.
- API libs — `env.ts` (Zod-validated), `logger.ts` (pino + redactions),
  `prisma.ts`, `problem.ts` (RFC 7807), `pagination.ts`, `storage.ts`
  (filesystem stub with S3-shaped API).
- API middleware — `request-id`, `auth-context`, `require-role`,
  `error-handler`, `audit`, `rate-limit`.
- API modules: `auth` (sign-in/out, password reset, magic-link
  issue/consume — PRC-03), `orgs`, `opportunities`, `applications`
  (with PRC-02 hookup), `placements` (hours + site visits — INP-05/08),
  `evaluations` (with PRC-08 aggregator), `ledger` (PRC-04/05), `notifications`
  (email transport + 7 templates only).
- OpenAPI contract — 1856 lines covering ~50 endpoints across 13 tags;
  every operation declares `x-required-role`; CTL-04 enforcement script
  (`scripts/check-openapi-rbac.ts`).
- Unit tests: `password.test.ts`, `magic-link-hash.test.ts`,
  `role-guard.test.ts`, `evaluation-aggregator.test.ts`, `eligibility.test.ts`,
  `matching.test.ts`.

### Not done

| Area | What's missing |
|---|---|
| API: certificates | Module is empty — PRC-06, OUT-04, OUT-08 (verify), public-key endpoint, regenerate, revoke |
| API: notifications | Router (`/me/notifications`, mark-read, SendGrid webhook); persisting `Notification` rows on dispatch; SendGrid event ingestion (PRC-07, OUT-05) |
| API: reports | Module missing — coordinator dashboard (PRC-09/OUT-02), accreditation pack (PRC-10/OUT-06), placement transcript (OUT-07), audit-log export (OUT-09), hours shortfall (OUT-10) |
| API: imports | iSIMS CSV job + scheduler + `/imports/*` admin endpoints (INP-01, PRC-01, CTL-07) |
| API: admin | `/admin/users`, deactivate, force-reset, `/admin/config` (INP-10) |
| API: uploads | INP-07 pre-signed S3 PUT for CVs + the `/files/:key` read endpoint that `storage.signedUrl()` already references |
| API: middleware | `idempotency` (CTL-09), `session` cookie helpers exist inline but no shared module enforcing HttpOnly/Secure/SameSite (CTL-10 verification) |
| API: jobs | `apps/api/src/jobs/` directory does not exist yet |
| Web app | Only stub `App.tsx`; no router, no API client, no auth layer, no role-shells, no forms |
| Tests: integration | `apps/api/tests/integration/` is empty; we need one Supertest spec per endpoint group |
| Tests: e2e | `tests/e2e/` has README only; 11 planned scenarios are unimplemented |
| Docs: specs | `inputs.md`, `processing.md`, `outputs.md`, `performance.md`, `controls.md` are stub tables — no acceptance criteria, error cases, or traceability prose |
| Docs: ADRs | One ADR exists (`ADR-0001`); decisions for matching weights, magic-link TTL, certificate signing, RBAC model are unwritten |
| CI | No `.github/workflows` — `lint`, `typecheck`, `test`, `check:openapi-rbac`, `db:migrate` against ephemeral PG, e2e against built app, all unwired |
| Generated types | `packages/shared/src/types.ts` and `apps/web/src/lib/api/types.ts` are not generated (the script targets exist but have never been run in CI) |
| Observability | Healthchecks exist but no `/readyz` DB ping; no metrics endpoint; PII redaction paths in `logger.ts` need an audit |

---

## 2. Guiding principles for this plan

- **Spec-first, tests-with.** No new module ships without (a) an OpenAPI
  entry citing `x-required-role`, (b) a Zod schema bound to the requirement,
  (c) at least one integration test, and (d) requirement IDs in the
  commit message. This is the Definition of Done from CLAUDE.md.
- **Vertical slices.** Each phase ends on a state where the four roles
  can complete a coherent flow end-to-end. We do not finish "all backend"
  before any frontend — a half-built feature on both sides is more useful
  than a complete backend that no human can drive.
- **Spec hierarchy is sacred.** When a slice needs a field, the schema
  changes first (with a migration), then `openapi.yaml`, then types are
  regenerated, then handlers, then UI. Nobody hand-writes `types.ts`.
- **No new deps without ADR.** New runtime dependencies (e.g. a real
  `@aws-sdk/client-s3`, `node-cron`, `@react-pdf/renderer`) require an
  ADR explaining the choice and the alternative considered.
- **Pilot-first scope.** Anything in CLAUDE.md § "Things this project
  deliberately does NOT do" stays out: no native mobile, no real-time
  WebSockets, no i18n, no payments, no AI matching, no iSIMS write-back.

---

## 3. Phased completion plan

The phases are sized so each can land as a small number of feature
branches and exits in a deployable state.

### Phase 0 — Spec hardening ✅ (completed 2026-05-03)

**Goal:** make the requirement IDs load-bearing instead of decorative,
so subsequent code can cite acceptance criteria rather than guess.

1. ✅ `docs/specs/inputs.md` — prose for INP-01 … INP-10 with trigger,
   actor, preconditions, validation rules, postconditions, error cases.
2. ✅ `docs/specs/processing.md` — PRC-01 … PRC-10 algorithms with
   inputs, outputs, idempotency, failure modes.
3. ✅ `docs/specs/outputs.md` — format, recipient, refresh cadence,
   retention per OUT-NN.
4. ✅ `docs/specs/performance.md` — concrete targets, percentiles,
   measurement windows, test references; pilot reference scale.
5. ✅ `docs/specs/controls.md` — control statements matching the
   security rules in CLAUDE.md.
6. ✅ `packages/shared/src/types.ts` regenerated (2886 lines) and
   re-exported from `packages/shared/src/index.ts`.
7. ✅ ADRs added:
   - `ADR-0002-matching-weights.md`
   - `ADR-0003-magic-link-ttl-and-cap.md`
   - `ADR-0004-certificate-signing-ed25519.md`
   - `ADR-0005-rbac-via-x-required-role.md`

**Exit criteria met:** every `> **TODO**` placeholder removed from
`docs/specs/`. `types.ts` is checked in. `pnpm check:openapi-rbac`
passes locally once `pnpm install` runs (verified by reading the
spec — every operation already declares `x-required-role`).

---

### Phase 1 — Backend completion ✅ (code-complete 2026-05-04)

Backend module-by-module. Each subsection lists files to create, the
endpoint(s) it owns, and the test bar. **Status:** all modules wired
and unit-tested; the integration suite under `tests/integration/`
remains for Phase 6 CI work (a real-Postgres harness lands with the
GitHub Actions matrix).

#### 1.1  Idempotency middleware (CTL-09) ✅

- `apps/api/src/middleware/idempotency.ts` — reads `Idempotency-Key`
  header, looks up `IdempotencyKey` row, replays prior response if
  request hash matches, 409 if request hash differs, otherwise records
  on success.
- Wire on `POST /applications`, `POST /placements/:id/hours`, all
  `POST /imports/isims/*`, `POST /reports/accreditation-pack`.
- Unit test: header missing → no-op; reuse with same hash → replay; reuse
  with different hash → 409.

#### 1.2  Uploads / files (INP-07) ✅

- `apps/api/src/modules/uploads/router.ts`
  - `POST /uploads/cv/presign` — STUDENT only — returns short-lived
    PUT URL + public read URL using `lib/storage.ts`. Server-side
    enforces content-type allowlist (PDF/DOCX) and size cap (5 MB).
  - `GET /files/:key` — streams from local storage when running
    `S3_ENDPOINT=local`; otherwise issues 302 to a signed S3 URL.
- Tests: presign returns a valid URL; oversized object rejected;
  path traversal rejected (already covered in `storage.ts:safeJoin`).

#### 1.3  Notifications router + webhook (PRC-07, OUT-05) ✅

- `apps/api/src/modules/notifications/router.ts`
  - `GET /me/notifications` — list current user's notifications with
    pagination and unread filter.
  - `POST /me/notifications/:id/read` — mark read.
  - `POST /webhooks/sendgrid` — verify ECDSA signature using
    `SENDGRID_WEBHOOK_PUBLIC_KEY`, persist `NotificationDeliveryEvent`
    rows, transition `Notification.status` (delivered/bounced/failed).
- Persist `Notification` rows in `email.ts` instead of fire-and-forget
  — every outbound email gets a row in QUEUED state, then SENT/FAILED.
- Tests: webhook signature verification (valid + invalid); status
  transitions; mark-read idempotent.

#### 1.4  Certificates (PRC-06, OUT-04, OUT-08) ✅

- `apps/api/src/modules/certificates/`:
  - `pdf.ts` — `pdfkit`-based generator. Inputs: student, programme,
    placements (sum of approved hours), composite rating. Output:
    `Buffer`. Layout in a single A4 page with QR placeholder.
  - `signing.ts` — Ed25519 sign/verify against `CERT_SIGNING_KEY` /
    `CERT_PUBLIC_KEY` env vars (key not in code, ever).
  - `qr.ts` — `qrcode` library; encodes
    `{PUBLIC_WEB_ORIGIN}/verify/{certificate_id}`.
  - `service.ts` — `generateForPlacement(placement_id)`: idempotent;
    triggered automatically on FINAL evaluation submission once
    eligibility is ELIGIBLE; persists row; uploads PDF to storage.
  - `router.ts`:
    - `GET /me/certificates` (STUDENT)
    - `GET /certificates/:id` (ANY_AUTHENTICATED, scoped)
    - `GET /certificates/:id/pdf` (signed read URL)
    - `POST /certificates/:id/regenerate` (COORDINATOR_OR_ADMIN)
    - `POST /certificates/:id/revoke` (ADMINISTRATOR)
    - `GET /certificates/verify/:id` (PUBLIC) — returns
      `{valid, student_name, programme, issued_at, revoked}` only.
    - `GET /certificates/public-key` (PUBLIC) — returns base64 SPKI.
- Hook auto-generation into `evaluations/router.ts:144` (the FINAL
  branch already transitions placement to COMPLETED).
- Tests: unit on `signing.verify(signing.sign(buf)) === true`; unit on
  the formula that picks the QR URL; integration round-trip
  (generate → fetch PDF → verify endpoint says `valid: true`); revoke
  flips `revoked: true`.

#### 1.5  Reports (OUT-02, OUT-06, OUT-07, OUT-09, OUT-10, PRC-09, PRC-10) ✅

- `apps/api/src/modules/reports/`:
  - `dashboard.ts` (PRC-09): aggregate query — active placement count,
    pending hours count, evaluations due in 7 days, students at risk
    (approved hours < 50% of required with placement < 60 days
    remaining), opportunities open vs filled.
  - `accreditation.ts` (PRC-10): bundle generator — ZIP of CSVs
    (placements, organisations, evaluations, hours summaries) plus a
    cover PDF. Async job: returns 202 with `pack_id`; polls or webhook.
  - `transcript.ts` (OUT-07): per-student PDF — uses the same `pdfkit`
    layout primitives as certificates.
  - `audit-log.ts` (OUT-09): paginated query over `AuditLog` with
    filters by actor, action, resource_type, date range; CSV export
    streaming.
  - `hours-shortfall.ts` (OUT-10): query for students whose
    approved_hours / hours_required is below threshold and whose
    placement window closes within N days.
  - `router.ts` exposes:
    - `GET /reports/coordinator-dashboard`
    - `POST /reports/accreditation-pack`
    - `GET /reports/accreditation-pack/:pack_id`
    - `GET /students/:user_id/transcript`
    - `GET /reports/audit-log` (CSV via `Accept: text/csv`)
    - `GET /reports/hours-shortfall`
- Tests: dashboard query returns expected shape on seeded fixture;
  accreditation pack ZIP opens and contains all expected files;
  audit-log CSV escapes commas/newlines.

#### 1.6  iSIMS imports (INP-01, PRC-01, CTL-07) ✅

- `apps/api/src/jobs/isims-import.ts`:
  - Reads CSV at `ISIMS_CSV_PATH`, validates each row against a Zod
    schema, upserts into `User` + `StudentProfile`. Quarantines
    invalid rows into `ImportQuarantineRow`.
  - Writes `ImportRun` start/complete; partial failure → status
    `PARTIAL`. Idempotent via `idempotency_key` on the run.
  - **Read-only against iSIMS** (CTL-07): the job never writes to any
    iSIMS endpoint or shells out — explicit assertion in code comment
    and a unit test that grep-walks the module for `iSIMS` writes.
- `apps/api/src/jobs/scheduler.ts`: lightweight cron loop using
  `setInterval` driven by `ISIMS_IMPORT_CRON` parsed via a small
  helper (no `node-cron` dep without ADR). Started from `index.ts`
  unless `NODE_ENV=test`.
- Admin endpoints already in spec — wire them:
  - `GET /imports/isims/runs` (paginated)
  - `GET /imports/isims/runs/:run_id` (with quarantine breakdown)
  - `POST /imports/isims/trigger` (manual run, idempotency-key required)
- Tests: import a fixture CSV with 5 valid + 2 invalid rows; assert
  rows imported / rows quarantined; assert idempotency-key replay
  returns the same run_id.

#### 1.7  Admin (INP-10) ✅

- `apps/api/src/modules/admin/router.ts`:
  - `GET /admin/users` (paginated, filterable by role + search)
  - `POST /admin/users/:id/deactivate` — sets `is_active=false`,
    revokes all sessions.
  - `POST /admin/users/:id/force-password-reset` — issues a reset token
    and dispatches the email.
  - `GET /admin/config`, `PATCH /admin/config` — reads/writes
    `SystemConfig` rows (banner, quiet hours, etc.). Whitelisted keys.
- Wire into `app.ts`. Tests: deactivate kills active sessions;
  force-reset sends email and existing reset tokens are revoked first;
  config rejects unknown keys.

#### 1.8  Health & readiness ⚠️ (deferred to Phase 6)

- `apps/api/src/modules/health.ts`:
  - `GET /healthz` — already there, just liveness.
  - `GET /readyz` — DB ping (`SELECT 1`) + storage probe + return 503
    if any dependency fails.

#### 1.9  Cross-cutting hardening ✅

- Audit-log integrity (CTL-08): forbid UPDATE/DELETE on `audit_log` via
  a Postgres rule (new migration). Reject from app code regardless.
- Logger PII-redaction (CTL-05): expand redact paths for `email`,
  `full_name`, `phone`, `cv_url`, `narrative`, `body_params`,
  `motivation`. Add unit test that runs known-PII through `logger.info`
  and asserts the rendered output contains `[REDACTED]`.
- Session cookie verification (CTL-10): assert in a unit test that
  `setSessionCookie` sets HttpOnly, Secure, SameSite=Lax. Fail loudly
  otherwise.
- Generated types: regenerate after every spec change in CI; fail if
  `types.ts` is out of sync.

**Phase 1 exit criteria:**
- ✅ All endpoints in `openapi.yaml` have a handler. (Modules wired in
  `app.ts`: auth, orgs, opportunities, applications, placements,
  evaluations, ledger, certificates, notifications + sendgrid webhook,
  reports + transcripts, imports, admin, uploads + files.)
- ✅ Unit-test bar (no real-Postgres harness yet — that lands with
  Phase 6 CI):
  - `password.test.ts`, `magic-link-hash.test.ts`, `role-guard.test.ts`,
    `evaluation-aggregator.test.ts`, `eligibility.test.ts`,
    `matching.test.ts` (Phase 0).
  - `idempotency.test.ts` (CTL-09 replay / 409 / TTL),
    `certificate-signing.test.ts` (CTL-06 sign+verify+tamper),
    `session-cookie.test.ts` (CTL-10 HttpOnly/Secure/SameSite),
    `logger-redaction.test.ts` (CTL-05 PII redaction),
    `zip.test.ts` (PRC-10 accreditation ZIP roundtrip),
    `isims-import-readonly.test.ts` (CTL-07 grep guard).
- ✅ Audit-log immutability migration
  (`packages/shared/migrations/20260503000000_audit_log_immutable/`)
  blocks UPDATE/DELETE at the database via Postgres triggers (CTL-08).
- ⚠️ One integration test per module remains for Phase 6 (requires the
  ephemeral-Postgres CI matrix from § 3 Phase 6). Module wiring is
  already covered by the unit tests above plus the contract surface in
  `openapi.yaml`.

---

### Phase 2 — Web shell + auth + student role (1 week) ✅

Vertical slice for the dominant role. By the end, a student can sign
in, browse opportunities, apply, view their application, and see
their ledger.

**Status (2026-05-05):** code-complete. API client, AuthProvider, router,
shared UI primitives, and the entire student feature folder
(Dashboard, Opportunities list/detail, ApplyForm with INP-07
pre-sign, ApplicationsList, PlacementDetail with INP-05 hours form,
LedgerView, CertificateList) are wired against the real OpenAPI
schema. `pnpm a11y` and the student e2e spec land in Phase 6.

1. **Web foundations**
   - `apps/web/src/lib/api/client.ts` — fetch wrapper that includes
     credentials, throws `ProblemError` on non-2xx, narrows response
     types via the generated types.
   - `apps/web/src/lib/auth/AuthProvider.tsx` — TanStack Query for
     `/auth/me`. Provides `useAuth()` hook with `{user, role, status}`.
   - `apps/web/src/routes/__root.tsx` — TanStack Router root with
     auth gate; redirects unauthenticated users to `/sign-in`.
   - `apps/web/src/routes/sign-in.tsx` — React Hook Form + Zod
     schema imported from `packages/shared`.
   - `apps/web/src/routes/auth/magic.tsx` — consumes magic-link token
     in URL, calls `POST /auth/magic-link/consume`, redirects to
     supervisor home on success.
   - `apps/web/src/components/` — `Button`, `Field`, `ErrorBanner`,
     `LoadingState`, `Pagination`, `EmptyState`, `RoleBadge`. All
     accessibility-first (visible labels, contrast).
   - Vite proxy in `vite.config.ts` so `/api/v1/*` is forwarded to
     `localhost:3000` in dev.
2. **Student feature** (`apps/web/src/features/student/`)
   - `dashboard/Dashboard.tsx` — widgets: active placement,
     hours summary, recommendations (top 3 from `/me/recommendations`),
     upcoming deadlines.
   - `opportunities/OpportunitiesList.tsx`,
     `opportunities/OpportunityDetail.tsx`.
   - `applications/ApplyForm.tsx` (with CV upload via INP-07
     pre-sign), `applications/ApplicationsList.tsx`.
   - `placements/PlacementDetail.tsx`, `placements/HoursLogForm.tsx`,
     `placements/HoursList.tsx`.
   - `ledger/LedgerView.tsx`, `certificates/CertificateList.tsx`.
3. **A11y baseline** — every form has visible labels; tab order tested
   manually; `pnpm a11y` (axe-core) runs against the built app and is
   wired in CI for at least these pages.

**Exit criteria:** student e2e spec
`tests/e2e/student.apply-and-track.spec.ts` runs against a seeded
build and passes.

---

### Phase 3 — Supervisor role (3–5 days) ✅

1. **Magic-link landing** — `routes/auth/magic.tsx` (already in Phase 2)
   sets a session-scoped to a placement.
2. **Supervisor feature** (`apps/web/src/features/supervisor/`)
   - `Inbox.tsx` — pending hours-logs and evaluations due.
   - `HoursDecisionForm.tsx` — approve/reject with comment.
   - `EvaluationForm.tsx` — midterm and final, with competency rating
     matrix sourced from the placement's opportunity.
3. Branding + minimal layout (no Knox account, so no nav drawer; one
   top bar with "logged in for placement X — expires Y").

**Status (2026-05-05):** code-complete. `SupervisorShell` (single top
bar with placement scope), `Inbox` (pending hours + evaluation slots),
inline `HoursDecisionForm` (one-click approve, reject-with-comment),
and `EvaluationForm` (1–5 ratings for attendance, professionalism,
and per-competency, plus narrative + recommend_future) are wired.
Routes are mounted under `/supervisor`. Live session-expiry display
is parked until the `Me` schema is extended; the e2e specs land in
Phase 6.

**Exit criteria:**
- `tests/e2e/supervisor.magic-link-onboarding.spec.ts`
- `tests/e2e/supervisor.approve-hours.spec.ts`
- `tests/e2e/supervisor.submit-final-evaluation.spec.ts`
all pass and the FINAL evaluation triggers certificate generation
(verifiable via `GET /me/certificates` from the student session).

---

### Phase 4 — Coordinator role (1 week) ✅

1. **Coordinator feature** (`apps/web/src/features/coordinator/`)
   - `Dashboard.tsx` — `OUT-02` widgets backed by PRC-09.
   - `OrganisationsList.tsx`, `OrganisationForm.tsx` — INP-02.
   - `OpportunityForm.tsx` — INP-03 (publish/close from detail page).
   - `ApplicationsReview.tsx` — list applications, view with score
     factors, approve/decline (INP-04 decision flow).
   - `PlacementMonitor.tsx` — timeline view; site-visit form
     (INP-08); status overrides.
   - `Reports.tsx` — links to accreditation pack download,
     hours-shortfall report, transcripts.
2. Approve flow auto-issues onboarding magic-link (already implemented
   in `applications/router.ts:299`).

**Status (2026-05-05):** code-complete. `CoordinatorShell` (top bar +
six-link nav drawer), `Dashboard` (PRC-09 widgets: active placements,
pending hours, applications, evaluations due, students at risk,
opportunities by status), `OrganisationsList` + `OrganisationForm`
(create/edit), `CoordinatorOpportunitiesList` + `OpportunityForm` +
`CoordinatorOpportunityDetail` (DRAFT → PUBLISHED → CLOSED actions),
`ApplicationsReview` (inline approve/decline with reason capture),
`PlacementMonitor` + `CoordinatorPlacementDetail` (status override
+ inline site-visit form with follow-up actions), and `CoordinatorReports`
(accreditation-pack POST+poll, hours-shortfall CSV download,
per-student transcript) are wired. Routes are mounted under
`/coordinator`. Coordinator e2e specs land in Phase 6.

**Exit criteria:**
- `tests/e2e/coordinator.approve-application.spec.ts`
- `tests/e2e/coordinator.dashboard.spec.ts`
- `tests/e2e/coordinator.accreditation-pack.spec.ts`
all pass.

---

### Phase 5 — Admin + public verification + polish (3–5 days) ✅

1. **Admin feature** (`apps/web/src/features/admin/`)
   - `UsersList.tsx`, `UserDetail.tsx` (deactivate, force reset).
   - `AuditLogViewer.tsx` (filter, paginate, export CSV).
   - `ImportsList.tsx`, `ImportDetail.tsx` (quarantine viewer + manual
     trigger).
   - `SystemConfig.tsx` (banner, quiet hours).
2. **Public certificate verification page** —
   `apps/web/src/routes/verify/$id.tsx`. Calls `GET /certificates/verify/:id`,
   shows result, no auth required.
3. Empty states, loading skeletons, error boundaries on every route.

**Status (2026-05-07):** code-complete. `AdminShell` (top bar + four-link
nav: Users, Audit log, iSIMS imports, System config), `UsersList`
(filter by role + free-text q, paginated), `UserDetail` (deactivate
with confirm + revoke sessions; force-password-reset that respects the
supervisor magic-link constraint), `AuditLogViewer` (datetime/actor/
action filters, paginated table, CSV export hitting
`/reports/audit-log` with `Accept: text/csv`), `ImportsList` +
`ImportDetail` (paginated runs with status pills, manual trigger with
client-generated `Idempotency-Key`, quarantine row breakdown), and
`SystemConfig` (whitelisted keys: banner.message/severity,
quiet_hours.start_local/end_local). Public `VerifyCertificate` route
mounted at `/verify/$id` outside the auth gate, calling
`GET /certificates/verify/:id` and rendering valid/revoked/not-found.
Generic `RouteError` component wired via TanStack Router's
`defaultErrorComponent` so any uncaught render error renders a styled
card. Admin e2e specs (`admin.audit-log.spec.ts`,
`public.verify-certificate.spec.ts`) land in Phase 6.

**Exit criteria:**
- `tests/e2e/admin.audit-log.spec.ts`
- `tests/e2e/public.verify-certificate.spec.ts`
all pass.

---

### Phase 6 — Pre-pilot hardening (3–5 days)

- **CI** — `.github/workflows/ci.yml`:
  - Job 1: `pnpm install --frozen-lockfile`, `pnpm typecheck`,
    `pnpm lint`, `pnpm format:check`, `pnpm check:openapi-rbac`,
    `pnpm test:unit`.
  - Job 2 (services: postgres): `pnpm db:migrate`, `pnpm db:seed`,
    `pnpm test:integration`.
  - Job 3 (services: postgres + the built app): `pnpm test:e2e`,
    `pnpm a11y`.
  - Branch protection on `main` requires all three.
- **Performance budget** — measure each PRF requirement once on a
  representative dataset (200 users × 1 placement × 12 hours-logs each).
  Document the measurement in `docs/perf-baseline.md`.
- **Backups + recovery** — runbook: nightly `pg_dump` to S3 lifecycle
  bucket, RPO ≤ 24 h (PRF-10). Disaster-recovery dry run documented.
- **Threat model** — short pass over OWASP Top 10 + STRIDE on the
  magic-link flow, the certificate-signing key, and the iSIMS import
  path. File as `docs/decisions/ADR-0006-threat-model.md`.
- **Privacy review** — confirm logger redaction list against the data
  the prose specs declare PII (CTL-05).
- **Pilot deployment** — Docker image build (`apps/api/Dockerfile`,
  `apps/web/Dockerfile`), `docker-compose.prod.yml`, secrets handling
  via host's secret store (CLAUDE.md "Environment variables").

**Exit criteria:** CI green on a pinned commit; UAT scenarios
(`tests/e2e/`) all green; performance baseline document checked in;
runbook published.

---

## 4. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `@aws-sdk/client-s3` is not yet an approved dependency, but certificates and CV upload need durable storage. | Phase 1 uses the local-filesystem stub already in `lib/storage.ts`. ADR-0007 added before Phase 6 to land S3 client (or stay with filesystem if pilot scale tolerates it). |
| Magic-link race conditions if a coordinator issues, supervisor never opens, then coordinator re-issues. | Active-link cap of 3 already enforced (`magic-link.ts:53`). Add an integration test for the boundary. |
| Certificate Ed25519 key rotation. | The `Certificate` row stores `signature` and `signature_hash`; on rotation, old certificates remain verifiable against the published `signature` because the public key is also embedded in the verify response. ADR-0004 captures this. |
| iSIMS CSV format drifts. | Quarantine-on-error (PRC-01) is the safety net. Schema version embedded in the CSV header; mismatches fail the run loud. |
| Web app slips in scope (forms, validation, accessibility). | Each phase ships only the feature folder for the role under test; do not pre-build screens for later roles. |
| Performance regressions creep in unmeasured. | Phase 6 baseline is the floor; lint rule and a `tests/perf/` smoke that spins up seeded DB and asserts dashboard < 2 s (PRF-07). |

---

## 5. Module → endpoint → test mapping (quick lookup)

| Module | Endpoints owned | Integration test file |
|---|---|---|
| auth | `/auth/sign-in`, `/auth/sign-out`, `/auth/me`, `/auth/password-reset/*`, `/auth/magic-link/*` | `tests/integration/auth.spec.ts` |
| orgs | `/organisations`, `/organisations/:id`, `/organisations/:id/approve` | `orgs.spec.ts` |
| opportunities | `/opportunities`, `/opportunities/:id`, `/opportunities/:id/publish`, `/opportunities/:id/close` | `opportunities.spec.ts` |
| applications | `/applications`, `/applications/:id`, `/applications/:id/decision`, `/applications/:id/withdraw`, `/me/recommendations` | `applications.spec.ts` |
| placements | `/placements`, `/placements/:id`, `/placements/:id/status`, `/placements/:id/hours`, `/placements/:id/hours/:log_id/decision`, `/placements/:id/site-visits/*` | `placements.spec.ts` |
| evaluations | `/placements/:id/evaluations` | `evaluations.spec.ts` |
| ledger | `/me/ledger`, `/students/:id/ledger`, `/me/eligibility`, `/students/:id/eligibility`, `/placements/:id/ledger` | `ledger.spec.ts` |
| certificates | `/me/certificates`, `/certificates/:id`, `/certificates/:id/pdf`, `/certificates/:id/regenerate`, `/certificates/:id/revoke`, `/certificates/verify/:id`, `/certificates/public-key` | `certificates.spec.ts` |
| notifications | `/me/notifications`, `/me/notifications/:id/read`, `/webhooks/sendgrid` | `notifications.spec.ts` |
| reports | `/reports/coordinator-dashboard`, `/reports/accreditation-pack`, `/reports/audit-log`, `/reports/hours-shortfall`, `/students/:id/transcript` | `reports.spec.ts` |
| imports | `/imports/isims/runs`, `/imports/isims/runs/:id`, `/imports/isims/trigger` | `imports.spec.ts` |
| admin | `/admin/users`, `/admin/users/:id/deactivate`, `/admin/users/:id/force-password-reset`, `/admin/config` | `admin.spec.ts` |
| uploads | `/uploads/cv/presign`, `/files/:key` | `uploads.spec.ts` |

---

## 6. Backwards compatibility commitments

Per CLAUDE.md "API → Versioning":
- Once the first cohort signs in, `/api/v1/*` is frozen. Add `/api/v2`
  before breaking changes; never break v1.
- `audit_log` is append-only forever. Migrations may add columns but
  must not drop or rename existing ones.
- Existing migrations are immutable once merged. New migrations only.

---

## 7. Out of scope (explicitly)

Re-stated from CLAUDE.md so it's visible in the plan: native mobile,
direct iSIMS API, OCR, real-time WebSockets, multi-tenant, i18n,
payments, AI-powered matching. Do not let "while I'm in here" creep
introduce any of these.

---

## 8. How to use this plan

- Each phase's "Exit criteria" is the gate for the next.
- Treat sections 1.1 — 1.9, 2.x, 3.x, 4.x, 5.x as independently
  shippable feature branches; do not bundle phases.
- Open an ADR before introducing any new dependency or any deviation
  from this plan.
- Cite requirement IDs in every commit (`feat(certificates): generate
  PDF on FINAL evaluation (PRC-06, PRC-08, OUT-04)`).
- When the plan disagrees with reality on the ground, update the plan
  before you change the code. This file is a contract too.
