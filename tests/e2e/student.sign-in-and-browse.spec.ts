/**
 * Student sign-in + browse opportunities.
 *
 * Requirement IDs: INP-09 (sign-in), INP-03 (opportunity catalogue).
 */
import { expect, test } from '@playwright/test';
import { fixture } from './_seed.js';
import { signIn } from './_helpers.js';

test('student signs in and sees the published internship', async ({ page }) => {
  const f = fixture();
  await signIn(page, f.student_email, f.student_password);
  await expect(page).toHaveURL(/\/student/);
  await page.getByRole('link', { name: /opportunities/i }).click();
  await expect(page.getByText(/E2E Frontend Internship/i)).toBeVisible();
});
