// iSIMS imports integration — PRC-01, CTL-07 (read-only).

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  cookieFor,
  createUser,
  getApp,
  resetDb,
} from './_setup.js';

describe('imports module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('GET /imports/isims/runs requires ADMINISTRATOR', async () => {
    const coord = await createUser({ role: 'COORDINATOR' });
    const cookie = await cookieFor(coord);
    const res = await request(getApp())
      .get('/api/v1/imports/isims/runs')
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('GET /imports/isims/runs returns a (possibly empty) page for admin', async () => {
    const admin = await createUser({ role: 'ADMINISTRATOR' });
    const cookie = await cookieFor(admin);
    const res = await request(getApp())
      .get('/api/v1/imports/isims/runs')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /imports/isims/trigger requires Idempotency-Key', async () => {
    const admin = await createUser({ role: 'ADMINISTRATOR' });
    const cookie = await cookieFor(admin);
    const res = await request(getApp())
      .post('/api/v1/imports/isims/trigger')
      .set('Cookie', cookie)
      .send({});
    // The middleware enforces the header — expect a 400-class problem.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
