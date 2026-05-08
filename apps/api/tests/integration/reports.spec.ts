// Reports integration — PRC-09 dashboard, PRC-10 accreditation pack,
// OUT-07 transcript, OUT-09 audit log, OUT-10 hours shortfall.

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

describe('reports module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('coordinator dashboard returns the documented shape (PRC-09)', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const cookie = await cookieFor(coord);

    const res = await request(getApp())
      .get('/api/v1/reports/coordinator-dashboard')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('active_placements');
    expect(res.body).toHaveProperty('pending_applications');
    expect(res.body).toHaveProperty('students_at_risk');
  });

  it('STUDENT cannot read another student\'s transcript (RBAC)', async () => {
    const a = await createUser({ role: 'STUDENT' });
    const b = await createUser({ role: 'STUDENT' });

    const cookie = await cookieFor(a);
    const res = await request(getApp())
      .get(`/api/v1/students/${b.user_id}/transcript`)
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('audit-log export accepts CSV (OUT-09)', async () => {
    const admin = await createUser({ role: 'ADMINISTRATOR' });
    const cookie = await cookieFor(admin);

    const res = await request(getApp())
      .get('/api/v1/reports/audit-log')
      .set('Cookie', cookie)
      .set('Accept', 'text/csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('hours-shortfall returns CSV with the documented header columns', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const supervisor = await createUser({ role: 'SUPERVISOR' });
    const student = await createUser({ role: 'STUDENT' });
    const { organisation_id } = await createOrganisation();
    const { opportunity_id } = await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
    });
    await createPlacement({
      student_user_id: student.user_id,
      supervisor_user_id: supervisor.user_id,
      opportunity_id,
    });

    const cookie = await cookieFor(coord);
    const res = await request(getApp())
      .get('/api/v1/reports/hours-shortfall?days=60&threshold=0.5')
      .set('Cookie', cookie)
      .set('Accept', 'text/csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')[0]).toContain('student_id');
  });
});
