// Evaluations integration — INP-06, PRC-08 (composite rating), and the
// FINAL-evaluation side effect that lifts a placement to COMPLETED and
// triggers certificate generation (PRC-06).

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  cookieFor,
  createOpportunity,
  createOrganisation,
  createPlacement,
  createUser,
  getApp,
  getPrisma,
  resetDb,
} from './_setup.js';

describe('evaluations module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('FINAL evaluation populates composite_rating and lifts placement to COMPLETED', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const student = await createUser({ role: 'STUDENT' });
    const supervisor = await createUser({ role: 'SUPERVISOR' });
    const { organisation_id } = await createOrganisation();
    const { opportunity_id } = await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
      required_competencies: ['PROG-WEB', 'SOFT-COMM'],
    });
    const { placement_id } = await createPlacement({
      student_user_id: student.user_id,
      supervisor_user_id: supervisor.user_id,
      opportunity_id,
    });

    // Seed approved hours so eligibility is ELIGIBLE on completion.
    const p = getPrisma();
    await p.hoursLog.create({
      data: {
        placement_id,
        student_user_id: student.user_id,
        week_number: 1,
        date: new Date(),
        hours: 60,
        activity_narrative: 'Bulk approved hours so eligibility passes for the test.',
        status: 'APPROVED',
        approved_at: new Date(),
        approved_by_supervisor_id: supervisor.user_id,
      },
    });

    const cookie = await cookieFor(supervisor, { scope_placement_id: placement_id });
    const competencies = await p.competency.findMany({
      where: { competency_code: { in: ['PROG-WEB', 'SOFT-COMM'] } },
    });
    const res = await request(getApp())
      .post(`/api/v1/placements/${placement_id}/evaluations`)
      .set('Cookie', cookie)
      .send({
        type: 'FINAL',
        attendance_rating: 5,
        professionalism_rating: 4,
        competency_ratings: competencies.map((c) => ({
          competency_id: c.competency_id,
          rating: 4,
        })),
        narrative: 'Strong final-week performance and clear communication throughout.',
        recommend_future: true,
      });
    expect(res.status).toBe(201);

    const placement = await p.placement.findUniqueOrThrow({ where: { placement_id } });
    expect(placement.status).toBe('COMPLETED');
    expect(Number(placement.composite_rating)).toBeGreaterThan(0);
  });
});
