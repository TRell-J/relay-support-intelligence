/**
 * The opportunity backlog.
 *
 * Five seeded bets plus one the demo creates from the SSO cluster. Each carries
 * evidence links back to the records that justify it, because an opportunity
 * without provenance is an opinion with a score attached.
 *
 * Two of these are deliberately *not* new features. Enterprise support platforms
 * are largely a portfolio of purchased tools, and a meaningful share of the work
 * is consolidation and retirement rather than building — a backlog with no
 * deprecation in it is not describing that job honestly.
 */
import { atHour } from '@/domain/clock';
import { formatId } from '@/domain/ids';
import type { OpportunityId, ProductOpportunity } from '@/domain/types';

interface OpportunitySeed {
  n: number;
  title: string;
  problemStatement: string;
  state: ProductOpportunity['state'];
  owner: string;
  targetHorizon: string;
  daysAgo: number;
  inputs: ProductOpportunity['inputs'];
  evidence: ProductOpportunity['evidence'];
}

const SEEDS: OpportunitySeed[] = [
  {
    n: 1,
    title: 'Publish an expense-exception path employees can self-serve',
    problemStatement:
      'Expense-policy exceptions are the largest true content gap in the knowledge base. Nothing published addresses pre-approval, thresholds, or the after-the-fact path, so every request becomes agent work.',
    state: 'validate',
    owner: 'Finance Systems',
    targetHorizon: 'Next quarter',
    daysAgo: 9,
    inputs: { impact: 3, reachEmployees: 15, confidence: 0.85, effort: 2, risk: 0.1, reachOverridden: false },
    evidence: [
      { kind: 'failed_search', ref: 'expense_policy_exception', summary: '15 failed searches, no results returned' },
      { kind: 'metric', ref: 'searchFailureRate', summary: 'Finance & Expense escalates every request' },
    ],
  },
  {
    n: 2,
    title: 'Make the MFA device-change handoff cheaper instead of writing an article',
    problemStatement:
      'MFA device changes are the most frequent failed search, but the article already covers them — the topic is escalation-sensitive and routes to a person by design. The cost is the handoff, not the content.',
    state: 'discover',
    owner: 'Identity & Access',
    targetHorizon: 'Exploring',
    daysAgo: 5,
    inputs: { impact: 3, reachEmployees: 18, confidence: 0.6, effort: 3, risk: 0.2, reachOverridden: false },
    evidence: [
      { kind: 'failed_search', ref: 'mfa_device_change', summary: '18 failures, all policy-gated rather than unanswered' },
      { kind: 'metric', ref: 'escalationRate', summary: 'Every one of these became a support case' },
    ],
  },
  {
    n: 3,
    title: 'Retire the legacy access-request form and consolidate on one intake',
    problemStatement:
      'Two intake paths exist for the same access requests. The older form bypasses structured context capture entirely, which is why context completeness never reaches 100%.',
    state: 'planned',
    owner: 'Workplace Technology',
    targetHorizon: 'This quarter',
    daysAgo: 21,
    inputs: { impact: 2, reachEmployees: 23, confidence: 0.9, effort: 2.5, risk: 0.15, reachOverridden: false },
    evidence: [
      { kind: 'metric', ref: 'contextCompleteness', summary: 'Cases from the legacy form arrive incomplete' },
    ],
  },
  {
    n: 4,
    title: 'Refresh the four knowledge articles past their review window',
    problemStatement:
      'Four articles are more than 90 days past review. Staleness reduces answer confidence directly, and one of them is the closest match for the SSO login loop.',
    state: 'planned',
    owner: 'Knowledge Management',
    targetHorizon: 'This quarter',
    daysAgo: 14,
    inputs: { impact: 2, reachEmployees: 12, confidence: 0.95, effort: 1, risk: 0.05, reachOverridden: false },
    evidence: [
      { kind: 'metric', ref: 'answerAcceptance', summary: 'Freshness is a weighted term in every confidence score' },
    ],
  },
  {
    n: 5,
    title: 'Surface recurring-issue detection to agents before they close a case',
    problemStatement:
      'Detection currently depends on an agent choosing to look for related cases. Time to detection is measured in days as a result.',
    state: 'in_progress',
    owner: 'Support Platform',
    targetHorizon: 'In flight',
    daysAgo: 30,
    inputs: { impact: 4, reachEmployees: 23, confidence: 0.7, effort: 4, risk: 0.25, reachOverridden: false },
    evidence: [
      { kind: 'metric', ref: 'timeToDetection', summary: 'Median detection lag across confirmed clusters' },
    ],
  },
];

export const SEEDED_OPPORTUNITIES: ProductOpportunity[] = SEEDS.map((seed) => ({
  id: formatId('opportunity', seed.n) as OpportunityId,
  title: seed.title,
  problemStatement: seed.problemStatement,
  state: seed.state,
  evidence: seed.evidence,
  inputs: seed.inputs,
  owner: seed.owner,
  targetHorizon: seed.targetHorizon,
  createdAt: atHour(seed.daysAgo, 11),
}));
