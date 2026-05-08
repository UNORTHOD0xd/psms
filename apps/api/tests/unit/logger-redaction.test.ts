// CTL-05 — PII must not appear in log output. The logger uses pino's
// redact engine; this test feeds it the field names listed in the redact
// path and asserts the rendered JSON contains '[REDACTED]' rather than
// the raw value.

import { describe, expect, it } from 'vitest';
import { pino } from 'pino';

const REDACTED = '[REDACTED]';

// Re-derive the same pino config used in src/lib/logger.ts so we can
// pipe its output to a buffer instead of stdout. Keep the path list in
// sync with src/lib/logger.ts.
function makeBufferingLogger(buf: { lines: string[] }) {
  return pino(
    {
      level: 'info',
      base: { service: 'psms-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'res.headers["set-cookie"]',
          '*.password',
          '*.password_hash',
          '*.email',
          '*.email_lower',
          '*.full_name',
          '*.student_name',
          '*.phone',
          '*.cv_url',
          '*.motivation',
          '*.narrative',
          '*.activity_narrative',
          '*.body_params',
          '*.params',
          '*.raw_token',
          '*.token',
        ],
        censor: REDACTED,
      },
    },
    {
      write(chunk: string) {
        buf.lines.push(chunk);
      },
    },
  );
}

describe('logger redaction (CTL-05)', () => {
  it('redacts PII fields while keeping non-sensitive scaffolding', () => {
    const buf = { lines: [] as string[] };
    const log = makeBufferingLogger(buf);

    log.info(
      {
        request_id: '01H...REQ',
        user: {
          email: 'student@example.com',
          email_lower: 'student@example.com',
          full_name: 'Jane Doe',
          phone: '876-555-0100',
          password: 'super-secret-pw',
          password_hash: '$argon2id$...',
        },
        application: {
          motivation: 'I am motivated because ...',
          cv_url: 'https://uploads/cv-12345.pdf',
        },
        evaluation: {
          narrative: 'They were great.',
          activity_narrative: 'Did a thing.',
        },
        auth: {
          raw_token: 'tok_xxxxxxxxxxxxxx',
          token: 'jwt.like.value',
        },
      },
      'event-with-pii',
    );

    expect(buf.lines).toHaveLength(1);
    const out = buf.lines[0]!;
    // Scaffolding survives.
    expect(out).toContain('event-with-pii');
    expect(out).toContain('01H...REQ');
    // None of the raw values appear.
    expect(out).not.toContain('student@example.com');
    expect(out).not.toContain('Jane Doe');
    expect(out).not.toContain('876-555-0100');
    expect(out).not.toContain('super-secret-pw');
    expect(out).not.toContain('$argon2id$');
    expect(out).not.toContain('I am motivated because');
    expect(out).not.toContain('cv-12345.pdf');
    expect(out).not.toContain('They were great');
    expect(out).not.toContain('Did a thing');
    expect(out).not.toContain('tok_xxxxxxxxxxxxxx');
    expect(out).not.toContain('jwt.like.value');
    // Each redacted leaf is replaced with the censor token.
    expect(out).toContain(REDACTED);
  });

  it('redacts request cookie + authorization headers but keeps method/url', () => {
    const buf = { lines: [] as string[] };
    const log = makeBufferingLogger(buf);

    log.info({
      req: {
        method: 'POST',
        url: '/api/v1/auth/sign-in',
        headers: {
          cookie: 'psms_session=ABCDEF',
          authorization: 'Bearer secret',
          'user-agent': 'Mozilla/5.0',
        },
      },
    });

    const out = buf.lines[0]!;
    expect(out).toContain('/api/v1/auth/sign-in');
    expect(out).toContain('POST');
    expect(out).toContain('Mozilla/5.0');
    expect(out).not.toContain('ABCDEF');
    expect(out).not.toContain('Bearer secret');
    expect(out).toContain(REDACTED);
  });
});
