/**
 * Engineering issues: impact, severity, and status propagation.
 *
 * The rule that matters here is that blast radius is *derived*. Affected-user
 * count, agent hours consumed, and employee minutes lost are all computed from
 * the linked cases, never typed in. An impact number that can be authored is an
 * opinion wearing a number's clothes, and the credibility of the whole
 * intelligence layer rests on the difference (ADR D-008).
 *
 * Severity is proposed rather than imposed. Engineers override heuristics all the
 * time and are usually right to; the honest design records the override and shows
 * it, instead of pretending the heuristic was authoritative.
 */
import { HOUR_MS, toMs, type Iso } from '../clock';
import type { CaseId, IssueId } from '../ids';
import type {
  BusinessImpact,
  CaseStatus,
  IssueStatus,
  Severity,
  SupportCase,
} from '../types';

/* ------------------------------------------------------------------ impact -- */

/** Modeled agent handling time per case, by urgency. A stated assumption. */
const AGENT_HOURS_BY_URGENCY = { critical: 2.5, high: 1.75, normal: 1, low: 0.5 } as const;

/** Modeled employee time lost per case, by urgency, in minutes. */
const EMPLOYEE_MINUTES_BY_URGENCY = { critical: 240, high: 150, normal: 60, low: 20 } as const;

/**
 * Compute business impact from the linked cases.
 *
 * The two time figures are modeled, not measured — this prototype has no
 * timesheet — so the multipliers live here as named constants rather than being
 * buried in a formula, and the UI labels them as estimates.
 */
export function deriveImpact(linkedCases: readonly SupportCase[]): BusinessImpact {
  const affectedEmployees = new Set(linkedCases.map((c) => c.employeeId)).size;

  let agentHoursConsumed = 0;
  let employeeMinutesLost = 0;
  for (const c of linkedCases) {
    // Rework multiplies agent cost: every bounce is the work done again.
    agentHoursConsumed += AGENT_HOURS_BY_URGENCY[c.urgency] * (1 + c.reworkCount * 0.5);
    employeeMinutesLost += EMPLOYEE_MINUTES_BY_URGENCY[c.urgency];
  }

  return {
    affectedEmployees,
    agentHoursConsumed: Math.round(agentHoursConsumed * 10) / 10,
    employeeMinutesLost,
    narrative:
      `${affectedEmployees} employee${affectedEmployees === 1 ? '' : 's'} across ` +
      `${linkedCases.length} case${linkedCases.length === 1 ? '' : 's'}, ` +
      `an estimated ${Math.round(agentHoursConsumed * 10) / 10} agent hours and ` +
      `${Math.round(employeeMinutesLost / 60)} employee hours lost.`,
  };
}

/* ---------------------------------------------------------------- severity -- */

export interface SeverityProposal {
  severity: Severity;
  /** The terms that decided it, for display next to the proposal. */
  reasons: string[];
}

/**
 * Propose a severity from affected-user count and the urgency mix.
 *
 * Deliberately simple and legible. An engineer reading this should be able to
 * predict the output, which is what makes disagreeing with it possible.
 */
export function proposeSeverity(linkedCases: readonly SupportCase[]): SeverityProposal {
  const affected = new Set(linkedCases.map((c) => c.employeeId)).size;
  const critical = linkedCases.filter((c) => c.urgency === 'critical').length;
  const high = linkedCases.filter((c) => c.urgency === 'high').length;

  const reasons = [
    `${affected} distinct employee${affected === 1 ? '' : 's'} affected`,
    `${high + critical} of ${linkedCases.length} cases reported high or critical`,
  ];

  let severity: Severity;
  if (critical > 0 || affected >= 20) {
    severity = 'sev1';
    reasons.push(critical > 0 ? 'A case was reported critical' : 'Affects 20 or more employees');
  } else if (affected >= 4 || high >= 3) {
    severity = 'sev2';
    reasons.push(affected >= 4 ? 'Affects 4 or more employees' : 'Three or more high-urgency cases');
  } else if (affected >= 2) {
    severity = 'sev3';
    reasons.push('Affects more than one employee');
  } else {
    severity = 'sev4';
    reasons.push('Single affected employee');
  }

  return { severity, reasons };
}

/* ------------------------------------------------------------- propagation -- */

/**
 * What an issue status means for the cases linked to it.
 *
 * `null` leaves the case status alone — `in_progress` on the issue is engineering
 * activity, not a change in what the support side is waiting for, and churning
 * case status for it would be noise in the audit history.
 */
export const PROPAGATION: Record<
  IssueStatus,
  { caseStatus: CaseStatus | null; updateBody: string }
> = {
  investigating: {
    caseStatus: 'waiting_on_engineering',
    updateBody:
      'We have identified a platform issue affecting your request and engineering is investigating. You do not need to do anything further for now.',
  },
  in_progress: {
    caseStatus: null,
    updateBody:
      'Engineering has confirmed the cause and a fix is in progress. We will let you know as soon as it is deployed.',
  },
  monitoring: {
    caseStatus: 'in_progress',
    updateBody:
      'A fix has been deployed and we are monitoring it. Please try again and tell us if the problem persists.',
  },
  resolved: {
    caseStatus: 'resolved',
    updateBody:
      'The underlying platform issue has been resolved. Your case is now closed — please reopen it if you see the problem again.',
  },
};

export interface PropagationPlan {
  issueId: IssueId;
  toStatus: IssueStatus;
  /** Cases whose status actually changes. */
  affectedCaseIds: CaseId[];
  /** The status they move to, or null when only a note is appended. */
  caseStatus: CaseStatus | null;
  /** Body of the update that will be drafted — unsent until a human sends it. */
  updateBody: string;
}

/**
 * Plan a propagation without applying it.
 *
 * Separating the plan from the write keeps the preview honest: the UI shows
 * exactly what will happen, computed by the same function that will do it.
 */
export function planPropagation(
  issueId: IssueId,
  toStatus: IssueStatus,
  linkedCases: readonly SupportCase[],
): PropagationPlan {
  const rule = PROPAGATION[toStatus];
  const affected =
    rule.caseStatus === null
      ? []
      : linkedCases.filter((c) => c.status !== rule.caseStatus && c.status !== 'closed');

  return {
    issueId,
    toStatus,
    affectedCaseIds: affected.map((c) => c.id),
    caseStatus: rule.caseStatus,
    updateBody: rule.updateBody,
  };
}

/** Display key for an issue, e.g. `IDP-207`. Cosmetic; no external system. */
export function issueKeyFor(system: string, sequence: number): string {
  const prefix =
    {
      'Identity Provider': 'IDP',
      'VPN Gateway': 'VPN',
      'Expense Platform': 'EXP',
      'Device Management': 'DEV',
      Directory: 'DIR',
      'Collaboration Suite': 'COL',
    }[system] ?? 'PLT';
  return `${prefix}-${200 + sequence}`;
}

/** Hours an issue has been open, for the detail header. */
export function issueAgeHours(createdAt: Iso, nowMs: number): number {
  return Math.round((nowMs - toMs(createdAt)) / HOUR_MS);
}
