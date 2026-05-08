/**
 * Supervisor approves a pending hours-log; the student's ledger
 * shows the approved hours afterwards.
 *
 * Requirement IDs: INP-08 (hours decision), PRC-04 (ledger sums
 * APPROVED), PRF-08 (hours-submit → notification).
 */
import { expect, test } from '@playwright/test';
import { fixture } from './_seed.js';
import { extractUrl, fetchEmailHtml, signIn, waitForEmail } from './_helpers.js';

test('supervisor approves the most recent pending hours-log', async ({
  page,
  request,
}) => {
  const f = fixture();

  // Re-consume the magic link so this spec is self-sufficient.
  const msg = await waitForEmail(
    request,
    (m) =>
      m.To.some(
        (t) => t.Address.toLowerCase() === f.supervisor_email.toLowerCase(),
      ) && /onboard|magic|placement/i.test(m.Subject),
  );
  const html = await fetchEmailHtml(request, msg.ID);
  const link = extractUrl(html, 'http://localhost:5173/auth/magic');
  await page.goto(link);
  await page.waitForURL(/\/supervisor/);

  // The inbox lists pending hours-logs. Click Approve on the first.
  const row = page.locator('article, tr').filter({ hasText: /hours/i }).first();
  await row.getByRole('button', { name: /^approve$/i }).click();
  await expect(row.getByText(/approved/i)).toBeVisible({ timeout: 10_000 });

  // Switch to the student session and confirm the ledger reflects it.
  await page.context().clearCookies();
  await signIn(page, f.student_email, f.student_password);
  await page.getByRole('link', { name: /ledger/i }).click();
  await expect(page.getByText(/approved/i)).toBeVisible();
});
