// Organisations integration — INP-02 (registry), CTL-04 (RBAC).

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  cookieFor,
  createOrganisation,
  createUser,
  getApp,
  getPrisma,
  resetDb,
} from './_setup.js';

const newOrgPayload = (overrides: Record<string, unknown> = {}) => ({
  name: 'New Acme',
  type: 'EMPLOYER',
  industry_sector: 'Technology',
  primary_contact_name: 'Jane Doe',
  primary_contact_email: 'jane@acme.test',
  primary_contact_phone: '+1-876-555-0199',
  mou_on_file: false,
  ...overrides,
});

describe('orgs module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('STUDENT cannot list organisations (RBAC, CTL-04)', async () => {
    const student = await createUser({ role: 'STUDENT' });
    const cookie = await cookieFor(student);

    const res = await request(getApp())
      .get('/api/v1/organisations')
      .set('Cookie', cookie);

    expect(res.status).toBe(403);
  });

  it('COORDINATOR can register a new organisation (PENDING by default)', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const cookie = await cookieFor(coord);

    const res = await request(getApp())
      .post('/api/v1/organisations')
      .set('Cookie', cookie)
      .send(newOrgPayload());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.organisation_id).toBeDefined();
  });

  it('GET /organisations paginates and filters by status', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const cookie = await cookieFor(coord);
    await createOrganisation({ status: 'ACTIVE' });
    await createOrganisation({ status: 'PENDING' });
    await createOrganisation({ status: 'ACTIVE' });

    const res = await request(getApp())
      .get('/api/v1/organisations?status=ACTIVE&pageSize=10')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((o: { status: string }) => o.status === 'ACTIVE')).toBe(true);
  });

  it('approve transitions PENDING → ACTIVE and writes an audit row (CTL-08)', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const cookie = await cookieFor(coord);
    const { organisation_id } = await createOrganisation({ status: 'PENDING' });

    const res = await request(getApp())
      .post(`/api/v1/organisations/${organisation_id}/approve`)
      .set('Cookie', cookie)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');

    const audit = await getPrisma().auditLog.findFirst({
      where: { resource_type: 'Organisation', resource_id: organisation_id },
    });
    expect(audit).not.toBeNull();
  });
});
