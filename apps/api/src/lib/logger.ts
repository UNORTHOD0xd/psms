import { pino } from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';

// CTL-05: PII is never logged. Pino redacts on every emit. The path list
// covers the request body (handlers should not log raw bodies anyway,
// but this is the floor) and any field a stray destructure might hand
// to logger.info.
export const logger = pino({
  level,
  base: { service: 'psms-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      // wildcards target arbitrary nesting depth in pino's redact engine
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
    censor: '[REDACTED]',
  },
});
