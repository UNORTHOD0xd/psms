/**
 * Coordinator builds an accreditation pack and downloads the ZIP.
 *
 * Requirement IDs: PRC-10 (pack assembly), OUT-06 (accreditation
 * report).
 */
import { expect, test } from '@playwright/test';
import { fixture } from './_seed.js';
import { signIn } from './_helpers.js';

test('coordinator builds an accreditation pack and the download link appears', async ({
  page,
}) => {
  const f = fixture();
  await signIn(page, f.coordinator_email, f.coordinator_password);
  await page.getByRole('link', { name: /reports/i }).click();

  await page
    .getByRole('button', { name: /build pack/i })
    .click();

  // The card polls until the job lands in SUCCEEDED. Generous timeout
  // because the pack assembles real CSVs + a cover PDF.
  await expect(
    page.getByRole('link', { name: /download zip/i }),
  ).toBeVisible({ timeout: 60_000 });
});
