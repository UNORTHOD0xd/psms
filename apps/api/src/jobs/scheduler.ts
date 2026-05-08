// Lightweight cron scheduler. We deliberately avoid a node-cron dep
// for the pilot; the only scheduled job today is the iSIMS import,
// and a single setInterval is enough.
//
// The cron expression in env (`ISIMS_IMPORT_CRON`) is parsed by a
// minimal helper that supports the conventions we use (numeric fields
// and `*`). If the expression doesn't parse, the scheduler logs once
// and refuses to schedule — better to fail loud than silently stop
// importing.

import { loadEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';

import { runIsimsImport } from './isims-import.js';

interface CronExpr {
  minute: number | '*';
  hour: number | '*';
  day: number | '*';
  month: number | '*';
  weekday: number | '*';
}

function parseCron(expr: string): CronExpr | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const tokens = parts.map((p) => (p === '*' ? ('*' as const) : Number(p)));
  if (tokens.some((t) => t !== '*' && Number.isNaN(t))) return null;
  return {
    minute: tokens[0]!,
    hour: tokens[1]!,
    day: tokens[2]!,
    month: tokens[3]!,
    weekday: tokens[4]!,
  };
}

function matches(expr: CronExpr, d: Date): boolean {
  return (
    (expr.minute === '*' || expr.minute === d.getMinutes()) &&
    (expr.hour === '*' || expr.hour === d.getHours()) &&
    (expr.day === '*' || expr.day === d.getDate()) &&
    (expr.month === '*' || expr.month === d.getMonth() + 1) &&
    (expr.weekday === '*' || expr.weekday === d.getDay())
  );
}

let timer: NodeJS.Timeout | null = null;
let last_fire_minute = -1;

export function startScheduler(): void {
  if (timer) return;
  const env = loadEnv();
  const expr = parseCron(env.ISIMS_IMPORT_CRON);
  if (!expr) {
    logger.error({ cron: env.ISIMS_IMPORT_CRON }, 'invalid ISIMS_IMPORT_CRON; scheduler disabled');
    return;
  }
  logger.info({ cron: env.ISIMS_IMPORT_CRON, csv: env.ISIMS_CSV_PATH }, 'scheduler started');

  timer = setInterval(() => {
    void tick(expr, env.ISIMS_CSV_PATH).catch((err: unknown) =>
      logger.error({ err }, 'scheduler tick failed'),
    );
  }, 30 * 1000); // poll every 30s — coarse, but the cheapest correct option
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  last_fire_minute = -1;
}

async function tick(expr: CronExpr, csv_path: string): Promise<void> {
  const now = new Date();
  // Coalesce within the same wall-clock minute so we never fire twice.
  const minuteKey = now.getHours() * 60 + now.getMinutes();
  if (minuteKey === last_fire_minute) return;
  if (!matches(expr, now)) return;
  last_fire_minute = minuteKey;

  await runIsimsImport({ csv_path, source_filename: csv_path });
}
