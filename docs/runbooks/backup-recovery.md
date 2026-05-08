# Runbook — Backup & Disaster Recovery

> Owner: Knox IT (rotated weekly).
> Audience: on-call engineer + Knox HoD.
> Reference requirements: **PRF-10** (RPO ≤ 24 h), **CTL-08** (audit log
> immutable; restore must preserve immutability), **CTL-07** (iSIMS is
> read-only — never restore over iSIMS).

---

## What we back up

| Asset | Why | Where |
|---|---|---|
| `psms` Postgres database | Authoritative state for every record | Nightly `pg_dump`, custom format |
| `psms-uploads` S3 bucket | CV PDFs, MOU PDFs, signed certificates, accreditation packs | S3 versioning + 30-day non-current expiration |
| `audit_log` table | Tamper-evident history (CTL-08) | Included in pg_dump; integrity verified post-restore |
| Repo + ADRs (this file) | Code, schema migrations, compose files | GitHub (origin + Knox internal mirror) |

What we **deliberately do not** back up:

- The iSIMS source CSV — it's the upstream's responsibility (CTL-07).
- `node_modules` or any built artefact — rebuilt on restore from the
  pinned commit + `pnpm-lock.yaml`.
- Mailpit/SendGrid event log — already mirrored in
  `NotificationDeliveryEvent` rows.

---

## Backup schedule

| Frequency | What | Retention |
|---|---|---|
| Nightly 02:30 local | `pg_dump -Fc` to S3 backup bucket | 7 daily + 4 weekly |
| Continuous | S3 bucket versioning on `psms-uploads` | 30 days non-current, 1 year on certificates |
| Weekly Sunday 03:30 | `pg_dump --schema-only` + `prisma migrate status` to repo | Indefinite (audit) |
| Quarterly | Full DR drill (see § Drill procedure) | Drill outcome filed at `docs/runbooks/dr-drill-YYYY-MM.md` |

Cron lines (host-side, runs as the `psms-backup` user):

```cron
30 2 * * *  /usr/local/bin/psms-backup-nightly.sh >> /var/log/psms/backup.log 2>&1
30 3 * * 0  /usr/local/bin/psms-backup-schema.sh >> /var/log/psms/backup.log 2>&1
```

The two scripts are tracked in `scripts/ops/` and treat S3 as the source
of truth for retention — they upload, then prune locally; the bucket
lifecycle policy enforces retention server-side.

---

## Backup procedure (nightly)

```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date -u +%Y%m%dT%H%M%SZ)
DUMP=/var/lib/psms/backups/psms-${TS}.dump
docker compose -f /etc/psms/docker-compose.prod.yml exec -T postgres \
  pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" > "$DUMP"
sha256sum "$DUMP" > "$DUMP.sha256"
aws s3 cp "$DUMP"        "s3://psms-backups/db/$TS/psms.dump"
aws s3 cp "$DUMP.sha256" "s3://psms-backups/db/$TS/psms.dump.sha256"
# Retain 14 days locally; bucket lifecycle handles the rest.
find /var/lib/psms/backups -name 'psms-*.dump*' -mtime +14 -delete
```

The bucket has Object Lock in compliance mode for the most-recent 24h
window, so an attacker who gains write access cannot backdate-delete
last night's backup.

---

## Restore procedure (production database)

> **Tested in the most recent quarterly drill — see the dated runbook
> in `docs/runbooks/dr-drill-*.md` for the actual elapsed times.**

1. **Decide whether to restore in-place or to a new host.** In-place
   only if the current Postgres data volume is corrupt; otherwise
   prefer a sidecar restore so we can compare before cutting over.
2. **Stop the API** so no new writes land on a half-restored DB:
   ```bash
   docker compose -f /etc/psms/docker-compose.prod.yml stop api web
   ```
