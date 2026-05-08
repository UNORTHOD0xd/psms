// Uploads integration — INP-07 (CV pre-sign), CTL-04 (RBAC).

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { cookieFor, createUser, getApp, resetDb } from './_setup.js';

describe('uploads module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('STUDENT receives a presigned URL for a PDF up to 5 MB', async () => {
    const student = await createUser({ role: 'STUDENT' });
    const cookie = await cookieFor(student);

    const res = await request(getApp())
      .post('/api/v1/uploads/cv')
      .set('Cookie', cookie)
      .send({
        content_type: 'application/pdf',
        size_bytes: 1024 * 1024,
      });

    expect(res.status).toBe(200);
    expect(res.body.put_url).toBeDefined();
    expect(res.body.public_url).toBeDefined();
  });

  it('rejects non-PDF content types', async () => {
    const student = await createUser({ role: 'STUDENT' });
    const cookie = await cookieFor(student);
    const res = await request(getApp())
      .post('/api/v1/uploads/cv')
      .set('Cookie', cookie)
      .send({
        content_type: 'image/png',
        size_bytes: 1000,
      });
    expect(res.status).toBe(400);
  });

  it('rejects oversized requests (> 5 MB)', async () => {
    const student = await createUser({ role: 'STUDENT' });
    const cookie = await cookieFor(student);
    const res = await request(getApp())
      .post('/api/v1/uploads/cv')
      .set('Cookie', cookie)
      .send({
        content_type: 'application/pdf',
        size_bytes: 6 * 1024 * 1024,
      });
    expect(res.status).toBe(400);
  });

  it('SUPERVISOR cannot pre-sign a CV upload (RBAC)', async () => {
    const sup = await createUser({ role: 'SUPERVISOR' });
    const cookie = await cookieFor(sup);
    const res = await request(getApp())
      .post('/api/v1/uploads/cv')
      .set('Cookie', cookie)
      .send({ content_type: 'application/pdf', size_bytes: 1000 });
    expect(res.status).toBe(403);
  });
});
