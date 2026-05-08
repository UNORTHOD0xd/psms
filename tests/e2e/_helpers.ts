// E2E helpers shared across specs.
//
// The e2e suite drives the real running stack; these helpers seed
// users via the admin API (since the spec-level UI doesn't expose
// user creation) and sign in through the actual UI to exercise the
// session-cookie path the way a real user would.
//
// Keep test data deterministic: a unique email is generated per test
// using `test.info().testId`, so parallel-run collisions don't bite.

import { expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Sign in via the UI and return when the role's home page is loaded.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // After sign-in, the role-home redirect lands on /<role>.
  await page.waitForURL(/\/(student|supervisor|coordinator|admin)/);
}

/**
 * Mailpit message-list API. Returns the most recent email matching
 * the predicate, polling up to `timeoutMs`.
 *
 * Mailpit is bound to localhost:8025 in `docker-compose.yml`.
 */
export async function waitForEmail(
  api: APIRequestContext,
  predicate: (msg: MailpitMessage) => boolean,
  timeoutMs = 15_000,
): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await api.get('http://localhost:8025/api/v1/messages?limit=50');
    if (res.ok()) {
      const body = (await res.json()) as { messages: MailpitMessage[] };
      const hit = body.messages.find(predicate);
      if (hit) return hit;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('No email matched the predicate within the timeout');
}

export async function fetchEmailHtml(
  api: APIRequestContext,
  id: string,
): Promise<string> {
  const res = await api.get(`http://localhost:8025/api/v1/message/${id}`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { HTML?: string; Text?: string };
  return body.HTML ?? body.Text ?? '';
}

export interface MailpitMessage {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
  Created: string;
  HTML?: string;
  Text?: string;
}

/**
 * Extracts the first absolute URL of a given prefix from a snippet of
 * email HTML. Used to grab the magic-link URL out of the supervisor
 * onboarding email.
 */
export function extractUrl(html: string, prefix: string): string {
  const match = html.match(
    new RegExp(`(${prefix.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[^"'\\s)]+)`, 'i'),
  );
  if (!match) throw new Error(`No URL with prefix ${prefix} found`);
  return match[1];
}
