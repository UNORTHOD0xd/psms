# ADR-0005 — RBAC via OpenAPI `x-required-role`

**Status:** Accepted
**Date:** 2026-05-03
**Supersedes:** none
**Implements:** CTL-04

## Context

Every endpoint in PSMS belongs to one of seven access classes:
`PUBLIC`, `ANY_AUTHENTICATED`, `STUDENT`, `SUPERVISOR`,
`COORDINATOR`, `ADMINISTRATOR`, `COORDINATOR_OR_ADMIN`. We need a
single, machine-checkable place where the access class is declared,
so that:
- A code reviewer can answer "who can call this?" without reading
  the handler.
- A new endpoint cannot be added without an explicit access decision.
- The frontend client knows what to surface in the UI without
  hard-coding role lookups.

## Decision

The OpenAPI specification (`apps/api/openapi.yaml`) is the source of
truth for endpoint access. Every operation declares its access class
via the custom extension `x-required-role`. The application
middleware enforces the same value, and a CI script
(`scripts/check-openapi-rbac.ts`) blocks merges that omit it or use
an unknown class.

**Allowed values.**
- `PUBLIC` — no session required.
- `ANY_AUTHENTICATED` — any signed-in role (incl. magic-link
  supervisor sessions).
- `STUDENT`, `SUPERVISOR`, `COORDINATOR`, `ADMINISTRATOR` — exact
  role required.
- `COORDINATOR_OR_ADMIN` — either coordinator or administrator.

**Spec-side declaration.**
```yaml
/applications/{application_id}/decision:
  post:
    tags: [applications]
    x-required-role: COORDINATOR
    ...
```

**Runtime enforcement.** Handlers register with
`requireRole('COORDINATOR')` (`apps/api/src/middleware/require-role.ts`);
the middleware reads `req.auth.role` (set by the auth-context
middleware from the session cookie or magic-link consumption) and
returns `403 Forbidden` on mismatch.

**Visibility scoping.** RBAC is a coarse class. Per-row visibility
(e.g., a student sees their own application but not another's) is
enforced inside handlers, not at the access class. Both layers are
required.

## Consequences

- **Single declaration.** A spec-handler drift on access class is a
  spec-lint failure, not a silent bug.
- **Auditable.** The audit log records `actor_role`; combined with
  the spec, every action's "who did this" is trivially answerable.
- **Frontend code generation can derive role-gated routes** from the
  generated `types.ts` — a future enhancement to the route shell
  factory.

## Alternatives considered

- **Annotation/decorator on the handler only.** Rejected: requires
  reading source to audit access. Spec-side declaration lets the
  contract serve as the access policy.
- **OAuth scopes / opaque ACL.** Rejected: overkill for four roles
  and a single-tenant pilot. We can promote to scopes later if a
  per-organisation tenancy model materialises (it won't, per
  CLAUDE.md non-goals).
- **JWT with role claim.** Rejected: PSMS uses session cookies, not
  JWTs, because the session is server-side revocable and PSMS
  needs immediate revocation on password reset and admin
  deactivation.

## Verification

- `pnpm check:openapi-rbac` runs in CI and rejects missing/invalid
  `x-required-role` values.
- `apps/api/tests/unit/role-guard.test.ts` covers the matrix of
  allowed transitions.
- Per-handler integration tests assert `403` for the wrong role and
  `200`/`201`/etc. for the right role.

## Future evolution

If a future feature requires a class not in the allowed set
(say, "either the student or the assigned supervisor"), the
recommended path is:
1. Add the class to the allowed set in
   `scripts/check-openapi-rbac.ts` and `require-role.ts`.
2. Add a unit test for the new class.
3. Document the addition in this ADR's revision history (or supersede
   this ADR with a new one if the change is structural).

Per-row checks should remain in handlers; a "scope" concept (e.g.
"this magic-link session is bound to this placement") is enforced
inside the handler against the resource being accessed, not by an
access class.
