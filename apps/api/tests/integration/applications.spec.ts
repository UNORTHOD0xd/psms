// Applications integration — INP-04 (apply + decision flow), PRC-02
// (matching score), PRC-03 (approve auto-issues supervisor magic link).

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  cookieFor,
  createOpportunity,
  createOrganisation,
  createUser,
  getApp,
  getPrisma,
  resetDb,
} from './_setup.js';

describe('applications module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('student can apply once per opportunity (uq_student_opportunity)', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const student = await createUser({ role: 'STUDENT' });
    const { organisation_id } = await createOrganisation();
    const { opportunity_id } = await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
    });
    const cookie = await cookieFor(student);

    const r1 = await request(getApp())
      .post('/api/v1/applications')
      .set('Cookie', cookie)
      .send({
        opportunity_id,
        motivation: 'Long enough motivation paragraph that the API will accept.',
        cv_url: 'https://files.test/cv-1.pdf',
      });
    expect(r1.status).toBe(201);
    expect(r1.body.status).toBe('SUBMITTED');

    const r2 = await request(getApp())
      .post('/api/v1/applications')
      .set('Cookie', cookie)
      .send({
        opportunity_id,
        motivation: 'Another motivation paragraph after the first.',
        cv_url: 'https://files.test/cv-2.pdf',
      });
    expect(r2.status).toBe(409);
  });

  it('PRC-02 score is computed and surfaced on the application detail', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const student = await createUser({ role: 'STUDENT' });
    const { organisation_id } = await createOrganisation();
    const { opportunity_id } = await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
    });

    const cookie = await cookieFor(student);
    const post = await request(getApp())
      .post('/api/v1/applications')
      .set('Cookie', cookie)
      .send({
        opportunity_id,
        motivation: 'A motivation that meets the minimum length the API expects.',
        cv_url: 'https://files.test/cv.pdf',
      });
    expect(post.status).toBe(201);

    // Coordinator review surface should include the snapshot score.
    const coordCookie = await cookieFor(coord);
    const list = await request(getApp())
      .get(`/api/v1/applications?opportunity_id=${opportunity_id}`)
      .set('Cookie', coordCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);
    expect(typeof list.body.data[0].score).toBe('number');
  });

  it('coordinator approve creates a placement and issues a supervisor magic link (PRC-03)', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const student = await createUser({ role: 'STUDENT' });
    const { organisation_id } = await createOrganisation();
    const { opportunity_id } = await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
    });

    const studentCookie = await cookieFor(student);
    const post = await request(getApp())
      .post('/api/v1/applications')
      .set('Cookie', studentCookie)
      .send({
        opportunity_id,
        motivation: 'Motivation paragraph long enough for the schema validation.',
        cv_url: 'https://files.test/cv.pdf',
      });
    const application_id = post.body.application_id as string;

    const coordCookie = await cookieFor(coord);
    const dec = await request(getApp())
      .post(`/api/v1/applications/${application_id}/decision`)
      .set('Cookie', coordCookie)
      .send({ decision: 'APPROVE' });
    expect(dec.status).toBe(200);
    expect(dec.body.status).toBe('APPROVED');

    const placements = await getPrisma().placement.findMany({
      where: { application_id },
    });
    expect(placements.length).toBe(1);

    const tokens = await getPrisma().magicLinkToken.findMany();
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.purpose).toBe('ONBOARDING');
  });

  it('coordinator decline requires a reason of at least 5 chars', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const student = await createUser({ role: 'STUDENT' });
    const { organisation_id } = await createOrganisation();
    const { opportunity_id } = await createOpportunity({
      organisation_id,
      created_by_user_id: coord.user_id,
    });
    const studentCookie = await cookieFor(student);
    const post = await request(getApp())
      .post('/api/v1/applications')
      .set('Cookie', studentCookie)
      .send({
        opportunity_id,
        motivation: 'A long enough motivation paragraph for validation.',
        cv_url: 'https://files.test/cv.pdf',
      });
    const application_id = post.body.application_id as string;

    const coordCookie = await cookieFor(coord);
    const r1 = await request(getApp())
      .post(`/api/v1/applications/${application_id}/decision`)
      .set('Cookie', coordCookie)
      .send({ decision: 'DECLINE', decline_reason: 'no' });
    expect(r1.status).toBe(400);

    const r2 = await request(getApp())
      .post(`/api/v1/applications/${application_id}/decision`)
      .set('Cookie', coordCookie)
      .send({
        decision: 'DECLINE',
        decline_reason: 'Insufficient programme alignment',
      });
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe('DECLINED');
  });
});
