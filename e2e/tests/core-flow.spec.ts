import { expect, test } from '@playwright/test';

test('core student workflow: sign up -> dashboard -> notes -> planner -> profile -> logout', async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@uni.edu`;
  const password = 'Password123!';

  await page.goto('/signup');
  await page.getByLabel('Full name').fill('E2E Student');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /good (morning|afternoon|evening), e2e/i })).toBeVisible();

  // Notes: create a note and verify it persists after reload
  await page.goto('/notes');
  await page.getByRole('button', { name: /new note/i }).click();
  await page.getByLabel('Title').fill('Distributed Systems Lecture 1');
  await page.getByLabel('Notes').fill('Lamport timestamps order causal events in distributed nodes.');
  await page.getByRole('button', { name: /save note/i }).click();
  await page.reload();
  await expect(page.getByText('Distributed Systems Lecture 1')).toBeVisible();

  // Planner: add a task and mark it complete
  await page.goto('/planner');
  await page.getByLabel('New task').fill('Read Paxos paper');
  await page.getByRole('button', { name: /^add$/i }).click();
  await expect(page.getByText('Read Paxos paper')).toBeVisible();

  // Profile: view and update bio
  await page.goto('/profile');
  await page.getByLabel('Bio').fill('Final-year CS student');
  await page.getByRole('button', { name: /save changes/i }).click();
  await expect(page.getByText('Profile saved')).toBeVisible();
});

