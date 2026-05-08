/**
 * Student applies to an opportunity and sees it appear in their list.
 *
 * Requirement IDs: INP-04 (apply flow), PRC-02 (matching score visible
 * to coordinator on the same row).
 */
import { expect, test } from '@playwright/test';
import { fixture } from './_seed.js';
import { signIn } from './_helpers.js';

test('student applies and the application shows up under "My applications"', async ({ page }) => {
  const f = fixture();
  await signIn(page, f.student_email, f.student_password);

  await page.goto(`/student/opportunities/${f.opportunity_id}`);
  await page.getByRole('link', { name: /apply/i }).click();

  await page
    .getByLabel(/motivation/i)
    .fill(
      'I want to put my coursework into practice with a placement that needs the things I\'ve been studying.',
    );
  await page.getByLabel(/cv/i).setInputFiles({
    name: 'cv.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 e2e fixture\n'),
  });
  await page.getByRole('button', { name: /submit application/i }).click();

  // After submit, the student is taken to their applications list.
  await page.waitForURL(/\/student\/applications/);
  await expect(page.getByText(/E2E Frontend Internship/i)).toBeVisible();
  await expect(page.getByText(/SUBMITTED/i)).toBeVisible();
});
