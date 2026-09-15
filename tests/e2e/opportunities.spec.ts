/**
 * AC-6.1 through AC-6.7 — Product Opportunities through the UI.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/intelligence');
  await page.getByTestId('tab-opportunities').click();
  await page.getByTestId('opportunity-detail').waitFor();
});

test('AC-6.5 the backlog spans every roadmap state', async ({ page }) => {
  const table = page.getByTestId('opportunity-table');
  for (const state of ['discover', 'validate', 'planned', 'in_progress']) {
    await expect(table.locator(`[data-testid="opportunity-state-${state}"]`).first()).toBeVisible();
  }
});

test('AC-6.2 the panel shows substituted arithmetic, not just a score', async ({ page }) => {
  await page.getByTestId('opportunity-row-OPP-0005').click();

  const panel = page.getByTestId('priority-explanation');
  await expect(panel).toContainText('reachNorm');
  await expect(panel).toContainText('raw');
  await expect(panel).toContainText('priority');

  // The last line's right-hand side equals the headline score.
  const score = (await page.getByTestId('priority-score').innerText()).trim();
  await expect(panel).toContainText(`= ${score}`);
});

test('AC-6.1 every input is editable and the score recomputes', async ({ page }) => {
  await page.getByTestId('opportunity-row-OPP-0005').click();
  const score = page.getByTestId('priority-score');
  const before = await score.innerText();

  await page.getByTestId('priority-input-effort').fill('2');
  await expect(score).not.toHaveText(before);

  for (const key of ['impact', 'reachEmployees', 'confidence', 'effort', 'risk']) {
    await expect(page.getByTestId(`priority-input-${key}`)).toBeEditable();
  }
});

test('AC-6.1 inputs are keyboard operable', async ({ page }) => {
  await page.getByTestId('opportunity-row-OPP-0005').click();
  const input = page.getByTestId('priority-input-impact');
  await input.focus();
  await expect(input).toBeFocused();

  const before = await page.getByTestId('priority-score').innerText();
  await input.press('ArrowUp');
  await expect(page.getByTestId('priority-score')).not.toHaveText(before);
});

test('AC-6.3 lowering effort changes the ranking', async ({ page }) => {
  const rows = page.locator('[data-testid^="opportunity-row-"]');
  const topBefore = await rows.first().getAttribute('data-testid');

  // Take the lowest-ranked opportunity and make it cheap and certain.
  const last = rows.last();
  const lastId = await last.getAttribute('data-testid');
  expect(lastId).not.toBe(topBefore);
  await last.click();

  await page.getByTestId('priority-input-effort').fill('1');
  await page.getByTestId('priority-input-confidence').fill('1');
  await page.getByTestId('priority-input-impact').fill('5');

  await expect(rows.first()).toHaveAttribute('data-testid', lastId!);
});

test('AC-6.1 the detail stays pinned while its inputs are edited', async ({ page }) => {
  const rows = page.locator('[data-testid^="opportunity-row-"]');
  await rows.last().click();
  const title = await page.getByTestId('opportunity-detail').locator('h2').innerText();

  // Editing re-sorts the table; the panel must not swap out underneath.
  await page.getByTestId('priority-input-effort').fill('1');
  await page.getByTestId('priority-input-impact').fill('5');

  await expect(page.getByTestId('opportunity-detail').locator('h2')).toHaveText(title);
});

test('AC-6.6 out-of-range input shows an error and never renders NaN', async ({ page }) => {
  await page.getByTestId('opportunity-row-OPP-0005').click();

  await page.getByTestId('priority-input-impact').fill('99');
  await expect(page.getByTestId('priority-input-impact')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('priority-score')).toHaveText('0');
  await expect(page.getByTestId('priority-explanation')).not.toContainText('NaN');

  // Recovers.
  await page.getByTestId('priority-input-impact').fill('4');
  await expect(page.getByTestId('priority-input-impact')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByTestId('priority-score')).not.toHaveText('0');
});

test('AC-6.4 evidence links navigate to their source record', async ({ page }) => {
  await page.getByTestId('opportunity-row-OPP-0005').click();
  await expect(page.getByTestId('opportunity-evidence')).toBeVisible();

  const link = page.locator('[data-testid^="evidence-link-"]').first();
  if ((await link.count()) > 0) {
    await link.click();
    await expect(page).toHaveURL(/\/(agent|engineering)\//);
  }
});

test('AC-6.5 changing state updates the row', async ({ page }) => {
  await page.getByTestId('opportunity-row-OPP-0001').click();
  await page.getByTestId('opportunity-state').selectOption('planned');

  await expect(
    page.getByTestId('opportunity-row-OPP-0001').locator('[data-testid="opportunity-state-planned"]'),
  ).toBeVisible();
});

test('the dominant driver and sensitivity are shown', async ({ page }) => {
  await page.getByTestId('opportunity-row-OPP-0005').click();
  await expect(page.getByTestId('dominant-driver')).toBeVisible();
  await expect(page.getByTestId('sensitivity')).toContainText('would move this from');
});

test('AC-6.7 an opportunity created from an issue inherits its derived reach', async ({ page }) => {
  // Build the cluster and escalate it.
  await page.goto('/agent');
  await page.getByTestId('queue-search').fill('login loop');
  await page.locator('[data-testid^="queue-row-"]').first().locator('a').first().click();
  await page.getByTestId('case-detail').waitFor();
  for (let i = 0; i < 6; i++) {
    const enabled = page.locator('[data-testid^="mark-related-"]:not([disabled])');
    if ((await enabled.count()) === 0) break;
    await enabled.first().click();
  }
  await page.getByTestId('action-escalate-engineering').click();
  await page.getByTestId('issue-detail').waitFor();
  await page.getByTestId('create-opportunity').click();

  await expect(page.getByTestId('opportunity-detail')).toBeVisible();
  // Reach defaults to the issue's derived affected-employee count, not a typed value.
  await expect(page.getByTestId('priority-input-reachEmployees')).toHaveValue('4');
  await expect(page.getByTestId('reach-overridden')).toBeHidden();

  // Overriding it is marked, so the provenance stays visible.
  await page.getByTestId('priority-input-reachEmployees').fill('40');
  await expect(page.getByTestId('reach-overridden')).toBeVisible();
});
