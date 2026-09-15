/**
 * AC-4.3 through AC-4.7 — engineering escalation through the UI.
 *
 * Each test builds the cluster first, because escalating a lone case and
 * escalating a recognized pattern are different products and the second is the
 * one the demo turns on.
 */
import { expect, test, type Page } from '@playwright/test';

async function formClusterAndEscalate(page: Page) {
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

  await expect(page.getByTestId('action-escalate-engineering')).toContainText('Escalate cluster');
  await page.getByTestId('action-escalate-engineering').click();
  await page.getByTestId('issue-detail').waitFor();
}

test('AC-4.3 escalation derives blast radius and proposes severity', async ({ page }) => {
  await formClusterAndEscalate(page);

  await expect(page).toHaveURL(/\/engineering\/ENG-\d{4}$/);

  // AC-8.4: affected employees is derived, and says so on screen.
  const employees = page.getByTestId('impact-employees');
  await expect(employees).toContainText('4');
  await expect(employees).toContainText('distinct employees across linked cases');

  await expect(page.getByTestId('severity-proposal')).toContainText('Sev 2');
  await expect(page.getByTestId('severity-proposal')).toContainText('4 distinct employees affected');

  // All four cluster members came across.
  const linked = page.getByTestId('linked-cases');
  for (const id of ['CASE-0052', 'CASE-0053', 'CASE-0054', 'CASE-0055']) {
    await expect(linked).toContainText(id);
  }
});

test('AC-4.6 the detail contrasts a single incident with the pattern', async ({ page }) => {
  await formClusterAndEscalate(page);

  const panel = page.getByTestId('incident-vs-systemic');
  await expect(panel).toContainText('Read alone');
  await expect(panel).toContainText('Nothing about it suggests a defect');
  await expect(panel).toContainText('Read together');
  await expect(panel).toContainText('That is a platform defect');
});

test('AC-4.4 status change previews exactly what it will do, then does it', async ({ page }) => {
  await formClusterAndEscalate(page);

  await page.getByTestId('issue-status-select').selectOption('monitoring');

  // Preview first: nothing has changed yet.
  const preview = page.getByTestId('propagation-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('4 linked cases move to In progress');
  await expect(preview).toContainText('left unsent');

  await page.getByTestId('propagation-confirm').click();
  await expect(preview).toBeHidden();

  // Every linked case moved.
  const linked = page.getByTestId('linked-cases');
  await expect(linked.locator('[data-testid="status-in_progress"]')).toHaveCount(4);
});

test('AC-4.4 propagation drafts employee updates and sends none of them', async ({ page }) => {
  await formClusterAndEscalate(page);

  const drafts = page.getByTestId('unsent-drafts');
  await expect(drafts).toBeVisible();
  await expect(drafts).toContainText('none sent');
  await expect(drafts).toContainText('Telling the employee is a separate, deliberate act');

  // Only an explicit send records it.
  await page.getByTestId('send-all-updates').click();
  await expect(drafts).toBeHidden();
  await expect(page.getByTestId('issue-timeline')).toBeVisible();
});

test('AC-4.4 cancelling a status change changes nothing', async ({ page }) => {
  await formClusterAndEscalate(page);

  await page.getByTestId('issue-status-select').selectOption('resolved');
  await expect(page.getByTestId('propagation-preview')).toBeVisible();
  await page.getByTestId('propagation-cancel').click();

  await expect(page.getByTestId('propagation-preview')).toBeHidden();
  // No case was resolved by opening a preview.
  await expect(page.getByTestId('linked-cases').locator('[data-testid="status-resolved"]')).toHaveCount(0);
});

test('AC-4.7 resolving the issue resolves every linked case', async ({ page }) => {
  await formClusterAndEscalate(page);

  await page.getByTestId('issue-status-select').selectOption('resolved');
  await page.getByTestId('propagation-confirm').click();

  await expect(
    page.getByTestId('linked-cases').locator('[data-testid="status-resolved"]'),
  ).toHaveCount(4);
  await expect(page.getByTestId('issue-timeline')).toContainText('Moved ENG-0001');
});

test('AC-4.5 a severity override is recorded and marked', async ({ page }) => {
  await formClusterAndEscalate(page);

  await page.getByTestId('issue-severity-select').selectOption('sev1');
  await expect(page.getByTestId('severity-override-note')).toContainText('derived proposal was Sev 2');
  await expect(page.getByTestId('severity-sev1')).toContainText('set');
});

test('the issue list ranks by derived blast radius', async ({ page }) => {
  await formClusterAndEscalate(page);
  await page.goto('/engineering');

  const table = page.getByTestId('issue-table');
  await expect(table).toBeVisible();
  await expect(table).toContainText('IDP-207');
  await expect(table).toContainText('Recurring');
});

test('the issue list has an honest empty state before anything is escalated', async ({ page }) => {
  await page.goto('/engineering');
  await expect(page.getByTestId('issues-empty')).toBeVisible();
  await expect(page.getByTestId('issues-empty')).toContainText('created from the Agent Workspace');
});

test('an unknown issue id renders a not-found state', async ({ page }) => {
  await page.goto('/engineering/ENG-9999');
  await expect(page.getByTestId('issue-not-found')).toBeVisible();
});

test('AC-4.3 the case detail links back to the issue after escalation', async ({ page }) => {
  await formClusterAndEscalate(page);

  await page.goto('/agent');
  await page.getByTestId('queue-search').fill('login loop');
  const rows = await page.locator('[data-testid^="queue-row-"]').count();
  if (rows > 0) {
    await page.locator('[data-testid^="queue-row-"]').first().locator('a').first().click();
    await expect(page.getByTestId('linked-issue')).toContainText('ENG-0001');
  }
});
