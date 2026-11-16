import { expect, test } from '@playwright/test';

// Phase 1 smoke test. The full sign-up -> verify -> login flow arrives with Phase 2 (see TEST_PLAN.md section 4).

test('unauthenticated visitors are sent to the login page', async ({ page }) => {
  await page.goto('/notes');
  await expect(page).toHaveURL(/\/login\?next=%2Fnotes/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('the API is reachable through the dev proxy', async ({ request }) => {
  const res = await request.get('/api/v1/health/ready');
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ status: 'ok' });
});

test('dark mode toggle persists across reloads', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('mobile layout has no horizontal scroll (T-UI-05)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/login');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

