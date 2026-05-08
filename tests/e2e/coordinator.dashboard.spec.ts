/**
 * Coordinator dashboard renders the OUT-02 widgets backed by PRC-09.
 *
 * Requirement IDs: OUT-02 (dashboard), PRC-09 (aggregator).
 */
import { expect, test } from '@playwright/test';
import { fixture } from './_seed.js';
import { signIn } from './_helpers.js';

test('coordinator dashboard shows the six PRC-09 widgets', async ({ page }) => {
  const f = fixture();
  await signIn(page, f.coordinator_email, f.coordinator_password);

  await expect(page).toHaveURL(/\/coordinator/);
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  // The widgets are rendered as `psms-card` articles. Spot-check four.
  await expect(page.getByText(/active placements/i)).toBeVisible();
  await expect(page.getByText(/pending hours/i)).toBeVisible();
  await expect(page.getByText(/applications/i)).toBeVisible();
  await expect(page.getByText(/evaluations due/i)).toBeVisible();
});
