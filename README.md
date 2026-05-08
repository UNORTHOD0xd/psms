# PSMS — Placement & Service Management System

Placement and service-hours management for the **Knox Community College
ICT pilot**. Augments — does not replace — the existing iSIMS platform.
Pilot covers the ICT Department's industry internships and the
community-service-hours requirement for ICT students across all Knox
programmes.

| | |
|---|---|
| **Stack** | TypeScript everywhere — Express 5 API, React 18 + Vite SPA, PostgreSQL 16 via Prisma, pnpm workspaces |
| **Auth** | Argon2id + cookie sessions (Knox staff/students), 24-hour magic-link (external supervisors) |
| **Pilot scale** | ~250 users / 200 placements / 2,500 hours-logs (`docs/perf-baseline.md`) |
| **Status** | All six delivery phases complete (`PLAN.md`); pilot-ready barring CI green on a pinned commit |

> 📚 Read `CLAUDE.md` first if you intend to make changes — it codifies
> the spec hierarchy, the requirement-ID convention (`INP-`/`PRC-`/etc.),
> and the architectural rules every change has to satisfy.

---

## Roles

| Role | Auth | What they do |
|---|---|---|
| Student | Knox email + password | Browse opportunities, apply, log weekly hours, download completion certificate |
| External supervisor | 24-hour magic-link (no Knox account) | Approve/reject hours, submit midterm + final evaluations |
| Placement coordinator | Knox staff sign-in | Register organisations, publish opportunities, review applications, monitor placements, export accreditation evidence |
| System administrator | Knox staff sign-in | Manage users, browse audit log, run iSIMS imports, edit system config |

---

## Architecture (one-paragraph version)

A pnpm monorepo with two apps and one shared package. The Express API
in `apps/api` exposes `/api/v1/*` defined by `apps/api/openapi.yaml`
(the HTTP contract; types are regenerated from it, never hand-edited).
The React SPA in `apps/web` consumes that contract through a
fetch wrapper that parses RFC 7807 problems and enforces credentials.
`packages/shared` owns the Prisma schema (the data-model source of
truth), the PRC-02 rule-based matching scorer, and the OpenAPI-derived
TypeScript types. Local dev runs on `docker compose` with Postgres,
Mailpit (SMTP capture), and MinIO (S3-compatible storage).

```
.
├── CLAUDE.md                  ← project conventions (read first)
├── PLAN.md                    ← phased delivery plan
├── apps/
│   ├── api/                   ← Express + TypeScript HTTP API
│   │   ├── openapi.yaml       ← API contract (source of truth)
│   │   ├── Dockerfile         ← prod image (multi-stage, non-root)
│   │   └── src/
│   │       ├── modules/       ← one folder per Level-1 DFD process
│   │       ├── middleware/    ← auth, rate-limit, audit, idempotency
│   │       └── jobs/          ← scheduled work (iSIMS import)
│   └── web/                   ← React + Vite + TanStack Router/Query
│       ├── Dockerfile         ← nginx static prod image
│       └── src/features/      ← one folder per role (student/supervisor/coordinator/admin)
├── packages/
│   └── shared/
│       ├── schema.prisma      ← data model (source of truth)
│       ├── seed.ts            ← reference data
│       ├── seed-e2e.ts        ← deterministic e2e fixture
│       └── src/matching.ts    ← PRC-02 rule-based scorer
├── tests/
│   └── e2e/                   ← Playwright UAT specs
├── docs/
│   ├── specs/                 ← INP/PRC/OUT/PRF/CTL requirements
│   ├── decisions/             ← ADR-0001 .. ADR-0006
│   ├── runbooks/              ← backup-recovery, DR drills
│   ├── perf-baseline.md
│   └── privacy-review.md
├── docker-compose.yml         ← dev (postgres + mailpit + minio)
├── docker-compose.prod.yml    ← prod composition
├── .github/workflows/ci.yml   ← three-job pipeline
└── .env.example               ← every variable documented
```

---

## Prerequisites

You need **Node.js 22+**, **pnpm 9.12+**, and **Docker** (with the
Compose v2 plugin) on the development host. The exact pnpm version is
pinned in `package.json#packageManager`; install it via Corepack so
your local pnpm matches CI.

### Linux (Arch / Ubuntu / Debian / Fedora)

