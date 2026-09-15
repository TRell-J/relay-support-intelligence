/**
 * The guided demo.
 *
 * This list is the single source for both the in-app tour and the end-to-end
 * narrative test. They cannot drift apart, which is the point: a demo script
 * that is not executed by anything rots the first time a selector changes.
 *
 * Each step names what to do, where, and what it should prove — the assertion is
 * the reason the step exists, not a footnote.
 */
import type { GuidedStep, WorkspaceKey } from '../types';

export interface DemoBeat extends GuidedStep {
  /** Short headline shown in the tour panel. */
  title: string;
  /** What this beat is arguing, in the words you would say out loud. */
  say: string;
  route: string;
}

export const GUIDED_BEATS: DemoBeat[] = [
  {
    id: 'beat-1',
    title: 'Self-service that earns trust',
    workspace: 'help' satisfies WorkspaceKey,
    route: '/help',
    instruction: 'Launch the VPN scenario, then open "Why this confidence".',
    targetTestId: 'scenario-vpn_after_password_reset',
    assertion: 'Confidence 0.96, two fresh sources, four of four required points covered.',
    say: 'The answer cites sources with an owner and a review date. The confidence is not decoration — it is a weighted score over coverage, source authority, freshness and question match, and the breakdown adds up to the number beside it.',
  },
  {
    id: 'beat-2',
    title: 'Knowing what it does not know',
    workspace: 'help',
    route: '/help',
    instruction: 'Launch the expense-policy scenario.',
    targetTestId: 'scenario-expense_policy_exception',
    assertion: 'No sources retrieved, confidence 0.10, self-resolution disabled.',
    say: 'Nothing published covers any of the four things this question needs, so it declines rather than assembling something plausible from adjacent articles.',
  },
  {
    id: 'beat-3',
    title: 'Escalation that preserves context',
    workspace: 'help',
    route: '/help',
    instruction: 'Launch the SSO scenario, then choose "Still need help".',
    targetTestId: 'scenario-sso_login_loop',
    assertion: 'Capped at 0.45 by the identity-access ceiling; a case is created at 100% context completeness.',
    say: 'Two plausible articles came back and neither covers the post-reset case, so the score lands mid-band — and then the sensitive-domain ceiling pulls it to 0.45. The case that results carries all six context fields, so the agent asks nothing again.',
  },
  {
    id: 'beat-4',
    title: 'The moment of recognition',
    workspace: 'agent',
    route: '/agent',
    instruction: 'Open a login-loop case and mark every similar case related.',
    targetTestId: 'queue-search',
    assertion: 'A cluster forms across four cases and four employees, with its rationale printed.',
    say: 'One of these looks like user error. Four of them in six days, all after a password reset, all on one identity provider, is a platform defect. That distinction is the whole job of a support data foundation.',
  },
  {
    id: 'beat-5',
    title: 'Engineering handoff with a derived blast radius',
    workspace: 'engineering',
    route: '/engineering',
    instruction: 'Escalate the cluster, then move the issue to Monitoring.',
    targetTestId: 'action-escalate-engineering',
    assertion: 'Affected-employee count is derived, severity is proposed with reasons, and every linked case moves.',
    say: 'The impact numbers are computed from the linked cases, not typed in. And the employee updates are drafted unsent — the system will not tell anyone something happened until a person sends it and the log records it.',
  },
  {
    id: 'beat-6',
    title: 'Every number traces to an interaction',
    workspace: 'intelligence',
    route: '/intelligence',
    instruction: 'Filter to Access & Identity, then read the failed-search classification.',
    targetTestId: 'filter-category',
    assertion: 'Every panel recomputes; MFA is classed a policy gate rather than a knowledge gap.',
    say: 'MFA fails more often than anything else, and it is not a knowledge gap — the article exists, the topic is escalation-sensitive. Reporting it as a gap would commission an article that already exists and bury the real finding.',
  },
  {
    id: 'beat-7',
    title: 'Evidence becomes a roadmap decision',
    workspace: 'intelligence',
    route: '/intelligence?tab=opportunities',
    instruction: 'Open an opportunity and change its effort.',
    targetTestId: 'tab-opportunities',
    assertion: 'The score recomputes, the arithmetic restates itself, and the ranking moves.',
    say: 'The priority of this bet is defensible because every input traces to a recorded interaction. When someone asks why it sits above their preferred item, I can show the chain rather than the conviction.',
  },
];

export const TOTAL_BEATS = GUIDED_BEATS.length;
