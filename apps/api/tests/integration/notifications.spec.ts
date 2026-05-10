// Notifications integration — PRC-07 (in-app + email), OUT-05 (delivery
// events from SendGrid webhook).

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  cookieFor,
  createUser,
  getApp,
  getPrisma,
  resetDb,
} from './_setup.js';

describe('notifications module', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('GET /me/notifications scopes to the current user only', async () => {
    const a = await createUser({ role: 'STUDENT' });
    const b = await createUser({ role: 'STUDENT' });

    const p = getPrisma();
    await p.notification.createMany({
      data: [
        {
          user_id: a.user_id,
          channel: 'IN_APP',
          event_type: 'test.event',
          subject: 'For A',
          body_template: 'test',
          body_params: { text: 'Hello A' },
          status: 'SENT',
        },
        {
          user_id: b.user_id,
          channel: 'IN_APP',
          event_type: 'test.event',
          subject: 'For B',
          body_template: 'test',
          body_params: { text: 'Hello B' },
          status: 'SENT',
        },
      ],
    });

    const cookie = await cookieFor(a);
    const res = await request(getApp())
      .get('/api/v1/me/notifications')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].subject).toBe('For A');
  });

  it('mark-read flips status and is idempotent', async () => {
    const u = await createUser({ role: 'STUDENT' });
    const p = getPrisma();
    const note = await p.notification.create({
      data: {
        user_id: u.user_id,
        channel: 'IN_APP',
        event_type: 'test.event',
        subject: 'Hello',
        body_template: 'test',
        body_params: { text: 'Body' },
        status: 'SENT',
      },
    });
    const cookie = await cookieFor(u);
    const r1 = await request(getApp())
      .post(`/api/v1/me/notifications/${note.notification_id}/read`)
      .set('Cookie', cookie);
    expect(r1.status).toBeLessThan(300);
    const r2 = await request(getApp())
      .post(`/api/v1/me/notifications/${note.notification_id}/read`)
      .set('Cookie', cookie);
    expect(r2.status).toBeLessThan(300);

    const after = await p.notification.findUnique({
      where: { notification_id: note.notification_id },
    });
    expect(after?.status).toBe('READ');
  });

  it('SendGrid webhook rejects unsigned bodies', async () => {
    const res = await request(getApp())
      .post('/api/v1/webhooks/sendgrid')
      .send([{ event: 'delivered', sg_message_id: 'm1' }]);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
