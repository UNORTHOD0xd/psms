// Opportunities integration — INP-03 (lifecycle DRAFT → PUBLISHED → CLOSED).

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  cookieFor,
  createOpportunity,
  createOrganisation,
  createUser,
  getApp,
  resetDb,
} from './_setup.js';

describe('opportunities module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('STUDENT only sees PUBLISHED opportunities, never DRAFT/CLOSED', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const student = await createUser({ role: 'STUDENT' });
    const { organisation_id } = await createOrganisation();
    await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
      status: 'DRAFT',
    });
    await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
      status: 'PUBLISHED',
    });
    await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
      status: 'CLOSED',
    });

    const cookie = await cookieFor(student);
    const res = await request(getApp())
      .get('/api/v1/opportunities')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('PUBLISHED');
  });

  it('COORDINATOR sees all statuses (DRAFT/PUBLISHED/CLOSED)', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const { organisation_id } = await createOrganisation();
    await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
      status: 'DRAFT',
    });
    await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
      status: 'PUBLISHED',
    });

    const cookie = await cookieFor(coord);
    const res = await request(getApp())
      .get('/api/v1/opportunities?pageSize=50')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('publish transitions DRAFT → PUBLISHED; cannot republish a CLOSED', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const { organisation_id } = await createOrganisation();
    const { opportunity_id } = await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
      status: 'DRAFT',
    });

    const cookie = await cookieFor(coord);
    const r1 = await request(getApp())
      .post(`/api/v1/opportunities/${opportunity_id}/publish`)
      .set('Cookie', cookie)
      .send({});
    expect(r1.status).toBe(200);
    expect(r1.body.status).toBe('PUBLISHED');

    const r2 = await request(getApp())
      .post(`/api/v1/opportunities/${opportunity_id}/close`)
      .set('Cookie', cookie)
      .send({});
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe('CLOSED');

    const r3 = await request(getApp())
      .post(`/api/v1/opportunities/${opportunity_id}/publish`)
      .set('Cookie', cookie)
      .send({});
    expect(r3.status).toBeGreaterThanOrEqual(400);
  });
});
