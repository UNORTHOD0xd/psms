# PSMS — Placement & Service Management System

Knox Community College ICT pilot. Augments (does not replace) iSIMS for
managing industry internships and community-service-hours tracking.

## Layout

```
.
├── CLAUDE.md                       ← project conventions for Claude Code (read first)
├── apps/
│   ├── api/                        ← Express + TypeScript HTTP API
│   │   └── openapi.yaml            ← API contract (source of truth)
│   └── web/                        ← React + Vite frontend
├── packages/
│   ├── shared/
│   │   ├── schema.prisma           ← data model (source of truth)
│   │   └── src/matching.ts         ← PRC-02 rule-based scorer
│   └── config/                     ← shared eslint / tsconfig (TBD)
├── tests/
│   └── e2e/                        ← Playwright UAT specs
└── docs/
    ├── specs/                      ← INP/PRC/OUT/PRF/CTL requirements
    └── decisions/                  ← ADRs
```

The four user roles (Student, External Supervisor, Placement Coordinator,
System Administrator) and the source-of-truth hierarchy are documented in
`CLAUDE.md`.

## Quick start

```bash
# 1. start local infra (Postgres + Mailpit + MinIO)
docker compose up -d

# 2. install
pnpm install

# 3. configure env
cp .env.example .env.local

# 4. apply migrations and seed reference data
pnpm db:migrate
pnpm db:seed

# 5. generate types from the OpenAPI spec
pnpm types:generate

# 6. start API + web together
pnpm dev
```

API listens on `http://localhost:3000`, web on `http://localhost:5173`,
Mailpit UI on `http://localhost:8025`, MinIO console on `http://localhost:9001`.

## Build status

Phased delivery per `PLAN.md`:

- [x] Phase 0 — Spec hardening (specs/, ADRs 0001–0005, generated `types.ts`)
- [x] Phase 1 — Backend completion (idempotency, uploads, notifications + SendGrid webhook, certificates + Ed25519 signing, reports + accreditation pack, iSIMS import job + scheduler, admin, audit-log immutability migration)
- [x] Phase 2 — Web shell + auth + student role (API client, AuthProvider, router, shared UI primitives, and the full student feature: Dashboard, Opportunities list/detail, ApplyForm with INP-07 CV pre-sign, ApplicationsList, PlacementDetail with INP-05 hours form, LedgerView, CertificateList)
- [x] Phase 3 — Supervisor role (SupervisorShell with placement-scoped top bar, Inbox listing pending hours and evaluation slots, inline HoursDecisionForm with approve/reject-with-comment, EvaluationForm with 1–5 attendance/professionalism/competency ratings + narrative + recommend_future, routes mounted at `/supervisor`)
- [x] Phase 4 — Coordinator role (CoordinatorShell + 6-link nav, Dashboard fed by PRC-09 widgets, OrganisationsList/OrganisationForm for INP-02, OpportunitiesList/OpportunityForm/OpportunityDetail with DRAFT→PUBLISHED→CLOSED actions for INP-03, ApplicationsReview with inline approve/decline-with-reason for INP-04, PlacementMonitor + PlacementDetail with status overrides and site-visit form for INP-08, Reports with accreditation-pack POST+poll, hours-shortfall CSV download, and per-student transcript link for OUT-06/OUT-07/OUT-10)
- [x] Phase 5 — Admin + public verify + polish (AdminShell + four-link nav, UsersList/UserDetail with deactivate + force-password-reset for INP-10, AuditLogViewer with filters + CSV export for OUT-09, ImportsList/ImportDetail with idempotency-keyed manual trigger and quarantine breakdown for PRC-01, SystemConfig for banner + quiet hours, public `/verify/$id` certificate page for OUT-08, generic `RouteError` boundary wired via TanStack Router `defaultErrorComponent`)
- [ ] Phase 6 — CI, performance baseline, deployment, integration suite

Foundations in place: monorepo + tooling, Prisma schema (with audit-log
immutability triggers), PRC-02 matching scorer, OpenAPI contract,
all 13 API modules wired, 12 unit tests covering CTL-04, CTL-05,
CTL-06, CTL-07, CTL-08, CTL-09, CTL-10, PRC-02, PRC-05, PRC-08, PRC-10.
Integration suite (real-Postgres harness) and CI pipeline land with
Phase 6.

See `CLAUDE.md` for build commands, definition of done, and architectural
rules. See `PLAN.md` for the full completion plan, `apps/api/openapi.yaml`
for the HTTP contract, and `docs/specs/` for requirement prose.
