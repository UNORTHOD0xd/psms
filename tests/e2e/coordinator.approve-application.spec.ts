/**
 * Coordinator approves a student application; the system creates a
 * placement and dispatches a magic-link onboarding email to the
 * supervisor.
 *
 * Requirement IDs: INP-04 (decision flow), INP-05 (placement creation),
 * PRC-03 (magic-link issue), PRC-07 (notification).
 */
import { expect, test } from '@playwright/test';
import { fixture } from './_seed.js';
import { signIn, waitForEmail } from './_helpers.js';

test('coordinator approves and a magic-link email is delivered', async ({
  page,
  request,
}) => {
  const f = fixture();
  await signIn(page, f.coordinator_email, f.coordinator_password);

  await page.getByRole('link', { name: /applications/i }).click();
  // Filter is SUBMITTED by default.
  const row = page
    .locator('tr', { hasText: /E2E Student/i })
    .first();
  await row.getByRole('button', { name: /approve/i }).click();
  // Confirm dialog
  page.once('dialog', (d) => void d.accept());

  // Wait for the row to reflect APPROVED.
  await expect(
    page.locator('tr', { hasText: /E2E Student/i }).first(),
  ).toContainText(/APPROVED/i, { timeout: 15_000 });

  const email = await waitForEmail(
    request,
    (m) =>
      m.To.some((t) => t.Address.toLowerCase() === f.supervisor_email.toLowerCase()) &&
      /onboard|magic|placement/i.test(m.Subject),
  );
  expect(email).toBeDefined();
});
