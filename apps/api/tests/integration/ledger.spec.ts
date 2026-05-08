// Ledger integration — PRC-04 (approved-hours sum), PRC-05 (eligibility).

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

describe('ledger module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('GET /me/ledger sums APPROVED hours only, ignores PENDING and REJECTED', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const student = await createUser({ role: 'STUDENT' });
    const supervisor = await createUser({ role: 'SUPERVISOR' });
    const { organisation_id } = await createOrganisation();
    const { opportunity_id } = await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
    });
    const { placement_id } = await createPlacement({
      student_user_id: student.user_id,
      supervisor_user_id: supervisor.user_id,
      opportunity_id,
    });

    const p = getPrisma();
    await p.hoursLog.createMany({
      data: [
        {
          placement_id,
          student_user_id: student.user_id,
          week_number: 1,
          date: new Date(),
          hours: 10,
          activity_narrative: 'Approved log',
          status: 'APPROVED',
          approved_at: new Date(),
          approved_by_supervisor_id: supervisor.user_id,
        },
        {
          placement_id,
          student_user_id: student.user_id,
          week_number: 2,
          date: new Date(Date.now() + 7 * 86400_000),
          hours: 5,
          activity_narrative: 'Pending log',
          status: 'PENDING',
        },
        {
          placement_id,
          student_user_id: student.user_id,
          week_number: 3,
          date: new Date(Date.now() + 14 * 86400_000),
          hours: 3,
          activity_narrative: 'Rejected log',
          status: 'REJECTED',
        },
      ],
    });

    const cookie = await cookieFor(student);
    const res = await request(getApp())
      .get('/api/v1/me/ledger')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Number(res.body.approved_hours)).toBe(10);
  });

  it('GET /me/eligibility returns ELIGIBLE when approved_hours >= required', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const student = await createUser({ role: 'STUDENT' });
    const supervisor = await createUser({ role: 'SUPERVISOR' });
    const { organisation_id } = await createOrganisation();
    const { opportunity_id } = await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
    });
    const { placement_id } = await createPlacement({
      student_user_id: student.user_id,
      supervisor_user_id: supervisor.user_id,
      opportunity_id,
    });

    const p = getPrisma();
    await p.hoursLog.create({
      data: {
        placement_id,
        student_user_id: student.user_id,
        week_number: 1,
        date: new Date(),
        hours: 130, // >= ICT-DIP hours_required (120)
        activity_narrative: 'Big chunk of approved hours',
        status: 'APPROVED',
        approved_at: new Date(),
        approved_by_supervisor_id: supervisor.user_id,
      },
    });

    const cookie = await cookieFor(student);
    const res = await request(getApp())
      .get('/api/v1/me/eligibility')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ELIGIBLE');
  });
});
