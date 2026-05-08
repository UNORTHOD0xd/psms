# ADR-0002 — Matching scorer weights

**Status:** Accepted
**Date:** 2026-05-03
**Supersedes:** none
**Implements:** PRC-02

## Context

PSMS recommends opportunities to students and ranks applications for
coordinator review using a rule-based scorer in
`packages/shared/src/matching.ts`. The composite score combines four
factors (`competency_overlap`, `programme_match`, `availability_fit`,
`freshness`). We need a defensible, stable choice of weights that
sums to exactly 1.

We deliberately avoid an embedding-based / ML matcher for the pilot
(CLAUDE.md "Things this project deliberately does NOT do"); that is
a Phase-2 problem.

## Decision

Use the following weights:

| Factor | Weight |
|---|---|
| `competency_overlap` | 0.40 |
| `programme_match` | 0.25 |
| `availability_fit` | 0.20 |
| `freshness` | 0.15 |

Encoded in `WEIGHTS` in `matching.ts:13` and asserted to sum to 1 at
module load.

## Why these numbers

- **Competency_overlap (0.40)** is the largest weight because the
  pilot's stated goal is to put students into placements where they
  already have a foothold in the required skills, with proficiency
  scaling the contribution. A near-zero competency match should
  meaningfully suppress an opportunity even if the other factors are
  perfect.
- **Programme_match (0.25)** is binary (0 or 1). Programme is treated
  as a hard rule expressed in the policy: students outside the
  eligible set should not be matched, regardless of any other
  factor. We give it 0.25 because the binary nature already creates
  a steep cliff; a higher weight would dominate the composite.
- **Availability_fit (0.20)** captures whether the placement can
  finish before graduation with sensible buffer. It is moderate
  weight because date constraints matter but are usually a yes/no
  rather than a fine gradient.
- **Freshness (0.15)** discourages students from applying to old
  opportunities that may already be filled or stale, and rewards
  coordinators who keep the listings current. Smallest weight
  because freshness is operational, not student-fit.

The weights are documented as "agreed targets" rather than
"empirically tuned" — we have no historical data yet. Phase-2 work
may revisit them once we observe real applications.

## Consequences

- **Stable rankings.** The ordering produced by PRC-02 is
  deterministic for a fixed `now`, which is what e2e UAT scripts
  rely on (`tests/e2e/student.apply-and-track.spec.ts`).
- **Explainability.** The factor breakdown is returned alongside the
  composite, so the coordinator UI can justify a ranking ("matched
  on programme, 80% competency overlap, opportunity is 6 days old").
- **Easy revision.** Changing weights requires editing `WEIGHTS` and
  bumping a version constant, with a migration plan for any cached
  `score_snapshot` rows. The scorer is pure, so re-scoring is
  cheap (a Postgres select + an in-memory map).

## Alternatives considered

- **Equal weights (0.25 each).** Rejected: makes the scorer
  insensitive to the strongest fit signals.
- **Embedding cosine similarity.** Rejected for the pilot
  (CLAUDE.md explicit non-goal); would require a vector store and a
  competency taxonomy mapping that we don't have.
- **Hard-rule chain instead of composite.** Rejected: binary cliffs
  produce too many ties at the top, leaving the coordinator to
  break them manually.

## Verification

`packages/shared/tests/matching.test.ts` covers each factor in
isolation and asserts known fixtures yield expected scores. The
weight-sum invariant is enforced at module load.
