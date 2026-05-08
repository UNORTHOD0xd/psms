/**
 * Anyone (no auth) hits /verify/:id with a valid certificate ID and
 * sees the verification result. With an unknown ID they see a clear
 * "not found" state and no PII.
 *
 * Requirement IDs: OUT-08 (public verification), CTL-06 (signed
 * certificates).
 */
import { expect, test } from '@playwright/test';
import { fixture } from './_seed.js';

test('unknown certificate ID renders the NOT_FOUND state without PII', async ({
  page,
}) => {
  await page.goto('/verify/00000000-0000-0000-0000-000000000000');
  await expect(
    page.getByRole('heading', {
      name: /knox psms certificate verification/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/not found/i)).toBeVisible();
  // Sanity: we should not be leaking student names on a not-found.
  await expect(page.getByText(/E2E Student/i)).toHaveCount(0);
});

test('valid certificate (when present in fixture) shows VALID', async ({
  page,
}) => {
  const f = fixture();
  test.skip(!f.certificate_id, 'No certificate seeded yet — depends on FINAL eval e2e.');

  await page.goto(`/verify/${f.certificate_id}`);
  await expect(page.getByText(/valid/i)).toBeVisible();
});
