# ADR-0003 — Magic-link TTL, active-link cap, and salting

**Status:** Accepted
**Date:** 2026-05-03
**Supersedes:** none
**Implements:** PRC-03, CTL-02

## Context

External supervisors are not Knox-authenticated and never receive a
Knox account. They authenticate via email magic links bound to a
single placement. We need to set a TTL, an active-link cap, and a
storage scheme that is safe against credential theft and reuse.

## Decision

- **Token shape.** 32 bytes from `crypto.randomBytes`, encoded
  base64url (43 URL-safe characters, no padding). Embedded in the
  email URL as a query parameter `token=...`.
- **Storage.** Persist `sha256(salt || raw_token)` plus the salt.
  The raw token is **never** persisted, logged, or echoed in any
  response except the immediate issuance call (which inlines it
  into the outbound email and discards the variable).
- **TTL.** 24 hours from issuance. Configurable via
  `MAGIC_LINK_TTL_HOURS` (default 24).
- **Cap.** A supervisor may have at most 3 unconsumed unexpired
  links at any time. Configurable via
  `MAGIC_LINK_MAX_ACTIVE_PER_SUPERVISOR` (default 3). Issuing a 4th
  returns `429 Too Many Requests` to the originating endpoint.
- **Single use.** Consumption is atomic
  (`updateMany ... where consumed_at IS NULL`); the second consumer
  sees `410 Gone`.
- **Issuance rate-limit.** A coordinator may issue up to
  `RATE_LIMIT_MAGICLINK_ISSUE_PER_HOUR` magic links per hour (default
  20). Independent of the per-supervisor cap; protects the endpoint.
- **Scope.** Each token records its `purpose` (`ONBOARDING`,
  `HOURS_APPROVAL`, `EVALUATION_MIDTERM`, `EVALUATION_FINAL`) and a
  `placement_id`. The session minted on consumption carries
  `scope_placement_id`; routes that act on a placement assert the
  request's scope matches.

## Why these numbers

- **24 hours** is long enough to absorb supervisor inboxes that are
  not checked overnight or over a Jamaica public holiday weekend
  (PRF-06 measures delivery latency, not consumption latency), and
  short enough that a leaked email/SMS thread does not yield an
  indefinite credential. Halving to 12 h was considered; the support
  cost of expired links during pilot rollout dominated.
- **3 active links** balances "supervisor onboarding + a couple of
  pending tasks at once" against "one stolen mailbox does not yield
  unbounded session minting." The cap is per supervisor, not per
  coordinator-supervisor pair, so a single supervisor cannot be
  flooded by misuse from multiple coordinators.
- **Salted SHA-256, not unsalted.** Two issuances of "the same"
  conceptual token (low-entropy collision) produce different hashes
  because the salt is per-token. This is belt-and-braces — 32 bytes
  of randomness already makes collisions astronomically unlikely —
  but the salt also blocks a precomputed-rainbow-table attack on a
  leaked DB (irrelevant for 32-byte tokens; relevant if a future
  change ever shortens them).

## Consequences

- **No password recovery flow** for supervisors. They never have a
  password. Re-issuance is the only path; coordinator initiates from
  the application or hours-approval queue.
- **Session scoping.** A magic-link session cannot be reused across
  placements; the supervisor needs a separate link per placement.
  This is by design — it's the simplest way to enforce least
  privilege without a full ACL system.
- **Auditability.** Every issuance and consumption writes an
  `audit_log` entry; coordinators can see the full lifecycle of a
  link without seeing its raw value.

## Alternatives considered

- **OAuth via a third-party identity provider (Google, Microsoft).**
  Rejected for the pilot: most external supervisors are SMEs or
  individual professionals who may not have a managed account; we
  would force them through a sign-up flow they don't want.
- **HMAC of (raw_token, server_secret).** Rejected: a single secret
  rotates badly; per-token salt is the same security property
  without the rotation pain.
- **Longer TTLs (7 days).** Rejected: lengthens the blast radius of
  a leaked email thread.
- **Reusable tokens within TTL.** Rejected: single-use is the
  cheapest way to defeat replay.

## Verification

- `apps/api/tests/unit/magic-link-hash.test.ts` covers hash
  determinism, salt independence, and that two issuances of the
  same conceptual link produce different hashes.
- Integration tests (Phase 1 backlog) cover the cap (4th issuance
  → 429), TTL boundary (T-0+24h-1s succeeds, T-0+24h+1s fails as
  410), and atomic single-use under concurrent consumers.
