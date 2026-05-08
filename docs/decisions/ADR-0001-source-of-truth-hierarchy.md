# ADR-0001 — Source-of-truth hierarchy

**Status:** Accepted
**Date:** 2026-05-02

## Context

PSMS has overlapping definitions for the same facts in multiple places:
the Prisma schema, the OpenAPI contract, generated TypeScript types, the
prose requirements (`docs/specs/`), and the original CMIS1202 academic
documents. Without a documented precedence, two artefacts can disagree
silently and the agent (or a human) reconciles by guessing.

## Decision

When the same fact appears in more than one place, this is the precedence
order. **Lower numbers override higher ones.** Newer files override older.

1. `packages/shared/schema.prisma` — the database schema.
2. `apps/api/openapi.yaml` — the HTTP contract.
3. `packages/shared/src/types.ts` — TypeScript types generated from
   `openapi.yaml`. Never hand-edited; regenerated with `pnpm types:generate`.
4. `docs/specs/*.md` — prose requirements. Reference, not authority.
5. `docs/coursework/*` — original CMIS1202 documents. Historical context only.

## Consequences

- **Compile-time enforcement.** Because `types.ts` is generated from the spec
  and consumed by both API and web, a divergence between handler return type
  and spec is a TypeScript error rather than a runtime bug.
- **No silent reconciliation.** If the schema and OpenAPI disagree about a
  field's nullability, the agent must stop and ask rather than pick one. The
  CLAUDE.md "When to ask for help" section codifies this.
- **Prose is reference, not contract.** The five `docs/specs/*.md` files map
  requirement IDs to implementation files. They cite the schema, not vice
  versa. If the prose disagrees with the schema, the prose is updated.

## Alternatives considered

- **OpenAPI as primary.** Rejected: a database schema has expressivity the
  HTTP contract doesn't (indexes, FK actions, triggers), and we want the
  storage representation to lead, not the wire format.
- **Single hand-written types.ts.** Rejected: types drift the moment the
  spec changes and nobody re-generates. Generation closes the loop.
