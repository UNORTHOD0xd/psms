/**
 * Supervisor opens the magic-link from their inbox and lands on the
 * placement-scoped supervisor inbox.
 *
 * Requirement IDs: PRC-03 (magic link), INP-09 (auth without password).
 */
import { expect, test } from '@playwright/test';
import { fixture } from './_seed.js';
import { extractUrl, fetchEmailHtml, waitForEmail } from './_helpers.js';

test('supervisor consumes the magic link and lands on /supervisor', async ({
  page,
  request,
}) => {
  const f = fixture();

  // The coordinator-approve spec is what triggers the email; this
  // test pulls the latest onboarding email for the fixture's
  // supervisor.
  const msg = await waitForEmail(
    request,
    (m) =>
      m.To.some(
        (t) => t.Address.toLowerCase() === f.supervisor_email.toLowerCase(),
      ) && /onboard|magic|placement/i.test(m.Subject),
  );

  const html = await fetchEmailHtml(request, msg.ID);
  // The link points at PUBLIC_WEB_ORIGIN/auth/magic?token=...
  const link = extractUrl(html, 'http://localhost:5173/auth/magic');

  await page.goto(link);
  await page.waitForURL(/\/supervisor/);
  await expect(page.getByText(/inbox|pending/i)).toBeVisible();
});
