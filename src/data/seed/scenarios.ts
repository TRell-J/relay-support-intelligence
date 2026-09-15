/**
 * The three seeded employee scenarios.
 *
 * Each one exercises a different outcome of the same machinery, which is why
 * there are exactly three and not a dozen:
 *
 *   VPN      self-service succeeds, and you can see why it was trustworthy
 *   Expense  a real knowledge gap, refused rather than papered over
 *   SSO      partial coverage plus a sensitive domain, escalating into a cluster
 *
 * `seedMessages` are the employee's turns only. Assistant turns are generated at
 * runtime from retrieval, so the transcript can never show an answer the scorer
 * did not actually produce.
 */
import type { DemoScenario } from '@/domain/types';

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'vpn_after_password_reset',
    label: 'VPN access after a password reset',
    blurb: 'Resolves through self-service with two fresh, high-authority sources.',
    intentKey: 'vpn_after_password_reset',
    category: 'Network & Devices',
    system: 'VPN Gateway',
    urgency: 'normal',
    expectedOutcome: 'self_service_resolved',
    seedMessages: [
      {
        author: 'employee',
        body: 'I reset my password this morning and now the VPN client will not connect. It just says authentication failed. I have tried it twice.',
      },
    ],
  },
  {
    id: 'expense_policy_exception',
    label: 'Expense policy exception',
    blurb: 'A genuine knowledge gap. The system declines rather than improvising.',
    intentKey: 'expense_policy_exception',
    category: 'Finance & Expense',
    system: 'Expense Platform',
    urgency: 'normal',
    expectedOutcome: 'escalated_knowledge_gap',
    seedMessages: [
      {
        author: 'employee',
        body: 'I hosted a client dinner last night that came to about 40% over the per-head limit. Is there a way to get an exception approved after the fact, or did I need pre-approval?',
      },
    ],
  },
  {
    id: 'sso_login_loop',
    label: 'SSO login loop',
    blurb: 'Escalates, clusters with four prior cases, and becomes an engineering issue.',
    intentKey: 'sso_login_loop',
    category: 'Access & Identity',
    system: 'Identity Provider',
    urgency: 'high',
    expectedOutcome: 'escalated_clustered',
    seedMessages: [
      {
        author: 'employee',
        body: 'Since my password reset yesterday I cannot get into any of the internal tools. Single sign-on sends me to the login page, I sign in, and it sends me straight back to the login page again.',
      },
      {
        author: 'employee',
        body: 'I have already tried a private window and clearing cookies. Same loop. I have a customer review in an hour and cannot get to my notes.',
      },
    ],
  },
];

export const SCENARIO_BY_ID = new Map(DEMO_SCENARIOS.map((s) => [s.id, s]));
