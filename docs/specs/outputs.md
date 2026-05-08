# Output Requirements (OUT-01 — OUT-10)

The artefacts the system produces, who consumes them, how they're
formatted, how often they refresh, and how long they persist.

## Index

| ID | Title | Implemented by |
|---|---|---|
| OUT-01 | Student dashboard | `apps/web/src/features/student/` |
| OUT-02 | Coordinator operational dashboard | `GET /reports/coordinator-dashboard`, PRC-09 |
| OUT-03 | Supervisor task list | `apps/web/src/features/supervisor/` |
| OUT-04 | Signed completion certificate | PRC-06 |
| OUT-05 | Notification email templates | `apps/api/src/modules/notifications/templates/` |
| OUT-06 | UCJ accreditation evidence pack | `POST /reports/accreditation-pack`, PRC-10 |
| OUT-07 | Placement transcript | `apps/api/src/modules/reports/transcript.ts` |
| OUT-08 | Public certificate verification page | `GET /certificates/verify/:id` |
| OUT-09 | Audit-log export | `GET /reports/audit-log` |
| OUT-10 | Hours-shortfall early-warning report | `GET /reports/hours-shortfall` |

---

## OUT-01 — Student dashboard

**Recipient.** `STUDENT`.

**Format.** Web view at `/student/dashboard`. Composed of:
- Active placement summary (organisation, supervisor, start/end,
  approved hours, hours remaining).
- Recent hours-log decisions (last 5).
- Top-3 recommended opportunities (`GET /me/recommendations?n=3`).
- Eligibility banner (PRC-05 status + reasons).
- Notifications inbox preview (`GET /me/notifications?pageSize=5`).
- Certificate links if any have been issued.

**Refresh cadence.** Per-page-load + TanStack Query staleTime of 30 s
for live widgets; manual refresh button.

**Retention.** Live view; nothing persisted client-side beyond
TanStack's in-memory cache. No `localStorage` per CLAUDE.md.

**A11y.** Full keyboard navigation; ARIA-labelled regions per widget;
visible focus states.

---

## OUT-02 — Coordinator operational dashboard

**Recipient.** `COORDINATOR_OR_ADMIN`.

**Source.** `GET /reports/coordinator-dashboard` (PRC-09).

**Format.** JSON for the API; web view at `/coordinator/dashboard`
renders cards for:
- Active placements
- Pending hours-log approvals
- Evaluations due (midterm + final)
- Students at risk (PRC-09 definition)
- Opportunity status breakdown (DRAFT / PUBLISHED / CLOSED)
- Applications awaiting decision

**Refresh cadence.** Polled every 60 s (deliberately not real-time —
CLAUDE.md non-goal). Manual refresh button.

**Retention.** Live; no historical snapshots persisted beyond
audit-log evidence. (Trends are derived ad-hoc from the audit log if
needed.)

**Performance.** Must satisfy PRF-07 (≤ 2 s p95).

---

## OUT-03 — Supervisor task list

**Recipient.** `SUPERVISOR` (Knox-unauthenticated; magic-link
sessions only).

**Format.** Web view at `/supervisor` (post magic-link consume).
Single page with two sections:
- **Hours awaiting approval** — table of pending `hours_log` rows
  for the placement, with one-click approve / decline (modal for
  decline reason).
- **Evaluations due** — links to MIDTERM and FINAL forms when
  applicable.

**Session scope.** The supervisor's session is bound to one
`placement_id` (CTL-10 scoping); they cannot see other placements
even if they supervise multiple — they get one magic-link per
placement.

**Refresh cadence.** Per-page-load.

**Retention.** Session is HttpOnly cookie + 8-hour idle timeout.

**A11y.** Forms have visible labels; large click targets; the
decline-reason modal is focus-trapped.

---

## OUT-04 — Signed completion certificate

**Recipient.** `STUDENT` (download), `COORDINATOR` (review/regenerate),
`ADMINISTRATOR` (revoke), public verifier (via OUT-08).

**Format.** A4 single-page PDF.

**Content.**
- Knox CC header / logo placeholder.
- Student full name.
- Programme name and code.
- Total approved service hours.
- Composite evaluation rating (PRC-08).
- Host organisation name.
- Placement start and end dates.
- Certificate ID (UUID) printed in the footer.
- QR code linking to `OUT-08`'s public verification page.
- Issue date.
- Coordinator/HoD signature line (printed; not digitally signed by a
  human — the Ed25519 signature is the integrity guarantee).

**Cryptographic assurance.**
- `signature_hash = sha256(pdf_bytes)`.
- `signature` = base64 Ed25519 over `signature_hash`.
- Public key exposed at `GET /certificates/public-key`.

**Storage.** Object key `certificates/{certificate_id}.pdf` in the
configured bucket. Read URL is pre-signed and refreshed on access by
`GET /certificates/:id/pdf`.

**Refresh cadence.** Generated once on FINAL evaluation; regenerated
explicitly via `POST /certificates/:id/regenerate`.

**Retention.** Indefinite for the pilot; revoked certificates are
flagged but not deleted.

---

## OUT-05 — Notification email templates

**Recipient.** Whichever role the email targets.

**Format.** Subject + plain-text + HTML body, rendered by
`apps/api/src/modules/notifications/templates/`. Shared layout in
`_layout.ts` provides Knox header and footer.

