/**
 * AC-1.1, AC-1.2, AC-2.1 through AC-2.8 — Employee Help through the UI.
 *
 * These drive real interaction rather than asserting on rendered markup in
 * isolation: the point of the workspace is the sequence, and a screen that looks
 * right but cannot be operated is the failure mode worth catching.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/help');
});

test('AC-1.1 the shell exposes all four workspaces and marks the active one', async ({ page }) => {
  for (const key of ['help', 'agent', 'engineering', 'intelligence']) {
    await expect(page.getByTestId(`rail-${key}`)).toBeVisible();
  }
  await expect(page.getByTestId('rail-help')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('rail-agent')).not.toHaveAttribute('aria-current', 'page');
});

test('AC-1.2 the synthetic-data marker is always visible', async ({ page }) => {
  const badge = page.getByTestId('synthetic-data-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('Synthetic demo data');
  await expect(badge).toContainText('not connected to any external system');

  // Still present after navigating away from the landing workspace.
  await page.getByTestId('rail-intelligence').click();
  await expect(page.getByTestId('synthetic-data-badge')).toBeVisible();
});

test('AC-2.7 empty state precedes any conversation', async ({ page }) => {
  await expect(page.getByTestId('scenario-launcher')).toBeVisible();
  await expect(page.getByTestId('answer-empty')).toBeVisible();
  await expect(page.getByTestId('answer-panel')).toBeHidden();
});

test('AC-2.1 the VPN scenario resolves through self-service', async ({ page }) => {
  await page.getByTestId('scenario-vpn_after_password_reset').click();

  // AC-2.7: the loading state is a real state, not an instant swap.
  await expect(page.getByTestId('answer-loading')).toBeVisible();

  const panel = page.getByTestId('answer-panel');
  await expect(panel).toBeVisible();

  await expect(page.getByTestId('confidence-band')).toContainText('High confidence');
  await expect(page.getByTestId('confidence-band')).toContainText('0.96');

  // AC-2.3: both sources cited, with owner and review date, neither stale.
  await expect(page.getByTestId('source-card-KB-0104')).toBeVisible();
  await expect(page.getByTestId('source-card-KB-0118')).toBeVisible();
  await expect(page.getByTestId('source-card-KB-0104')).toContainText('Workplace Technology');
  await expect(page.getByTestId('stale-flag-KB-0104')).toBeHidden();

  // No sensitive-domain notice on a routine question.
  await expect(page.getByTestId('sensitive-notice')).toBeHidden();
});

test('AC-2.2 the confidence breakdown accounts for the displayed score', async ({ page }) => {
  await page.getByTestId('scenario-vpn_after_password_reset').click();
  await expect(page.getByTestId('answer-panel')).toBeVisible();

  const breakdown = page.getByTestId('confidence-breakdown');
  await breakdown.locator('summary').click();

  for (const label of ['Answer coverage', 'Source quality', 'Content freshness', 'Question match']) {
    await expect(breakdown).toContainText(label);
  }
  await expect(breakdown).toContainText('4 of 4 required points covered');

  // The components sum to the confidence the header displays.
  const rows = await breakdown.locator('tbody tr').all();
  let sum = 0;
  for (const row of rows.slice(0, -1)) {
    const raw = (await row.locator('td').first().innerText()).trim();
    sum += Number(raw.replace('−', '-').replace('+', ''));
  }
  expect(sum).toBeCloseTo(0.96, 2);
});

test('AC-2.4 helpful then resolve records both, and the claim cites its event', async ({ page }) => {
  await page.getByTestId('scenario-vpn_after_password_reset').click();
  await expect(page.getByTestId('answer-panel')).toBeVisible();

  await page.getByTestId('feedback-helpful').click();
  await expect(page.getByTestId('feedback-helpful')).toHaveAttribute('aria-pressed', 'true');
  // Feedback is once per answer.
  await expect(page.getByTestId('feedback-unhelpful')).toBeDisabled();

  await page.getByTestId('action-resolve').click();
  await expect(page.getByTestId('action-resolve')).toContainText('Resolved');

  /*
   * AC-8.1: the confirmation renders a claim generated from the recorded event,
   * not authored prose. If the event were missing, the guard would have thrown.
   */
  await expect(page.getByTestId('action-claims')).toContainText('resolved through self-service');
});

