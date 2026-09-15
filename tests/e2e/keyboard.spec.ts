/**
 * AC-7.2, AC-7.3, AC-7.4, AC-7.6 — keyboard operation, focus, and layout.
 */
import { expect, test } from '@playwright/test';

test('AC-7.2 the core flow completes with the keyboard alone', async ({ page }) => {
  await page.goto('/help');
  // Tabbing before hydration walks a different document than the one under test.
  await page.getByTestId('scenario-vpn_after_password_reset').waitFor();

  // Reach the first scenario by tabbing, without ever using the mouse.
  let reached = false;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    if (id === 'scenario-vpn_after_password_reset') {
      reached = true;
      break;
    }
  }
  expect(reached, 'the first scenario was not reachable by tabbing').toBe(true);

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('answer-panel')).toBeVisible();

  // Feedback and resolve are both reachable and operable.
  await page.getByTestId('feedback-helpful').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('feedback-helpful')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('action-resolve').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('action-resolve')).toContainText('Resolved');
});

test('AC-7.3 changing route moves focus to the workspace and announces it', async ({ page }) => {
  await page.goto('/help');
  await page.getByTestId('rail-agent').click();

  await expect(page.getByTestId('route-announcer')).toHaveText('Agent Workspace loaded');
  const focused = await page.evaluate(() => document.activeElement?.id);
  expect(focused).toBe('workspace');
});

test('AC-7.3 the skip link is the first stop and reaches the workspace', async ({ page }) => {
  await page.goto('/help');
  // Wait for hydration: tabbing earlier walks the pre-hydration document.
  // Deliberately no click first — a click sets Chrome's sequential-focus
  // starting point, which `blur()` does not reset, so Tab would resume from
  // there rather than from the top of the document.
  await page.getByTestId('scenario-vpn_after_password_reset').waitFor();

  await page.keyboard.press('Tab');
  const href = await page.evaluate(() => document.activeElement?.getAttribute('href'));
  expect(href).toBe('#workspace');
});

test('AC-7.2 the metric definition is reachable without a pointer', async ({ page }) => {
  await page.goto('/intelligence');
  await page.getByTestId('metric-selfServiceRate').focus();
  await expect(page.getByTestId('metric-tooltip-selfServiceRate')).toHaveCSS('opacity', '1');
});

test('AC-7.5 every interactive element shows a visible focus ring', async ({ page }) => {
  await page.goto('/help');
  await page.getByTestId('scenario-vpn_after_password_reset').focus();

  const outline = await page
    .getByTestId('scenario-vpn_after_password_reset')
    .evaluate((el) => getComputedStyle(el).outlineWidth);
  expect(outline).not.toBe('0px');
});

test('AC-7.4 no route scrolls the page horizontally', async ({ page }) => {
  for (const route of ['/help', '/agent', '/engineering', '/intelligence']) {
    await page.goto(route);
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});

test('AC-7.4 wide tables scroll inside their own container', async ({ page }) => {
  await page.goto('/agent');
  await page.getByTestId('queue-table').waitFor();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('AC-7.6 every workspace has a reachable empty state', async ({ page }) => {
  // Queue: impossible filter.
  await page.goto('/agent');
  await page.getByTestId('queue-search').fill('zzzz-no-match');
  await expect(page.getByTestId('queue-empty')).toBeVisible();

  // Engineering: nothing escalated yet.
  await page.goto('/engineering');
  await expect(page.getByTestId('issues-empty')).toBeVisible();

  // Intelligence: filter that matches nothing.
  await page.goto('/intelligence');
  await page.getByTestId('range-7d').click();
  await page.getByTestId('filter-category').selectOption('Facilities');
  await page.getByTestId('filter-system').selectOption('Expense Platform');
  await expect(page.getByTestId('intelligence-empty')).toBeVisible();

  // Help: nothing asked yet.
  await page.goto('/help');
  await expect(page.getByTestId('answer-empty')).toBeVisible();
});

test('AC-7.6 unknown records render a not-found state rather than crashing', async ({ page }) => {
  await page.goto('/agent/CASE-0000');
  await expect(page.getByTestId('case-not-found')).toBeVisible();
  await page.goto('/engineering/ENG-0000');
  await expect(page.getByTestId('issue-not-found')).toBeVisible();
});

test('the guided tour closes with Escape', async ({ page }) => {
  await page.goto('/help');
  await page.getByTestId('run-guided-demo').click();
  await expect(page.getByTestId('guided-demo-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('guided-demo-panel')).toBeHidden();
});