**Templates.**
- `magic-link` — supervisor onboarding / hours-approval / evaluation
  prompt.
- `password-reset` — Knox account password reset.
- `application-decision` — APPROVE or DECLINE outcome to student.
- `hours-decision` — APPROVE or REJECT outcome to student.
- `evaluation-reminder` — supervisor reminder; also used as
  student-facing "evaluation received" notice.
- `certificate-issued` — student-facing notice with PDF link.

**Refresh cadence.** Sent on demand by handlers. SendGrid status
events are appended to `notification_delivery_event`; the
`notification.status` field reflects the latest terminal state
(`DELIVERED`, `BOUNCED`, `FAILED`).

**Retention.** `notification` rows: 24 months (rotated by an offline
job once the pilot graduates from the prototype phase).
`notification_delivery_event`: 90 days.

**PII handling (CTL-05).** Template parameters are stored in
`body_params` JSONB; the logger redacts these. Email addresses live on
the `notification` row but are never logged in plain text.

---

## OUT-06 — UCJ accreditation evidence pack

**Recipient.** `COORDINATOR_OR_ADMIN`. Final consumer is the
University Council of Jamaica accreditation review.

**Format.** ZIP archive containing:
- `placements.csv`
- `organisations.csv`
- `evaluations.csv`
- `hours_summary.csv`
- `cover.pdf`

CSVs are RFC 4180 compliant (CRLF line endings, fields containing
commas/quotes/newlines are double-quoted).

**Refresh cadence.** On demand. The endpoint is async (`202` with
`pack_id`); see PRC-10.

**Retention.** 24 months; storage lifecycle removes packs after.

**Idempotency.** The endpoint accepts `Idempotency-Key`; identical
key + payload returns the original `pack_id`.

---

## OUT-07 — Placement transcript

**Recipient.** `STUDENT` (own only) or `COORDINATOR_OR_ADMIN` (any
student).

**Format.** PDF, multi-page if needed.

**Content.**
- Student profile header (name, programme, student_id).
- Per-placement section: organisation, opportunity title, dates,
  total approved hours, composite rating.
- Audit summary: list of all FINAL evaluations.
- Generated date and the requesting user's role (for traceability).

**Source.** `GET /students/:user_id/transcript` (proposed) — single
synchronous request; size is bounded by placement count (≤ 5 typical).

**Refresh cadence.** Generated on demand; not cached.

**Retention.** Not persisted server-side; streamed straight to the
caller. The audit log records the request.

---

## OUT-08 — Public certificate verification page

**Recipient.** Any third party (employers, evaluators).

**Format.** Web page at `/verify/:certificate_id`. Calls
`GET /certificates/verify/:id` (PUBLIC).

**Content (response shape).**
```json
{
  "valid": true,
  "student_name": "Jane Bourne",
  "programme_name": "BSc Computer Science",
  "organisation_name": "Acme Ltd.",
  "issued_at": "2026-08-01T12:00:00Z",
  "revoked": false,
  "revoked_at": null,
  "signature_hash": "5c1a..."
}
```
The page also offers a "download original PDF" link via
`GET /certificates/:id/pdf` and a "verify signature offline" snippet
that shows how to combine the public key (from
`GET /certificates/public-key`) with `signature_hash` and `signature`.

**Refresh cadence.** Live.

**Retention.** Verification responses are not cached client- or
server-side beyond standard HTTP caching headers (we explicitly send
`Cache-Control: no-store`).

**PII rule.** Only the fields above are exposed publicly. Narratives,
hours logs, and evaluations are never returned by this endpoint.

---

## OUT-09 — Audit-log export

**Recipient.** `ADMINISTRATOR`.

**Format.**
- `Accept: application/json` → paginated JSON
  (`{ data, page, pageSize, total }`).
- `Accept: text/csv` → streaming CSV download.

**Filters.**
- `from`, `to` (timestamps).
- `actor_user_id`, `actor_role`.
- `action`, `resource_type`, `resource_id`.

**Refresh cadence.** Live read-through; the audit log itself is
append-only (CTL-08).

**Retention.** Indefinite for the pilot. A retention window will be
defined once the pilot accreditation requirements are confirmed.

**PII rule.** Audit log stores `before` / `after` JSON snapshots
exactly as written by handlers; some entries contain user emails or
names. Export is admin-only and rate-limited; all exports themselves
generate an audit entry (`audit-log.export`).

---

## OUT-10 — Hours-shortfall early-warning report

**Recipient.** `COORDINATOR_OR_ADMIN`.

**Format.** Paginated JSON; CSV export available.

**Content.** One row per at-risk student:
```
student_id, full_name, programme_code, hours_required,
approved_hours, hours_remaining, placement_end_date,
days_until_placement_ends, percent_complete
```

**Definition of "at risk".**
- `percent_complete = approved_hours / hours_required`.
- A student is in scope if **all** of:
  - `placement.status = ACTIVE`,
  - `placement.end_date - today ≤ N days` (default `N = 60`,
    overridable via `?days=`),
  - `percent_complete < threshold` (default 0.5, overridable via
    `?threshold=`).

**Refresh cadence.** On demand. Coordinator dashboard surfaces a count
(PRC-09) and links here for the detail.

**Retention.** Not persisted; pure query result.

**Use case.** Drives a coordinator's outreach: which students need a
nudge or schedule adjustment before the placement window closes.