test('AC-3.1 the expense scenario refuses rather than improvising', async ({ page }) => {
  await page.getByTestId('scenario-expense_policy_exception').click();
  await expect(page.getByTestId('answer-panel')).toBeVisible();

  await expect(page.getByTestId('confidence-band')).toContainText('Low confidence');
  await expect(page.getByTestId('confidence-band')).toContainText('0.10');

  // A real knowledge gap: nothing retrieved, and the UI says so plainly.
  await expect(page.getByTestId('source-list-empty')).toBeVisible();
  await expect(page.getByTestId('source-list-empty')).toContainText('No sources found');

  await expect(page.getByTestId('sensitive-notice')).toContainText('Policy exception');
  await expect(page.getByTestId('action-resolve')).toBeDisabled();
  await expect(page.getByTestId('action-escalate')).toBeEnabled();
});

test('AC-3.1 the SSO scenario is capped by the sensitive-domain ceiling', async ({ page }) => {
  await page.getByTestId('scenario-sso_login_loop').click();
  await expect(page.getByTestId('answer-panel')).toBeVisible();

  await expect(page.getByTestId('confidence-band')).toContainText('0.45');
  await expect(page.getByTestId('sensitive-notice')).toContainText('Identity & access');

  await page.getByTestId('confidence-breakdown').locator('summary').click();
  const breakdown = page.getByTestId('confidence-breakdown');

  // The ceiling appears as a negative term, and the gap is named.
  await expect(breakdown).toContainText('Escalation-sensitive topic');
  await expect(breakdown).toContainText('−0.240');
  await expect(breakdown).toContainText('post_password_reset');
  // AC-2.3: one source is past its review window.
  await expect(page.getByTestId('stale-flag-KB-0132')).toBeVisible();

  await expect(page.getByTestId('action-resolve')).toBeDisabled();
});

test('AC-3.2 escalation creates a case and navigates to its detail', async ({ page }) => {
  await page.getByTestId('scenario-sso_login_loop').click();
  await expect(page.getByTestId('answer-panel')).toBeVisible();

  await page.getByTestId('action-escalate').click();

  // A real case id, not a placeholder route.
  await expect(page).toHaveURL(/\/agent\/CASE-\d{4}$/);
});

test('AC-2.8 free text maps to the nearest intent and discloses the fallback', async ({ page }) => {
  await page.getByTestId('composer').fill('my vpn will not connect after a password reset');
  await page.getByTestId('composer-send').click();

  await expect(page.getByTestId('answer-panel')).toBeVisible();
  await expect(page.getByTestId('confidence-band')).toContainText('High confidence');
  // A confident match makes no fallback claim.
  await expect(page.getByTestId('fallback-notice')).toBeHidden();
});

test('AC-2.8 an unmatched question says so instead of pretending', async ({ page }) => {
  await page.getByTestId('composer').fill('what is the capital of anywhere at all');
  await page.getByTestId('composer-send').click();

  await expect(page.getByTestId('fallback-notice')).toBeVisible();
  await expect(page.getByTestId('fallback-notice')).toContainText('No close match');
  // Capped, not merely nudged: a guessed question cannot read as confident.
  await expect(page.getByTestId('confidence-band')).toContainText('Low confidence');
  await page.getByTestId('confidence-breakdown').locator('summary').click();
  await expect(page.getByTestId('confidence-breakdown')).toContainText('Question not recognized');
});

test('AC-1.4 reset demo returns to the launcher', async ({ page }) => {
  await page.getByTestId('scenario-vpn_after_password_reset').click();
  await expect(page.getByTestId('answer-panel')).toBeVisible();

  // Two-step, because it discards work.
  await page.getByTestId('reset-demo').click();
  await expect(page.getByTestId('reset-demo')).toContainText('Confirm reset');
  await page.getByTestId('reset-demo').click();

  await expect(page.getByTestId('scenario-launcher')).toBeVisible();
  await expect(page.getByTestId('answer-empty')).toBeVisible();
});

test('AC-2.6 the conversation column never dominates the frame', async ({ page }) => {

  await page.getByTestId('scenario-vpn_after_password_reset').click();
  await expect(page.getByTestId('answer-panel')).toBeVisible();

  const conversation = await page.getByTestId('conversation-column').boundingBox();
  const evidence = await page.getByTestId('evidence-column').boundingBox();
  expect(conversation!.width).toBeLessThanOrEqual(560);
  // The evidence region is the wider of the two: chat is intake, not the product.
  expect(evidence!.width).toBeGreaterThan(conversation!.width);
});
