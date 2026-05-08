// CTL-10 — session cookies must be HttpOnly + SameSite=Lax in every
// environment, and Secure when NODE_ENV === 'production'. The secret is
// not in JS-accessible storage; the only persistence channel is the
// cookie set here.

import { describe, expect, it, beforeEach } from 'vitest';

import { resetEnvCacheForTesting } from '../../src/lib/env.js';
import { setSessionCookie, clearSessionCookie } from '../../src/modules/auth/session.js';

interface FakeResponse {
  cookies: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }>;
  cleared: Array<{ name: string; options: Record<string, unknown> }>;
  cookie: (name: string, value: string, options: Record<string, unknown>) => void;
  clearCookie: (name: string, options: Record<string, unknown>) => void;
}

function fakeRes(): FakeResponse {
  const obj: FakeResponse = {
    cookies: [],
    cleared: [],
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
    },
    clearCookie(name, options) {
      this.cleared.push({ name, options });
    },
  };
  return obj;
}

function withEnv(extras: Record<string, string>, fn: () => void): void {
  const before: Record<string, string | undefined> = {};
  for (const k of Object.keys(extras)) before[k] = process.env[k];
  try {
    Object.assign(process.env, extras);
    resetEnvCacheForTesting();
    fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetEnvCacheForTesting();
  }
}

const baseEnv = {
  DATABASE_URL: 'postgres://localhost/psms',
  SESSION_SECRET: 'x'.repeat(32),
};

describe('session cookie attributes (CTL-10)', () => {
  beforeEach(() => resetEnvCacheForTesting());

  it('sets HttpOnly + SameSite=lax + path=/ in development', () => {
    withEnv({ ...baseEnv, NODE_ENV: 'development' }, () => {
      const res = fakeRes();
      const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
      setSessionCookie(res as never, 'raw-cookie-value', expires);

      expect(res.cookies).toHaveLength(1);
      const opts = res.cookies[0]!.options;
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe('lax');
      expect(opts.path).toBe('/');
      expect(opts.expires).toEqual(expires);
      // dev: secure flag not required (cookie still works over http://localhost)
      expect(opts.secure).toBe(false);
    });
  });

  it('sets Secure=true when NODE_ENV=production', () => {
    withEnv({ ...baseEnv, NODE_ENV: 'production' }, () => {
      const res = fakeRes();
      setSessionCookie(res as never, 'raw', new Date(Date.now() + 1000));
      expect(res.cookies[0]!.options.secure).toBe(true);
      expect(res.cookies[0]!.options.httpOnly).toBe(true);
      expect(res.cookies[0]!.options.sameSite).toBe('lax');
    });
  });

  it('clearSessionCookie targets the same path so the browser drops it', () => {
    withEnv({ ...baseEnv, NODE_ENV: 'development' }, () => {
      const res = fakeRes();
      clearSessionCookie(res as never);
      expect(res.cleared).toHaveLength(1);
      expect(res.cleared[0]!.options.path).toBe('/');
    });
  });

  it('uses the configured cookie name from SESSION_COOKIE_NAME', () => {
    withEnv(
      {
        ...baseEnv,
        NODE_ENV: 'development',
        SESSION_COOKIE_NAME: 'psms_test_session',
      },
      () => {
        const res = fakeRes();
        setSessionCookie(res as never, 'raw', new Date(Date.now() + 1000));
        expect(res.cookies[0]!.name).toBe('psms_test_session');
      },
    );
  });
});
