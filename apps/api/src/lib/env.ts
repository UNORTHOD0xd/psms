import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url(),

  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default('psms_session'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(8),

  MAGIC_LINK_TTL_HOURS: z.coerce.number().int().positive().default(24),
  MAGIC_LINK_MAX_ACTIVE_PER_SUPERVISOR: z.coerce.number().int().positive().default(3),
  PUBLIC_WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  SENDGRID_API_KEY: z.string().optional().default(''),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM_ADDRESS: z.string().email().default('no-reply@psms.knox.edu.jm'),
  EMAIL_FROM_NAME: z.string().default('Knox PSMS'),
  SENDGRID_WEBHOOK_PUBLIC_KEY: z.string().optional().default(''),

  CERT_SIGNING_KEY: z.string().optional().default(''),
  CERT_PUBLIC_KEY: z.string().optional().default(''),

  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('psms-uploads'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('true'),

  ISIMS_CSV_PATH: z.string().default('/var/lib/psms/isims-drop'),
  ISIMS_IMPORT_CRON: z.string().default('0 2 * * *'),

  RATE_LIMIT_SIGNIN_PER_IP_PER_5MIN: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_MAGICLINK_ISSUE_PER_HOUR: z.coerce.number().int().positive().default(20),
});

export type EnvConfig = z.infer<typeof Env>;

let cached: EnvConfig | null = null;

export function loadEnv(): EnvConfig {
  if (cached) return cached;
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCacheForTesting(): void {
  cached = null;
}
