/**
 * AC-7.1, AC-7.2, AC-7.3, AC-1.4 — the seven-beat narrative, end to end.
 *
 * This is the test that matters most. It walks the demo exactly as a reviewer
 * would and asserts the state at each beat, so the script in docs/DEMO_SCRIPT.md
 * is executed rather than merely written down.
 */
import { expect, test, type Page } from '@playwright/test';

async function openSsoCase(page: Page) {
  await page.goto('/agent');
  await page.getByTestId('queue-search').fill('login loop');
  await page.locator('[data-testid^="queue-row-"]').first().locator('a').first().click();
  await page.getByTestId('case-detail').waitFor();
}

test('the full seven-beat narrative', async ({ page }) => {
  /* --- Beat 1: self-service that earns trust --- */
  await page.goto('/help');
  await page.getByTestId('scenario-vpn_after_password_reset').click();
  await expect(page.getByTestId('answer-panel')).toBeVisible();
  await expect(page.getByTestId('confidence-band')).toContainText('0.96');
  await expect(page.getByTestId('source-card-KB-0104')).toBeVisible();
  await page.getByTestId('feedback-helpful').click();
  await page.getByTestId('action-resolve').click();
  await expect(page.getByTestId('action-claims')).toContainText('resolved through self-service');

  /* --- Beat 2: knowing what it does not know --- */
  await page.getByTestId('composer').fill('expense exception over the limit for a client dinner');
  await page.getByTestId('composer-send').click();
  await expect(page.getByTestId('source-list-empty')).toBeVisible();
  await expect(page.getByTestId('action-resolve')).toBeDisabled();

  /* --- Beat 3: escalation that preserves context --- */
  await page.getByTestId('new-conversation').click();
  await page.getByTestId('scenario-sso_login_loop').click();
  await expect(page.getByTestId('confidence-band')).toContainText('0.45');
  await page.getByTestId('action-escalate').click();
  await expect(page).toHaveURL(/\/agent\/CASE-\d{4}$/);
  await expect(page.getByTestId('context-complete')).toContainText('All six required fields');

  /* --- Beat 4: the moment of recognition --- */
  await openSsoCase(page);
  await expect(page.getByTestId('cluster-panel')).toBeHidden();
  for (let i = 0; i < 8; i++) {
    const enabled = page.locator('[data-testid^="mark-related-"]:not([disabled])');
    if ((await enabled.count()) === 0) break;
    await enabled.first().click();
  }
  const cluster = page.getByTestId('cluster-panel');
  await expect(cluster).toBeVisible();
  await expect(cluster).toContainText('Same affected system: Identity Provider');
  await expect(cluster).toContainText('similarity threshold');

  /* --- Beat 5: engineering handoff with a derived blast radius --- */
  await page.getByTestId('action-escalate-engineering').click();
  await expect(page.getByTestId('issue-detail')).toBeVisible();
  await expect(page.getByTestId('impact-employees')).toContainText('distinct employees across linked cases');
  await expect(page.getByTestId('severity-proposal')).toContainText('Sev');

  await page.getByTestId('issue-status-select').selectOption('monitoring');
  await expect(page.getByTestId('propagation-preview')).toContainText('left unsent');
  await page.getByTestId('propagation-confirm').click();
  await expect(page.getByTestId('unsent-drafts')).toContainText('none sent');

  /* --- Beat 6: every number traces to an interaction --- */
  await page.goto('/intelligence');
  await page.getByTestId('range-All').click();
  await expect(page.getByTestId('metric-grid')).toBeVisible();
  await expect(page.getByTestId('cluster-table')).toContainText('CLU-0001');
  await expect(page.getByTestId('metric-timeToDetection')).not.toContainText('—');
  await expect(page.getByTestId('failed-searches')).toContainText('Policy gate');
  await expect(page.getByTestId('knowledge-gaps')).not.toContainText('mfa device change');

  /* --- Beat 7: evidence becomes a roadmap decision --- */
  await page.getByTestId('tab-opportunities').click();
  await page.getByTestId('opportunity-detail').waitFor();
  await page.locator('[data-testid^="opportunity-row-"]').first().click();
  const score = page.getByTestId('priority-score');
  const before = await score.innerText();
  await page.getByTestId('priority-input-confidence').fill('1');
  await expect(score).not.toHaveText(before);
  await expect(page.getByTestId('priority-explanation')).toContainText('reachNorm');
});

test('AC-7.1 the guided tour walks all seven beats', async ({ page }) => {
  await page.goto('/help');
  await page.getByTestId('run-guided-demo').click();

  const panel = page.getByTestId('guided-demo-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Beat 1 of 7');
  await expect(page.getByTestId('beat-title')).toContainText('Self-service that earns trust');

  for (let i = 2; i <= 7; i++) {
    await page.getByTestId('beat-next').click();
    await expect(panel).toContainText(`Beat ${i} of 7`);
    await expect(page.getByTestId('beat-instruction')).not.toBeEmpty();
    await expect(page.getByTestId('beat-say')).not.toBeEmpty();
  }

  // The last beat finishes rather than advancing past the end.
  await expect(page.getByTestId('beat-next')).toContainText('Finish');
  await page.getByTestId('beat-next').click();
  await expect(panel).toBeHidden();
});

test('AC-7.1 the tour navigates to the workspace each beat describes', async ({ page }) => {
  await page.goto('/help');
  await page.getByTestId('run-guided-demo').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('beat-next').click();
  await expect(page).toHaveURL(/\/agent/);
});

test('AC-1.4 reset restores the seeded state after a full run', async ({ page }) => {
  await page.goto('/agent');
  await page.getByTestId('queue-search').fill('login loop');
  await page.locator('[data-testid^="queue-row-"]').first().locator('a').first().click();
  for (let i = 0; i < 8; i++) {
    const enabled = page.locator('[data-testid^="mark-related-"]:not([disabled])');
    if ((await enabled.count()) === 0) break;
    await enabled.first().click();
  }
  await page.getByTestId('action-escalate-engineering').click();
  await expect(page.getByTestId('issue-detail')).toBeVisible();

  await page.getByTestId('reset-demo').click();
  await page.getByTestId('reset-demo').click();

  // Back to a world with no clusters and no issues.
  await page.goto('/engineering');
  await expect(page.getByTestId('issues-empty')).toBeVisible();
  await page.goto('/intelligence');
  await expect(page.getByTestId('cluster-table')).toContainText('No recurring-issue clusters');
});