```bash
# Node.js 22 — pick one:
#   • via mise / asdf (recommended, version-pinned per project)
mise install node@22 && mise use node@22
#   • or via your distro:
#       Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
#       Fedora:        sudo dnf install -y nodejs22
#       Arch:          sudo pacman -S nodejs npm

# pnpm via Corepack (ships with Node 22)
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm -v          # → 9.12.0

# Docker + Compose plugin
#   Ubuntu/Debian: sudo apt install -y docker.io docker-compose-plugin
#   Fedora:        sudo dnf install -y docker docker-compose-plugin
#   Arch:          sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # log out + in for the group to take effect
```

### Windows 10/11

The recommended path is **WSL 2 + Ubuntu 22.04**, then follow the Linux
instructions above inside the WSL shell. Native Windows works but is
unsupported in CI; reach for it only if you must.

```powershell
# 1. Enable WSL 2 (run in an elevated PowerShell)
wsl --install -d Ubuntu-22.04
# Reboot when prompted, finish the Ubuntu first-run setup.

# 2. Install Docker Desktop for Windows
#    https://www.docker.com/products/docker-desktop/
#    In Settings → Resources → WSL Integration, enable the Ubuntu-22.04 distro.

# 3. From inside the Ubuntu shell, install Node + pnpm:
#    (follow the Linux block above)
```

If you really must run natively on Windows:

```powershell
# Node.js 22 — via the official installer or:
winget install OpenJS.NodeJS.LTS

# pnpm
corepack enable
corepack prepare pnpm@9.12.0 --activate

# Docker Desktop — see step 2 above.
```

