// Placements integration — INP-05 (hours logs), INP-08 (site visits),
// PRC-04 (hours approval ledger), CTL-09 (idempotency on hours).

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  cookieFor,
  createOpportunity,
  createOrganisation,
  createPlacement,
  createUser,
  getApp,
  resetDb,
} from './_setup.js';

describe('placements module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('student logs hours; the row appears in PENDING for the supervisor (INP-05)', async () => {
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

    const studentCookie = await cookieFor(student);
    const res = await request(getApp())
      .post(`/api/v1/placements/${placement_id}/hours`)
      .set('Cookie', studentCookie)
      .send({
        week_number: 1,
        date: new Date().toISOString().slice(0, 10),
        hours: 8.5,
        activity_narrative:
          'Implemented the user-list table component, with filtering and pagination.',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');

    const supCookie = await cookieFor(supervisor, { scope_placement_id: placement_id });
    const list = await request(getApp())
      .get(`/api/v1/placements/${placement_id}/hours?status=PENDING`)
      .set('Cookie', supCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);
  });

  it('CTL-09 — same Idempotency-Key replays the same response', async () => {
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

    const cookie = await cookieFor(student);
    const key = '11111111-2222-4333-8444-555555555555';
    const body = {
      week_number: 2,
      date: new Date().toISOString().slice(0, 10),
      hours: 4,
      activity_narrative: 'Wrote tests for the supervisor inbox screen.',
    };

    const r1 = await request(getApp())
      .post(`/api/v1/placements/${placement_id}/hours`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send(body);
    expect(r1.status).toBe(201);

    const r2 = await request(getApp())
      .post(`/api/v1/placements/${placement_id}/hours`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send(body);
    expect(r2.status).toBe(201);
    expect(r2.body.log_id).toBe(r1.body.log_id);
  });

  it('coordinator records a site visit (INP-08)', async () => {
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

    const cookie = await cookieFor(coord);
    const res = await request(getApp())
      .post(`/api/v1/placements/${placement_id}/site-visits`)
      .set('Cookie', cookie)
      .send({
        visit_date: new Date().toISOString().slice(0, 10),
        narrative:
          'Visited the host site, observed the student in standup, met the supervisor.',
        overall_assessment: 'SATISFACTORY',
        follow_up_actions: [
          {
            action: 'Schedule a follow-up review in two weeks',
            due_date: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10),
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.note_id).toBeDefined();
  });
});
