# End-to-end tests

One Playwright spec per UAT scenario from the *System Testing Document*
(CMIS1202 Unit 8). These run against a seeded build and are the agent's
acceptance criterion when implementing user-facing flows.

## Conventions

- File name: `<role>.<flow>.spec.ts`, e.g. `student.apply-and-log-hours.spec.ts`.
- Each spec opens with a JSDoc comment listing the requirement IDs it
  exercises (`INP-04`, `PRC-02`, `OUT-04`, …).
- Tests do not stub the API. They drive the real running stack.

## Planned scenarios

- [ ] `student.sign-in-and-browse.spec.ts` — INP-09, INP-03
- [ ] `student.apply-and-track.spec.ts` — INP-04, PRC-02
- [ ] `student.log-hours.spec.ts` — INP-08, PRC-04
- [ ] `supervisor.magic-link-onboarding.spec.ts` — PRC-03
- [ ] `supervisor.approve-hours.spec.ts` — INP-08, PRC-04
- [ ] `supervisor.submit-final-evaluation.spec.ts` — INP-06, PRC-08, PRC-06
- [ ] `coordinator.approve-application.spec.ts` — INP-04, INP-05, PRC-07
- [ ] `coordinator.dashboard.spec.ts` — OUT-02, PRC-09
- [ ] `coordinator.accreditation-pack.spec.ts` — PRC-10, OUT-06
- [ ] `admin.audit-log.spec.ts` — OUT-09
- [ ] `public.verify-certificate.spec.ts` — OUT-08