> ⚠️ **PowerShell tips.** Use forward slashes in pnpm scripts; line
> continuations are backticks (`` ` ``), not backslashes; environment
> variables go via `$env:NAME = 'value'`. The bash examples below all
> work unchanged inside WSL.

### macOS (unofficial — pilot is Linux-first)

```bash
brew install node@22 pnpm docker docker-compose
brew services start docker
corepack enable && corepack prepare pnpm@9.12.0 --activate
```

---

## Quick start (local development)

Run these from the repo root. They work on Linux, in WSL, and on macOS.

```bash
# 1. Start local infrastructure
docker compose up -d           # Postgres 16, Mailpit, MinIO

# 2. Install workspace dependencies
pnpm install

# 3. Configure environment (copy + fill in any blanks)
cp .env.example .env.local
#   - For local dev the defaults work; just generate the cert keys:
node -e "const c=require('node:crypto'); const k=c.generateKeyPairSync('ed25519'); \
  const priv=k.privateKey.export({type:'pkcs8',format:'pem'}).toString(); \
  const pub=k.publicKey.export({type:'spki',format:'pem'}).toString(); \
  console.log('CERT_SIGNING_KEY='+Buffer.from(priv).toString('base64')); \
  console.log('CERT_PUBLIC_KEY='+Buffer.from(pub).toString('base64'));" \
  >> .env.local

# 4. Generate types from the OpenAPI spec + Prisma client
pnpm types:generate            # apps/api/openapi.yaml → packages/shared/src/types.ts
pnpm api:client                # → apps/web/src/lib/api/types.ts
pnpm db:generate               # Prisma client

# 5. Apply migrations and seed reference data
pnpm db:migrate
pnpm db:seed                   # 4 programmes + 10 competencies

# 6. Start the API + web together (parallel)
pnpm dev
```

| Service | URL | Purpose |
|---|---|---|
| Web app | <http://localhost:5173> | The SPA — Vite dev server |
| API | <http://localhost:3000> | `/api/v1/*` and probes |
| Mailpit UI | <http://localhost:8025> | Captured outbound emails |
| MinIO console | <http://localhost:9001> | S3 bucket browser (login: `minioadmin` / `minioadmin`) |

### First-time UI walkthrough

The dev DB has no users by default — the seed only loads reference
data. To get a working SPA login locally, run the e2e fixture seeder:

```bash
pnpm db:seed:e2e
```

That writes `tests/e2e/.fixture.json` (gitignored) with deterministic
credentials for one user per role:

| Role | Email | Password |
|---|---|---|
| Student | `e2e.student@test.psms` | `e2e-test-password-XYZ-12345` |
| Coordinator | `e2e.coord@test.psms` | (same) |
| Administrator | `e2e.admin@test.psms` | (same) |
| Supervisor | `e2e.supervisor@test.psms` | (magic-link only) |

It also creates one ACTIVE organisation and a PUBLISHED opportunity, so
the student can apply end-to-end.

---

## Common tasks

```bash
# Tests
pnpm test                       # unit + integration, every workspace
pnpm test:unit                  # vitest unit only
pnpm test:integration           # vitest integration (real Postgres)
pnpm test:e2e                   # Playwright (requires built app + db:seed:e2e)
pnpm test:e2e -- --headed       # …with a visible browser

# Quality gates (the same the CI fast lane runs)
pnpm typecheck
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
pnpm a11y                       # axe-core against the running web
pnpm check:openapi-rbac         # CTL-04: every endpoint declares x-required-role

# Database
pnpm db:migrate                 # apply pending migrations
pnpm db:migrate:create -- name  # create a new migration
pnpm db:seed                    # reference data
pnpm db:seed:e2e                # deterministic e2e fixture (writes tests/e2e/.fixture.json)
pnpm db:reset                   # drop + recreate + migrate + seed (DEV ONLY)
pnpm db:generate                # regenerate Prisma client

# Type / client regeneration (run after editing openapi.yaml)
pnpm types:generate
pnpm api:client

# Build (production output)
pnpm build
```

---

## Environment variables

Every variable used by any process is declared in `.env.example` with
a comment explaining what it is and which file consumes it. The API
**refuses to start** if a required variable is missing — this is the
quickest way to find out you've forgotten something.

The categories:

- **Runtime** — `NODE_ENV`, `PORT`, `LOG_LEVEL`
- **Database** — `DATABASE_URL`
- **Sessions** — `SESSION_SECRET`, `SESSION_TTL_HOURS` (CTL-10)
- **Magic links (PRC-03)** — `MAGIC_LINK_TTL_HOURS`, `MAGIC_LINK_MAX_ACTIVE_PER_SUPERVISOR`, `PUBLIC_WEB_ORIGIN`
- **Email** — `SENDGRID_API_KEY` (or fall back to local SMTP via Mailpit), `SENDGRID_WEBHOOK_PUBLIC_KEY`, `EMAIL_FROM_ADDRESS`
- **Certificate signing (PRC-06 / CTL-06)** — `CERT_SIGNING_KEY`, `CERT_PUBLIC_KEY` (Ed25519, base64 PEM)
- **File storage** — `S3_ENDPOINT`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`
- **iSIMS import (PRC-01 / CTL-07)** — `ISIMS_CSV_PATH`, `ISIMS_IMPORT_CRON`
- **Rate limiting** — `RATE_LIMIT_SIGNIN_PER_IP_PER_5MIN`, `RATE_LIMIT_MAGICLINK_ISSUE_PER_HOUR`
- **Frontend** — `VITE_API_BASE_URL`

Sensitive values are **never committed**. `.env`, `.env.local`, and
`.env.*.local` are all gitignored. Staging / production read from the
host's secret store (AWS SSM Parameter Store, Vault, etc.).

---

## Production deployment

The project ships two production images and a compose file that wires
them together. Postgres is internal-only by default; only the web
container exposes a port to the host.

```bash
# On the deployment host:
git clone <repo> /opt/psms && cd /opt/psms
sudo install -d -o root -g root -m 700 /etc/psms
sudo -e /etc/psms/.env       # fill in every variable from .env.example

# Generate Ed25519 cert keys (CTL-06)
sudo /opt/psms/scripts/ops/generate-cert-keys.sh

# Bring it up
docker compose -f docker-compose.prod.yml --env-file /etc/psms/.env up -d
docker compose -f docker-compose.prod.yml exec api node \
  apps/api/dist/jobs/run-migrations.js
```

Backups, RPO, and the disaster-recovery procedure are documented in
[`docs/runbooks/backup-recovery.md`](docs/runbooks/backup-recovery.md).
The threat model is in [`docs/decisions/ADR-0006-threat-model.md`](docs/decisions/ADR-0006-threat-model.md).

---

## Troubleshooting

**`pnpm install` fails on Windows native** — switch to WSL 2. Several
transitive deps build native modules (`argon2`, `@prisma/client`)
that need a POSIX toolchain.

**`docker compose up` fails with "address already in use"** — another
Postgres / SMTP / S3 server is running on the host. Either stop it or
edit the port mapping in `docker-compose.yml`.

**`pnpm db:migrate` fails with `permission denied for schema public`** — the
default Postgres user in the dev compose is `psms` with full DB
ownership; if you've reused an existing volume from another project,
`docker compose down -v` resets it.

**API exits at startup with `Missing required env: …`** — copy
`.env.example` to `.env.local` and re-source. The startup-time Zod
validator names the missing field.

**`pnpm test:integration` hangs on "connecting"** — the Postgres
container isn't healthy yet. `docker compose ps` shows status; wait for
the `(healthy)` marker, then re-run.

**Magic-link emails don't arrive in the SPA flow** — open
<http://localhost:8025>; in dev they go to Mailpit, not a real inbox.

**Playwright says `e2e fixture not found`** — run `pnpm db:seed:e2e`
first; the file is gitignored on purpose so each environment regenerates
its own.

---

## Build status

Phased delivery per [`PLAN.md`](PLAN.md):

- [x] **Phase 0** — Spec hardening (specs/, ADRs 0001–0005, generated `types.ts`)
- [x] **Phase 1** — Backend completion (idempotency, uploads, notifications + SendGrid webhook, certificates + Ed25519 signing, reports + accreditation pack, iSIMS import job + scheduler, admin, audit-log immutability migration)
- [x] **Phase 2** — Web shell + auth + student role (API client, AuthProvider, router, shared UI primitives, Dashboard, Opportunities list/detail, ApplyForm with INP-07 CV pre-sign, ApplicationsList, PlacementDetail with INP-05 hours form, LedgerView, CertificateList)
- [x] **Phase 3** — Supervisor role (placement-scoped shell, Inbox, inline HoursDecisionForm, EvaluationForm with rating matrix and narrative)
- [x] **Phase 4** — Coordinator role (Dashboard, Organisations, Opportunities lifecycle, ApplicationsReview, PlacementMonitor + site visits, Reports — accreditation pack / hours shortfall / transcript)
- [x] **Phase 5** — Admin + public verify + polish (Users, AuditLogViewer, Imports + manual trigger, SystemConfig, public `/verify/$id`, RouteError boundary)
- [x] **Phase 6** — CI + deployment + tests (`.github/workflows/ci.yml` three-job pipeline, Dockerfiles + `docker-compose.prod.yml`, `docs/perf-baseline.md`, `docs/runbooks/backup-recovery.md`, `docs/decisions/ADR-0006-threat-model.md`, `docs/privacy-review.md`; real-Postgres integration harness + 13 module specs; 11 Playwright e2e specs; deterministic e2e fixture seeder)

Foundations: monorepo + tooling, Prisma schema (with audit-log
immutability triggers), PRC-02 matching scorer, OpenAPI contract, all
13 API modules wired, 12 unit tests covering CTL-04..10 and PRC-02/05/08/10,
13 integration specs against a real Postgres, and 11 Playwright e2e
scenarios. CI gates lint + typecheck + unit, integration (ephemeral
Postgres), and e2e + a11y on every PR.

---

## Where to go next

| If you want to … | Open … |
|---|---|
| Understand the rules of the road | [`CLAUDE.md`](CLAUDE.md) |
| See the delivery plan and exit criteria | [`PLAN.md`](PLAN.md) |
| Read the API contract | [`apps/api/openapi.yaml`](apps/api/openapi.yaml) |
| Read the data model | [`packages/shared/schema.prisma`](packages/shared/schema.prisma) |
| Read the requirements prose | [`docs/specs/`](docs/specs/) |
| Read the architecture decisions | [`docs/decisions/`](docs/decisions/) |
| Read the threat model | [`docs/decisions/ADR-0006-threat-model.md`](docs/decisions/ADR-0006-threat-model.md) |
| Read the privacy review | [`docs/privacy-review.md`](docs/privacy-review.md) |
| Run the operational runbook | [`docs/runbooks/backup-recovery.md`](docs/runbooks/backup-recovery.md) |
| See what "working" looks like for each role | [`tests/e2e/`](tests/e2e/) |

---

## License

UNLICENSED — internal Knox Community College pilot. Contact the Knox
HoD (ICT) before any external distribution.
