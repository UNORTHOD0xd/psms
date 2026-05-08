// Certificates integration — PRC-06 (generate), CTL-06 (Ed25519 sign),
// OUT-04 (PDF), OUT-08 (public verification).

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

describe('certificates module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('GET /certificates/public-key serves the PEM SPKI without auth', async () => {
    const res = await request(getApp()).get('/api/v1/certificates/public-key');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/BEGIN PUBLIC KEY/);
  });

  it('verify endpoint returns NOT_FOUND on an unknown UUID', async () => {
    const res = await request(getApp()).get(
      '/api/v1/certificates/verify/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NOT_FOUND');
    expect(res.body.valid).toBe(false);
  });

  it('regenerate is COORDINATOR_OR_ADMIN; STUDENT receives 403', async () => {
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
      status: 'COMPLETED',
    });

    // Seed a placeholder certificate row directly so the endpoint
    // has something to operate on.
    const cert = await getPrisma().certificate.create({
      data: {
        placement_id,
        student_user_id: student.user_id,
        pdf_url: 'https://files.test/cert.pdf',
        qr_code_url: 'https://files.test/cert.qr.png',
        signature: 'sig-placeholder',
        signature_hash: 'hash-placeholder',
        issued_at: new Date(),
      },
    });

    const studentCookie = await cookieFor(student);
    const r1 = await request(getApp())
      .post(`/api/v1/certificates/${cert.certificate_id}/regenerate`)
      .set('Cookie', studentCookie);
    expect(r1.status).toBe(403);
  });
});
