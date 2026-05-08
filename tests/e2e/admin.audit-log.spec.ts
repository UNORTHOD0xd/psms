/**
 * Administrator opens the audit-log viewer, filters, and exports CSV.
 *
 * Requirement IDs: OUT-09, CTL-08 (audit-log immutability — surface
 * level, integrity is asserted at the DB).
 */
import { expect, test } from '@playwright/test';
import { fixture } from './_seed.js';
import { signIn } from './_helpers.js';

test('admin filters the audit log and downloads a CSV', async ({ page }) => {
  const f = fixture();
  await signIn(page, f.admin_email, f.admin_password);

  await page.getByRole('link', { name: /audit log/i }).click();

  await page.getByLabel(/action contains/i).fill('application');
  await page.getByRole('button', { name: /apply filters/i }).click();
  await expect(page.getByRole('table')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /export csv/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/audit-log.*\.csv$/);
});