3. **Identify the dump.** Pick the most recent SHA-verified dump in
   `s3://psms-backups/db/`:
   ```bash
   aws s3 ls s3://psms-backups/db/ | tail -3
   aws s3 cp s3://psms-backups/db/<TS>/psms.dump /tmp/restore.dump
   aws s3 cp s3://psms-backups/db/<TS>/psms.dump.sha256 /tmp/
   ( cd /tmp && sha256sum -c psms.dump.sha256 )
   ```
4. **Drop and recreate the target DB.** This is destructive — confirm
   the dump verifies first:
   ```bash
   docker compose exec -T postgres \
     psql -U "$POSTGRES_USER" -d postgres \
       -c "DROP DATABASE IF EXISTS psms_restore; CREATE DATABASE psms_restore OWNER $POSTGRES_USER;"
   ```
5. **Restore.** Use `pg_restore --jobs=4` for speed:
   ```bash
   docker compose exec -T postgres \
     pg_restore -U "$POSTGRES_USER" -d psms_restore --jobs=4 /tmp/restore.dump
   ```
6. **Verify schema parity.** The migrations table must match the
   currently-deployed migrations:
   ```bash
   pnpm prisma migrate status --schema packages/shared/schema.prisma
   ```
7. **Verify audit-log immutability.** Run a smoke that asserts the
   immutability triggers exist (re-run the `audit_log_immutable`
   migration is a no-op if the triggers are present):
   ```bash
   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d psms_restore -c "
     SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'audit_log'::regclass AND tgname LIKE 'audit_log_%';"
   ```
8. **Cut over.** Rename the DB:
   ```bash
   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c "
     ALTER DATABASE psms RENAME TO psms_old;
     ALTER DATABASE psms_restore RENAME TO psms;"
   ```
9. **Restart the stack.**
   ```bash
   docker compose -f /etc/psms/docker-compose.prod.yml up -d api web
   ```
10. **Smoke** the four user roles by signing in as a known test account
    per role and exercising the dashboard route. Capture the timestamps
    in the incident ticket.
11. **Drop `psms_old`** only after 48 hours of stable operation.

### RTO

| Step | Expected wall time |
|---|---|
| Decision + dump retrieval | 5 min |
| Drop + restore (5,000 placements) | 10 min |
| Verification | 5 min |
| Cutover + smoke | 5 min |
| **Total RTO** | **≤ 30 min** for typical pilot scale |

---

## Restore procedure (object storage)

S3 bucket versioning is the primary protection. Recovery from accidental
delete/overwrite:

```bash
# List versions of a single object
aws s3api list-object-versions --bucket psms-uploads --prefix certificates/<id>.pdf

# Restore a specific version
aws s3api copy-object --bucket psms-uploads --key certificates/<id>.pdf \
  --copy-source psms-uploads/certificates/<id>.pdf?versionId=<version>
```

Catastrophic bucket loss is recovered from cross-account replication
(target account `psms-dr`, in a separate region). Replication is
configured in `infrastructure/s3-replication.tf` (Phase 2 — currently a
runbook gap; tracked as **risk RIS-04** in PLAN.md).

---

## DR drill procedure (quarterly)

1. Spin up an isolated VM with the same image as production.
2. Run the **Restore procedure** above against the most recent dump.
3. Run the integration smoke suite:
   ```bash
   pnpm test:integration
   ```
4. Record:
   - Timestamp of dump used,
   - Wall time per step,
   - Any deviations from the procedure,
   - Total RTO,
   - Open follow-up actions.
5. File the result at `docs/runbooks/dr-drill-YYYY-MM.md` and
   reference it from the next pilot status report.

A drill is **failed** if RTO exceeds 30 min, integration smoke fails,
or audit-log triggers are missing. A failure raises a P1 incident
against Knox IT.

---

## Contact tree on a production data incident

1. On-call engineer (PagerDuty rotation `psms-oncall`).
2. Knox HoD (ICT).
3. Knox Registrar (only if student-facing data is affected — they own
   the comms with affected students).
4. Knox Legal — only if an unauthorised disclosure has occurred.

Do not communicate externally before step 4 has either approved or
explicitly waived the comms requirement.
