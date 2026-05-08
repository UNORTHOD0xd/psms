// Admin integration — INP-10 (users + system config).

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  cookieFor,
  createUser,
  getApp,
  getPrisma,
  resetDb,
} from './_setup.js';

describe('admin module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('list users returns the seeded admins + filterable role', async () => {
    const admin = await createUser({ role: 'ADMINISTRATOR' });
    await createUser({ role: 'STUDENT' });
    await createUser({ role: 'COORDINATOR' });

    const cookie = await cookieFor(admin);
    const r1 = await request(getApp())
      .get('/api/v1/admin/users')
      .set('Cookie', cookie);
    expect(r1.status).toBe(200);
    expect(r1.body.data.length).toBeGreaterThanOrEqual(3);

    const r2 = await request(getApp())
      .get('/api/v1/admin/users?role=STUDENT')
      .set('Cookie', cookie);
    expect(r2.status).toBe(200);
    expect(r2.body.data.every((u: { role: string }) => u.role === 'STUDENT')).toBe(
      true,
    );
  });

  it('deactivate flips is_active and revokes active sessions', async () => {
    const admin = await createUser({ role: 'ADMINISTRATOR' });
    const target = await createUser({ role: 'STUDENT' });
    await cookieFor(target); // create a session row

    const cookie = await cookieFor(admin);
    const res = await request(getApp())
      .post(`/api/v1/admin/users/${target.user_id}/deactivate`)
      .set('Cookie', cookie);
    expect(res.status).toBe(204);

    const after = await getPrisma().user.findUnique({
      where: { user_id: target.user_id },
    });
    expect(after?.is_active).toBe(false);
    const sessions = await getPrisma().session.findMany({
      where: { user_id: target.user_id, revoked_at: null },
    });
    expect(sessions.length).toBe(0);
  });

  it('force-password-reset is rejected for SUPERVISOR (magic-link only)', async () => {
    const admin = await createUser({ role: 'ADMINISTRATOR' });
    const sup = await createUser({ role: 'SUPERVISOR' });
    const cookie = await cookieFor(admin);

    const res = await request(getApp())
      .post(`/api/v1/admin/users/${sup.user_id}/force-password-reset`)
      .set('Cookie', cookie);
    expect(res.status).toBe(422);
  });

  it('PATCH /admin/config rejects unknown keys but accepts whitelisted ones', async () => {
    const admin = await createUser({ role: 'ADMINISTRATOR' });
    const cookie = await cookieFor(admin);

    const r1 = await request(getApp())
      .patch('/api/v1/admin/config')
      .set('Cookie', cookie)
      .send({ 'banner.message': 'Welcome to PSMS' });
    expect(r1.status).toBe(200);

    const r2 = await request(getApp())
      .patch('/api/v1/admin/config')
      .set('Cookie', cookie)
      .send({ 'attacker.controlled.key': 'lol' });
    expect(r2.status).toBe(400);
  });
});
