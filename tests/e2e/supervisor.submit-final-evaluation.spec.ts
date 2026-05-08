/**
 * Supervisor submits the FINAL evaluation; the system computes the
 * composite rating, transitions the placement to COMPLETED, and
 * generates a signed certificate.
 *
 * Requirement IDs: INP-06, PRC-08 (composite rating), PRC-06
 * (certificate gen), OUT-04 (PDF).
 */
import { expect, test } from '@playwright/test';
import { fixture } from './_seed.js';
import { extractUrl, fetchEmailHtml, signIn, waitForEmail } from './_helpers.js';

test('supervisor submits FINAL; student sees a certificate appear', async ({
  page,
  request,
}) => {
  const f = fixture();

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

  // Open the FINAL evaluation form for the placement.
  await page
    .getByRole('link', { name: /final evaluation|submit final/i })
    .first()
    .click();

  await page.getByLabel(/attendance/i).fill('5');
  await page.getByLabel(/professionalism/i).fill('4');
  // Each competency rating shows up as a labelled input. Fill all
  // visible ones with 4.
  const ratingInputs = page.locator('input[type="number"]');
  const count = await ratingInputs.count();
  for (let i = 0; i < count; i += 1) {
    const v = await ratingInputs.nth(i).inputValue();
    if (v === '' || v === '0') await ratingInputs.nth(i).fill('4');
  }
  await page
    .getByLabel(/narrative|comments/i)
    .fill(
      'Strong performance through the placement; communicated clearly and adapted well.',
    );
  await page.getByLabel(/recommend/i).check();
  await page.getByRole('button', { name: /submit/i }).click();

  // Sign in as the student and check the certificate list.
  await page.context().clearCookies();
  await signIn(page, f.student_email, f.student_password);
  await page.getByRole('link', { name: /certificates/i }).click();
  await expect(page.getByText(/E2E Frontend Internship/i)).toBeVisible({
    timeout: 30_000,
  });
});
