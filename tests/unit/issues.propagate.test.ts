/**
 * AC-4.3, AC-4.4, AC-4.7, AC-8.4 — engineering issues.
 *
 * The invariant under test throughout: impact numbers are derived from the
 * linked cases and cannot be authored (ADR D-008).
 */
import { describe, expect, it } from 'vitest';

import { buildInitialState } from '@/data/buildInitialState';
import { RELAY_SEED } from '@/data/prng';
import {
  PROPAGATION,
  deriveImpact,
  issueKeyFor,
  planPropagation,
  proposeSeverity,
} from '@/domain/issues/issue';
import { ISSUE_STATUSES, type IssueId, type SupportCase } from '@/domain/types';

const state = buildInitialState(RELAY_SEED);
const ssoCases = Object.values(state.cases).filter((c) => c.conceptTags.includes('login_loop'));

describe('AC-8.4 impact is derived from linked cases', () => {
  it('counts distinct employees, not cases', () => {
    const impact = deriveImpact(ssoCases);
    expect(impact.affectedEmployees).toBe(4);
    expect(impact.affectedEmployees).toBe(new Set(ssoCases.map((c) => c.employeeId)).size);
  });

  it('does not double-count an employee with two cases', () => {
    const duplicated = [...ssoCases, { ...ssoCases[0]!, id: 'CASE-9001' } as SupportCase];
    expect(deriveImpact(duplicated).affectedEmployees).toBe(4);
  });

  it('scales agent hours with rework, because a bounce is work done twice', () => {
    const base = ssoCases[1]!;
    const clean = deriveImpact([{ ...base, reworkCount: 0 }]);
    const bounced = deriveImpact([{ ...base, reworkCount: 2 }]);
    expect(bounced.agentHoursConsumed).toBeGreaterThan(clean.agentHoursConsumed);
  });

  it('produces a narrative that restates the derived figures', () => {
    const impact = deriveImpact(ssoCases);
    expect(impact.narrative).toContain(`${impact.affectedEmployees} employees`);
    expect(impact.narrative).toContain(`${ssoCases.length} cases`);
  });

  it('handles an empty set without dividing by zero', () => {
    const impact = deriveImpact([]);
    expect(impact.affectedEmployees).toBe(0);
    expect(impact.agentHoursConsumed).toBe(0);
    expect(Number.isNaN(impact.employeeMinutesLost)).toBe(false);
  });
});

describe('AC-4.3 severity is proposed from the data and explained', () => {
  it('proposes sev2 for the four-employee SSO cluster', () => {
    const proposal = proposeSeverity(ssoCases);
    expect(proposal.severity).toBe('sev2');
    expect(proposal.reasons.some((r) => r.includes('4 distinct employees'))).toBe(true);
  });

  it('escalates to sev1 when any case is critical', () => {
    const withCritical = [{ ...ssoCases[0]!, urgency: 'critical' as const }];
    expect(proposeSeverity(withCritical).severity).toBe('sev1');
  });

  it('proposes sev4 for a single affected employee', () => {
    expect(proposeSeverity([ssoCases[0]!]).severity).toBe('sev4');
  });

  it('proposes sev3 for two affected employees', () => {
    expect(proposeSeverity(ssoCases.slice(0, 2)).severity).toBe('sev3');
  });

  it('always explains itself', () => {
    for (const sample of [ssoCases, ssoCases.slice(0, 1), ssoCases.slice(0, 2)]) {
      expect(proposeSeverity(sample).reasons.length).toBeGreaterThan(1);
    }
  });
});

describe('AC-4.4 status propagation', () => {
  const issueId = 'ENG-0001' as IssueId;

  it('moves linked cases to waiting on engineering while investigating', () => {
    const plan = planPropagation(issueId, 'investigating', ssoCases);
    expect(plan.caseStatus).toBe('waiting_on_engineering');
    expect(plan.affectedCaseIds.length).toBeGreaterThan(0);
  });

  it('leaves case status alone for in_progress, which is engineering-side activity', () => {
    const plan = planPropagation(issueId, 'in_progress', ssoCases);
    expect(plan.caseStatus).toBeNull();
    expect(plan.affectedCaseIds).toEqual([]);
  });

  it('returns cases to in progress when a fix is being monitored', () => {
    const plan = planPropagation(issueId, 'monitoring', ssoCases);
    expect(plan.caseStatus).toBe('in_progress');
  });

  it('AC-4.7 resolves every linked case when the issue resolves', () => {
    const plan = planPropagation(issueId, 'resolved', ssoCases);
    expect(plan.caseStatus).toBe('resolved');
    // Every case not already resolved is included.
    const notResolved = ssoCases.filter((c) => c.status !== 'resolved' && c.status !== 'closed');
    expect(plan.affectedCaseIds).toHaveLength(notResolved.length);
  });

  it('never touches a closed case', () => {
    const withClosed = [{ ...ssoCases[0]!, status: 'closed' as const }, ...ssoCases.slice(1)];
    const plan = planPropagation(issueId, 'resolved', withClosed);
    expect(plan.affectedCaseIds).not.toContain(ssoCases[0]!.id);
  });

  it('carries an employee update body for every status', () => {
    for (const status of ISSUE_STATUSES) {
      const plan = planPropagation(issueId, status, ssoCases);
      expect(plan.updateBody.length).toBeGreaterThan(30);
      expect(PROPAGATION[status].updateBody).toBe(plan.updateBody);
    }
  });

  it('is idempotent: replanning after applying affects nothing', () => {
    const applied = ssoCases.map((c) => ({ ...c, status: 'waiting_on_engineering' as const }));
    expect(planPropagation(issueId, 'investigating', applied).affectedCaseIds).toEqual([]);
  });
});

describe('issue display keys', () => {
  it('derives a readable prefix from the affected system', () => {
    expect(issueKeyFor('Identity Provider', 7)).toBe('IDP-207');
    expect(issueKeyFor('VPN Gateway', 1)).toBe('VPN-201');
  });

  it('falls back rather than throwing on an unknown system', () => {
    expect(issueKeyFor('Something Else', 0)).toBe('PLT-200');
  });
});
