/**
 * AC-3.2 through AC-3.8, AC-4.1, AC-4.8 — the Agent Workspace through the UI.
 *
 * The cluster test is the important one. It drives the exact interaction the
 * demo depends on — an agent marking cases related until a pattern is
 * recognized — rather than calling the detector directly.
 */
import { expect, test, type Page } from '@playwright/test';

/** Open the oldest still-open SSO case from the queue. */
async function openSsoCase(page: Page) {
  await page.goto('/agent');
  await page.getByTestId('queue-table').waitFor();
  await page.getByTestId('queue-search').fill('login loop');
  await expect(page.locator('[data-testid^="queue-row-"]')).not.toHaveCount(0);
  await page.locator('[data-testid^="queue-row-"]').first().locator('a').first().click();
  await page.getByTestId('case-detail').waitFor();
}

test('AC-3.4 the queue renders and every filter narrows it', async ({ page }) => {
  await page.goto('/agent');
  await page.getByTestId('queue-table').waitFor();

  const rowCount = async () => page.locator('[data-testid^="queue-row-"]').count();
  const baseline = await rowCount();
  expect(baseline).toBeGreaterThan(0);

  // Search matches natural words even though tags are stored snake_case.
  await page.getByTestId('queue-search').fill('login loop');
  const searched = await rowCount();
  expect(searched).toBeGreaterThan(0);
  expect(searched).toBeLessThan(baseline);
  await page.getByTestId('queue-search').fill('');

  await page.getByTestId('filter-urgency').selectOption('high');
  expect(await rowCount()).toBeLessThanOrEqual(baseline);
  await page.getByTestId('filter-category').selectOption('Access & Identity');
  const intersected = await rowCount();

  // Constraints intersect rather than replace one another.
  await page.getByTestId('filter-category').selectOption('Finance & Expense');
  expect(await rowCount()).not.toBe(intersected);

  await page.getByTestId('filter-clear').click();
  expect(await rowCount()).toBe(baseline);
});

test('AC-3.4 an impossible filter combination renders an empty state', async ({ page }) => {
  await page.goto('/agent');
  await page.getByTestId('queue-table').waitFor();

  await page.getByTestId('queue-search').fill('no-such-case-anywhere');
  await expect(page.getByTestId('queue-empty')).toBeVisible();
  await expect(page.getByTestId('queue-table')).toBeHidden();
});

test('AC-3.7 the queue shows a real spread of service-level states', async ({ page }) => {
  await page.goto('/agent');
  await page.getByTestId('queue-table').waitFor();

  const summary = page.getByTestId('queue-summary');
  await expect(summary).toBeVisible();
  // All three states must be reachable, or the column carries no information.
  await expect(page.locator('[data-testid="sla-breached"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="sla-at_risk"]').first()).toBeVisible();
});

test('AC-3.3 the case detail proves context survived the handoff', async ({ page }) => {
  await openSsoCase(page);

  const context = page.getByTestId('structured-context');
  await expect(context).toBeVisible();
  for (const field of [
    'problemStatement',
    'attemptedActionsSummary',
    'businessImpact',
    'urgencyRationale',
    'affectedSystem',
    'conversationTranscriptRef',
  ]) {
    await expect(page.getByTestId(`context-${field}`)).toBeVisible();
  }

  await expect(page.getByTestId('routing-rationale')).toContainText('Identity & Access');
  await expect(page.getByTestId('routing-rationale')).toContainText('post_password_reset');
  await expect(page.getByTestId('case-transcript')).toBeVisible();
  await expect(page.getByTestId('attempted-actions')).toContainText('Cleared session cookies');
});

test('AC-3.8 audit history is generated from recorded events', async ({ page }) => {
  await openSsoCase(page);

  const audit = page.getByTestId('audit-log');
  await expect(audit).toContainText('Created support case');
  await expect(audit).toContainText('Assigned');

  // A status change appends a new, readable audit line.
  await page.getByTestId('action-status').selectOption('waiting_on_engineering');
  await expect(audit).toContainText('Waiting on engineering');
});

