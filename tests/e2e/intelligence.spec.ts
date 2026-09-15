/**
 * AC-5.3, AC-5.4, AC-5.5, AC-5.9 — Product Intelligence through the UI.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/intelligence');
  await page.getByTestId('metric-grid').waitFor();
});

test('AC-5.2 all nine metrics render, grouped by the question they answer', async ({ page }) => {
  for (const key of [
    'supportDemand',
    'selfServiceRate',
    'escalationRate',
    'answerAcceptance',
    'searchFailureRate',
    'contextCompleteness',
    'recurringVolume',
    'timeToDetection',
    'reworkRate',
  ]) {
    await expect(page.getByTestId(`metric-${key}`)).toBeVisible();
  }

  const grid = page.getByTestId('metric-grid');
  await expect(grid).toContainText('Demand and deflection');
  await expect(grid).toContainText('Answer quality');
  await expect(grid).toContainText('Systemic signal');
});

test('AC-5.3 every metric exposes formula, numerator, denominator and window', async ({ page }) => {
  const tooltip = page.getByTestId('metric-tooltip-selfServiceRate');
  await expect(tooltip).toContainText('Formula');
  await expect(tooltip).toContainText('conversation.resolved[self_service] / conversation.started');
  await expect(tooltip).toContainText('Numerator');
  await expect(tooltip).toContainText('Denominator');
  await expect(tooltip).toContainText('Window');

  // Reachable by keyboard, not hover alone.
  await page.getByTestId('metric-searchFailureRate').focus();
  await expect(page.getByTestId('metric-tooltip-searchFailureRate')).toHaveCSS('opacity', '1');
});

test('AC-5.4 changing the range recomputes every panel', async ({ page }) => {
  const demand = page.getByTestId('metric-supportDemand');
  const before = await demand.innerText();

  await page.getByTestId('range-All').click();
  await expect(demand).not.toHaveText(before);

  await page.getByTestId('range-7d').click();
  await expect(demand).not.toHaveText(before);
});

test('AC-5.4 filtering to a category changes the rates and the charts', async ({ page }) => {
  await page.getByTestId('range-All').click();
  await expect(page.getByTestId('metric-supportDemand')).toContainText('160');

  await page.getByTestId('filter-category').selectOption('Access & Identity');

  await expect(page.getByTestId('metric-supportDemand')).toContainText('22');
  // Every Access & Identity request escalated and every search failed.
  await expect(page.getByTestId('metric-escalationRate')).toContainText('100%');
  await expect(page.getByTestId('metric-selfServiceRate')).toContainText('0%');
  await expect(page.getByTestId('metric-searchFailureRate')).toContainText('100%');

  await page.getByTestId('filter-clear').click();
  await expect(page.getByTestId('metric-supportDemand')).toContainText('160');
});

test('AC-5.9 an empty filter combination shows an empty state, not a broken chart', async ({ page }) => {
  await page.getByTestId('range-7d').click();
  await page.getByTestId('filter-category').selectOption('Facilities');
  await page.getByTestId('filter-system').selectOption('Expense Platform');

  await expect(page.getByTestId('intelligence-empty')).toBeVisible();
  await expect(page.getByTestId('demand-chart')).toBeHidden();
});

test('AC-5.6 failed searches separate content gaps from policy gates', async ({ page }) => {
  await page.getByTestId('range-All').click();
  const panel = page.getByTestId('failed-searches');

  await expect(panel).toContainText('mfa device change');
  await expect(panel).toContainText('expense policy exception');

  // The distinction that keeps the view actionable.
  await expect(panel).toContainText('Policy gate');
  await expect(panel).toContainText('Content gap');
  await expect(panel).toContainText('Writing an article would not change it');
});

test('AC-5.7 knowledge gaps exclude the policy-gated topic', async ({ page }) => {
  await page.getByTestId('range-All').click();
  const gaps = page.getByTestId('knowledge-gaps');

  await expect(gaps).toContainText('expense policy exception');
  await expect(gaps).toContainText('sso login loop');
  // MFA fails most often, and is deliberately absent: an article already exists.
  await expect(gaps).not.toContainText('mfa device change');
});

test('the charts render actual marks, not just axes', async ({ page }) => {
  await expect(page.locator('.recharts-area-area')).toHaveCount(1);
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
  // Escalation rate is direct-labelled rather than encoded in bar colour.
  await expect(page.getByTestId('category-chart')).toContainText('% esc');
});

test('AC-5.8 the cluster table explains its own emptiness before detection', async ({ page }) => {
  const table = page.getByTestId('cluster-table');
  await expect(table).toContainText('No recurring-issue clusters detected');
  await expect(table).toContainText('not a background job');
});

/**
 * AC-5.5 — the claim the whole page rests on: these are not static figures, they
 * incorporate what happened in the other workspaces during this session.
 */
test('AC-5.5 metrics incorporate in-session activity', async ({ page }) => {
  await page.getByTestId('range-All').click();
  const demandBefore = Number((await page.getByTestId('metric-supportDemand').innerText()).match(/\d+/)![0]);

  // Run a conversation through Employee Help.
  await page.goto('/help');
  await page.getByTestId('scenario-vpn_after_password_reset').click();
  await page.getByTestId('answer-panel').waitFor();
  await page.getByTestId('feedback-helpful').click();
  await page.getByTestId('action-resolve').click();

  await page.goto('/intelligence');
  await page.getByTestId('range-All').click();
  const demandAfter = Number((await page.getByTestId('metric-supportDemand').innerText()).match(/\d+/)![0]);

  expect(demandAfter).toBe(demandBefore + 1);
});

test('AC-5.8 a cluster formed in this session appears with its time to detection', async ({ page }) => {
  // Form the cluster in the Agent Workspace.
  await page.goto('/agent');
  await page.getByTestId('queue-search').fill('login loop');
  await page.locator('[data-testid^="queue-row-"]').first().locator('a').first().click();
  await page.getByTestId('case-detail').waitFor();
  for (let i = 0; i < 6; i++) {
    const enabled = page.locator('[data-testid^="mark-related-"]:not([disabled])');
    if ((await enabled.count()) === 0) break;
    await enabled.first().click();
  }
  await expect(page.getByTestId('cluster-panel')).toBeVisible();

  await page.goto('/intelligence');
  await page.getByTestId('range-All').click();

  const table = page.getByTestId('cluster-table');
  await expect(table).toContainText('CLU-0001');
  await expect(table).toContainText('Identity Provider');
  // Six days from the first case to the moment an agent connected them.
  await expect(table).toContainText('6d');

  // And the point-in-time metrics move with it.
  await expect(page.getByTestId('metric-timeToDetection')).not.toContainText('—');
  await expect(page.getByTestId('metric-recurringVolume')).not.toContainText('0%');
});
