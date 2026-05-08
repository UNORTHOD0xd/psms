/**
 * Student logs weekly hours against an active placement.
 *
 * Requirement IDs: INP-05 (hours log), PRC-04 (ledger sums APPROVED).
 *
 * Pre-conditions: this spec depends on `coordinator.approve-application`
 * having run (which creates the placement). Playwright runs specs
 * sequentially with `fullyParallel: false`, so the order in
 * `playwright.config.ts` (alphabetical by file name) puts coordinator
 * before student.log-hours.
 */
import { expect, test } from '@playwright/test';
import { fixture } from './_seed.js';
import { signIn } from './_helpers.js';

test('student logs hours and the row appears in PENDING', async ({ page }) => {
  const f = fixture();
  await signIn(page, f.student_email, f.student_password);

  await page.getByRole('link', { name: /placements/i }).first().click();
  // Click the first placement card / row.
  await page
    .getByRole('link', { name: /E2E Frontend Internship/i })
    .first()
    .click();

  await page.getByLabel(/week number/i).fill('1');
  await page
    .getByLabel(/date/i)
    .first()
    .fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel(/hours/i).fill('6');
  await page
    .getByLabel(/activity/i)
    .fill(
      'Wired up the placement-detail screen and the hours-log form alongside the API.',
    );
  await page.getByRole('button', { name: /log hours|submit/i }).click();

  await expect(page.getByText(/PENDING/i)).toBeVisible();
});