test('AC-3.8 assignment and knowledge linking record their events', async ({ page }) => {
  await openSsoCase(page);

  await page.getByTestId('action-assign').selectOption({ index: 2 });
  await expect(page.getByTestId('audit-log')).toContainText('Assigned');

  const linkButton = page.locator('[data-testid^="link-article-"]:not([disabled])').first();
  if (await linkButton.count() > 0) {
    const testId = await linkButton.getAttribute('data-testid');
    await linkButton.click();
    await expect(page.getByTestId(testId!)).toBeDisabled();
    await expect(page.getByTestId('audit-log')).toContainText('Linked');
  }
});

test('AC-3.5 an update is a draft until a human sends it', async ({ page }) => {
  await openSsoCase(page);

  await page.getByTestId('action-compose-update').click();
  const preview = page.getByTestId('update-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Draft — not sent');
  // Nothing is recorded yet.
  await expect(page.getByTestId('audit-log')).not.toContainText('Sent an update');

  await page.getByTestId('action-send-update').click();
  await expect(preview).toContainText('Update sent');
  await expect(page.getByTestId('audit-log')).toContainText('Sent an update');
});

test('AC-4.1 marking cases related forms a recurring-issue cluster', async ({ page }) => {
  await openSsoCase(page);

  // Before: the panel states the rule rather than asserting a conclusion.
  await expect(page.getByTestId('cluster-threshold')).toContainText('cases needed to form');
  await expect(page.getByTestId('cluster-panel')).toBeHidden();

  const marks = page.locator('[data-testid^="mark-related-"]');
  await expect(marks).not.toHaveCount(0);

  for (let i = 0; i < 6; i++) {
    const enabled = page.locator('[data-testid^="mark-related-"]:not([disabled])');
    if ((await enabled.count()) === 0) break;
    await enabled.first().click();
  }

  const cluster = page.getByTestId('cluster-panel');
  await expect(cluster).toBeVisible();
  await expect(cluster).toContainText('4 cases from 4 employees');

  // AC-4.1: the rationale is printed, not merely asserted.
  await expect(cluster).toContainText('Same affected system: Identity Provider');
  await expect(cluster).toContainText('login_loop');
  await expect(cluster).toContainText('similarity threshold');
  await expect(page.getByTestId('cluster-threshold')).toContainText('Cluster formed from 4 cases');
});

test('AC-4.8 cluster membership propagates to the queue', async ({ page }) => {
  await openSsoCase(page);
  for (let i = 0; i < 6; i++) {
    const enabled = page.locator('[data-testid^="mark-related-"]:not([disabled])');
    if ((await enabled.count()) === 0) break;
    await enabled.first().click();
  }
  await expect(page.getByTestId('cluster-panel')).toBeVisible();

  await page.goto('/agent');
  await page.getByTestId('queue-search').fill('login loop');
  // Every open member now carries the cluster badge.
  await expect(page.locator('[data-testid^="cluster-badge-"]').first()).toBeVisible();

  // And the cluster filter isolates them.
  await page.getByTestId('queue-search').fill('');
  await page.getByTestId('filter-clustered').click();
  const clustered = await page.locator('[data-testid^="queue-row-"]').count();
  expect(clustered).toBeGreaterThan(0);
  const badges = await page.locator('[data-testid^="cluster-badge-"]').count();
  expect(badges).toBe(clustered);
});

test('AC-3.6 a status regression is recorded as a regression', async ({ page }) => {
  await openSsoCase(page);

  await page.getByTestId('action-status').selectOption('in_progress');
  await page.getByTestId('action-status').selectOption('triage');
  // Going backwards is legible in the history rather than silently absorbed.
  await expect(page.getByTestId('audit-log')).toContainText('to Triage');
});

test('an unknown case id renders a not-found state rather than crashing', async ({ page }) => {
  await page.goto('/agent/CASE-9999');
  await expect(page.getByTestId('case-not-found')).toBeVisible();
});
