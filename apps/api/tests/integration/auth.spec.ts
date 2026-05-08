// Auth module integration — INP-09 (sign-in), PRC-03 (magic-link),
// CTL-01 (argon2id), CTL-10 (cookie HttpOnly/Secure/SameSite).

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { getApp, createUser, resetDb } from './_setup.js';

describe('auth module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe('POST /auth/sign-in (INP-09)', () => {
    it('returns 200 + Me + sets HttpOnly session cookie on valid credentials', async () => {
      const user = await createUser({ role: 'STUDENT' });

      const res = await request(getApp())
        .post('/api/v1/auth/sign-in')
        .send({ email: user.email, password: user.password });

      expect(res.status).toBe(200);
      expect(res.body.user.user_id).toBe(user.user_id);
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
      expect(cookieStr).toContain('psms_session=');
      expect(cookieStr.toLowerCase()).toContain('httponly');
      expect(cookieStr.toLowerCase()).toContain('samesite=lax');
    });

    it('returns 401 with no cookie on bad password (CTL-01)', async () => {
      const user = await createUser({ role: 'STUDENT' });

      const res = await request(getApp())
        .post('/api/v1/auth/sign-in')
        .send({ email: user.email, password: 'wrong-password-1234' });

      expect(res.status).toBe(401);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('returns 401 for an inactive user even with the right password', async () => {
      const user = await createUser({ role: 'STUDENT' });
      // Deactivate
      const { getPrisma } = await import('./_setup.js');
      await getPrisma().user.update({
        where: { user_id: user.user_id },
        data: { is_active: false },
      });

      const res = await request(getApp())
        .post('/api/v1/auth/sign-in')
        .send({ email: user.email, password: user.password });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 with no session cookie', async () => {
      const res = await request(getApp()).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns the current user when signed in', async () => {
      const user = await createUser({ role: 'STUDENT' });
      const agent = request.agent(getApp());
      await agent
        .post('/api/v1/auth/sign-in')
        .send({ email: user.email, password: user.password })
        .expect(200);

      const res = await agent.get('/api/v1/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.user_id).toBe(user.user_id);
      expect(res.body.role).toBe('STUDENT');
    });
  });

  describe('POST /auth/sign-out', () => {
    it('revokes the session and subsequent /me returns 401', async () => {
      const user = await createUser({ role: 'COORDINATOR' });
      const agent = request.agent(getApp());
      await agent
        .post('/api/v1/auth/sign-in')
        .send({ email: user.email, password: user.password })
        .expect(200);

      await agent.post('/api/v1/auth/sign-out').expect(204);
      const res = await agent.get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/password-reset/request (CTL-04)', () => {
    it('always returns 204 to avoid leaking which emails exist', async () => {
      const known = await createUser({ role: 'STUDENT' });

      await request(getApp())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: known.email })
        .expect(204);

      await request(getApp())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'nobody@unknown.test' })
        .expect(204);
    });
  });
});
