# Performance Requirements (PRF-01 — PRF-10)

Each requirement specifies the metric, the target, the percentile
where applicable, the measurement window, and the test that proves it.
The numbers below are the **agreed pilot targets**; adjust only via an
ADR that supersedes this file.

The pilot scale we measure against is documented at the bottom.

## PRF-01 — API read endpoints, p95 response time

| | |
|---|---|
| Metric | Server-side response time, request entry to last-byte sent |
| Target | ≤ 300 ms |
| Percentile / window | p95 over a 1-hour rolling window of pilot traffic |
| Scope | All `GET` endpoints under `/api/v1/*` except `/reports/*` and `/imports/*` |
| Test | k6 scenario `tests/perf/read-endpoints.js` against a seeded DB; CI job runs nightly. PR check runs the abbreviated 30-second variant. |

## PRF-02 — API write endpoints, p95 response time

| | |
|---|---|
| Metric | Server-side response time |
| Target | ≤ 500 ms |
| Percentile / window | p95 over a 1-hour rolling window |
| Scope | `POST`, `PUT`, `PATCH`, `DELETE` under `/api/v1/*`, excluding `/reports/accreditation-pack` (async, see PRF-04). |
| Test | k6 scenario `tests/perf/write-endpoints.js`; same harness as PRF-01. |

## PRF-03 — Certificate generation, end-to-end

| | |
|---|---|
| Metric | Wall-clock from FINAL evaluation submission to `Certificate` row visible in `GET /me/certificates` |
| Target | ≤ 30 s |
| Percentile / window | p95, per generation |
| Scope | PRC-06 happy path |
| Test | Integration test in `apps/api/tests/integration/certificates.spec.ts` measures the time and asserts. |

## PRF-04 — iSIMS nightly import

| | |
|---|---|
| Metric | Wall-clock for one `import_run` |
| Target | ≤ 10 minutes for ≤ 5,000 rows |
| Scope | PRC-01 cron and manual triggers |
| Test | `apps/api/tests/integration/imports.spec.ts` — fixture CSV with 5,000 synthetic rows, asserts duration. |

## PRF-05 — Concurrent active users

| | |
|---|---|
| Metric | Number of users with an active session that has issued a request in the past 5 minutes |
| Target | 200 concurrent users with PRF-01/PRF-02 still met |
| Scope | Pilot scale |
| Test | k6 scenario `tests/perf/concurrent-users.js` with 200 virtual users at steady state for 10 minutes. |

## PRF-06 — Magic-link email delivery

| | |
|---|---|
| Metric | Time from `POST /auth/magic-link/issue` (or auto-issuance on application approval) to SendGrid `delivered` event |
| Target | ≤ 60 s |
| Percentile / window | p95 in production; the test assertion uses Mailpit "received at" |
| Test | E2E `tests/e2e/supervisor.magic-link-onboarding.spec.ts` polls Mailpit's API for the message and asserts the delta. |

## PRF-07 — Coordinator dashboard refresh

| | |
|---|---|
| Metric | `GET /reports/coordinator-dashboard` round-trip on the seeded dataset |
| Target | ≤ 2 s |
| Percentile / window | p95 |
| Test | Integration test asserts the latency on a deterministically-seeded dataset matching the pilot scale. |

## PRF-08 — Hours-log submission to supervisor notification

| | |
|---|---|
| Metric | Time from `POST /placements/:id/hours` (`201`) to the supervisor's notification email being delivered |
| Target | ≤ 60 s |
| Percentile / window | p95 |
| Test | E2E `tests/e2e/supervisor.approve-hours.spec.ts`. |

## PRF-09 — Page load (TTI on broadband)

| | |
|---|---|
| Metric | Time-To-Interactive on Lighthouse, simulated 4G + 4× CPU throttle |
| Target | ≤ 3 s for `/student/dashboard`, `/coordinator/dashboard`, `/supervisor` |
| Test | Lighthouse CI in `.github/workflows/ci.yml` against the built app, with a budget config. |

## PRF-10 — Backup recovery point objective (RPO)

| | |
|---|---|
| Metric | Maximum acceptable data loss on disaster recovery |
| Target | ≤ 24 hours |
| Mechanism | Nightly `pg_dump` to off-host bucket with versioned object lifecycle; 7-day rolling retention plus weekly snapshots for 4 weeks. |
| Test | Quarterly DR drill: restore the latest dump into a fresh DB and run the smoke-test suite. Drill outcome documented in `docs/runbooks/dr-drill-YYYY-MM.md`. |

---

## Pilot reference scale

The numbers above are validated against the following synthetic scale,
which approximates the agreed pilot:

| Quantity | Value |
|---|---|
| Total users | 250 (200 students + 30 supervisors + 15 coordinators + 5 admins) |
| Programmes | 4 |
| Competencies | 10 |
| Active organisations | 25 |
| Published opportunities | 40 |
| Applications | 600 |
| Placements (active + completed) | 200 |
| Hours logs | 2,500 |
| Evaluations | 300 |
| Notifications | 5,000 |
| Audit log rows | 50,000 |

Any test that asserts on a PRF target must seed a dataset of this
shape, or document why a smaller fixture is sufficient.
