/**
 * Synthetic knowledge base.
 *
 * Entirely invented internal documentation. Article ids are stable and referenced
 * directly by the demo script and the acceptance tests.
 *
 * The corpus is authored to produce three distinct retrieval outcomes, because a
 * knowledge base where everything is findable proves nothing:
 *
 * - **Well covered** — VPN after password reset. Two fresh, high-authority
 *   articles cover every required concept, so self-service succeeds.
 * - **Partially covered** — SSO login loop. Adjacent articles exist but none
 *   covers the post-reset assertion failure, so confidence lands mid-band.
 * - **Uncovered** — expense-policy exceptions, contractor equipment, and parental
 *   leave top-up. Nothing acceptable exists; these are the knowledge gaps the
 *   intelligence layer surfaces.
 *
 * Four articles are deliberately stale (last reviewed more than 90 days before
 * the demo epoch) so the freshness penalty and the staleness flag are exercised.
 */
import { isoOffset } from '@/domain/clock';
import { formatId } from '@/domain/ids';
import type { ArticleId, KnowledgeArticle } from '@/domain/types';

interface ArticleSeed {
  /** Numeric suffix; ids are `KB-0104` style and are quoted in docs and tests. */
  n: number;
  title: string;
  space: string;
  ownerTeam: string;
  /** Days before the demo epoch that this was last reviewed. */
  reviewedDaysAgo: number;
  authority: number;
  concepts: string[];
  bodySummary: string;
}

const ARTICLE_SEEDS: ArticleSeed[] = [
  /* --- Access & Identity ------------------------------------------------- */
  {
    n: 104,
    title: 'Reconnecting to the VPN after a credential change',
    space: 'IT Service Desk Handbook',
    ownerTeam: 'Workplace Technology',
    reviewedDaysAgo: 12,
    authority: 0.94,
    concepts: ['vpn', 'password_reset', 'cached_credentials', 'reconnect', 'client_restart'],
    bodySummary:
      'After a password reset the VPN client keeps the previous credential in its keychain entry. Signing out of the client and reconnecting forces it to request the new one.',
  },
  {
    n: 118,
    title: 'Clearing a stored VPN credential on managed laptops',
    space: 'IT Service Desk Handbook',
    ownerTeam: 'Workplace Technology',
    reviewedDaysAgo: 27,
    authority: 0.88,
    concepts: ['vpn', 'cached_credentials', 'keychain', 'managed_device', 'client_restart'],
    bodySummary:
      'Step-by-step removal of the saved VPN entry from the device keychain, including the managed-laptop variant where the profile re-provisions on next connect.',
  },
  {
    n: 121,
    title: 'Single sign-on: what to try before raising a ticket',
    space: 'IT Service Desk Handbook',
    ownerTeam: 'Identity & Access',
    reviewedDaysAgo: 44,
    authority: 0.79,
    concepts: ['sso', 'login_loop', 'browser_cache', 'incognito', 'session_cookie'],
    bodySummary:
      'Common single sign-on failures and the three checks that resolve most of them: clear session cookies, retry in a private window, confirm the device clock.',
  },
  {
    n: 127,
    title: 'Changing your multi-factor authentication device',
    space: 'IT Service Desk Handbook',
    ownerTeam: 'Identity & Access',
    reviewedDaysAgo: 33,
    authority: 0.9,
    concepts: ['mfa', 'authenticator', 'device_change', 'enrollment', 'backup_codes'],
    bodySummary:
      'Self-service enrollment of a replacement authenticator, including how to use backup codes when the previous device is unavailable.',
  },
  {
    n: 132,
    title: 'Identity provider session lifetimes and re-authentication',
    space: 'Identity Platform Notes',
    ownerTeam: 'Identity & Access',
    // Stale on purpose: this is the article that *looks* relevant to the SSO loop.
    reviewedDaysAgo: 168,
    authority: 0.61,
    concepts: ['sso', 'session_cookie', 'session_lifetime', 'reauthentication', 'saml_assertion'],
    bodySummary:
      'Reference for configured session lifetimes across the identity provider and the conditions that trigger a forced re-authentication.',
  },
  {
    n: 139,
    title: 'Requesting access to a shared drive or team space',
    space: 'IT Service Desk Handbook',
    ownerTeam: 'Workplace Technology',
    reviewedDaysAgo: 21,
    authority: 0.85,
    concepts: ['shared_drive', 'permissions', 'access_request', 'approval', 'group_membership'],
    bodySummary:
      'How to request and approve access to shared storage, including which approver is required for each sensitivity tier.',
  },

  /* --- Network & Devices -------------------------------------------------- */
  {
    n: 143,
    title: 'Requesting a laptop replacement or upgrade',
    space: 'Workplace Services Guide',
    ownerTeam: 'Workplace Technology',
    reviewedDaysAgo: 38,
    authority: 0.87,
    concepts: ['laptop', 'hardware_replacement', 'refresh_cycle', 'asset_return', 'eligibility'],
    bodySummary:
      'Eligibility windows for the standard refresh cycle, the exception path for damaged hardware, and how the old device is returned.',
  },
  {
    n: 147,
    title: 'Wi-Fi and network troubleshooting in office locations',
    space: 'Workplace Services Guide',
    ownerTeam: 'Workplace Technology',
    reviewedDaysAgo: 56,
    authority: 0.74,
    concepts: ['wifi', 'network', 'connectivity', 'office_location', 'certificate'],
    bodySummary:
      'First-line checks for office network problems, covering certificate renewal prompts and the guest-network fallback.',
  },
  {
    n: 151,
    title: 'Device enrollment for new starters',
    space: 'Workplace Services Guide',
    ownerTeam: 'Workplace Technology',
    reviewedDaysAgo: 74,
    authority: 0.8,
    concepts: ['device_management', 'enrollment', 'new_starter', 'provisioning', 'managed_device'],
    bodySummary:
      'What happens automatically on first boot of a managed device, and the two steps a new starter has to complete themselves.',
  },
  {
    n: 156,
    title: 'Peripheral and accessory requests',
    space: 'Workplace Services Guide',
    ownerTeam: 'Workplace Technology',
    // Stale on purpose.
    reviewedDaysAgo: 203,
    authority: 0.52,
    concepts: ['peripherals', 'accessories', 'monitor', 'keyboard', 'budget_limit'],
    bodySummary:
      'Standing catalogue of approved accessories and the per-person annual limit.',
  },

  /* --- Finance & Expense --------------------------------------------------- */
  {
    n: 162,
    title: 'Submitting an expense claim',
    space: 'Finance Policy Library',
    ownerTeam: 'Finance Operations',
    reviewedDaysAgo: 18,
    authority: 0.91,
    concepts: ['expense', 'claim_submission', 'receipt', 'reimbursement', 'approval'],
    bodySummary:
      'The standard submission flow, required receipt formats, and expected reimbursement timing.',
  },
  {
    n: 165,
    title: 'Travel booking and per-diem rates',
    space: 'Finance Policy Library',
    ownerTeam: 'Finance Operations',
    reviewedDaysAgo: 49,
    authority: 0.86,
    concepts: ['travel', 'per_diem', 'booking', 'expense', 'rates'],
    bodySummary:
      'Approved booking channels and the current per-diem schedule by region.',
  },
  {
    n: 169,
    title: 'Corporate card issuance and limits',
    space: 'Finance Policy Library',
    ownerTeam: 'Finance Operations',
    reviewedDaysAgo: 62,
    authority: 0.83,
    concepts: ['corporate_card', 'spending_limit', 'issuance', 'expense'],
    bodySummary:
      'Who qualifies for a corporate card, default limits, and how to request a temporary increase.',
  },
  {
    n: 173,
    title: 'Purchase orders and vendor onboarding',
    space: 'Finance Policy Library',
    ownerTeam: 'Procurement',
    reviewedDaysAgo: 87,
    authority: 0.77,
    concepts: ['purchase_order', 'vendor', 'procurement', 'onboarding', 'approval'],
    bodySummary:
      'When a purchase order is required and the documents a new vendor must provide.',
  },

  /* --- People & Benefits ---------------------------------------------------- */
  {
    n: 178,
    title: 'Benefits enrollment windows',
    space: 'People Handbook',
    ownerTeam: 'People Operations',
    reviewedDaysAgo: 41,
    authority: 0.88,
    concepts: ['benefits', 'enrollment', 'open_enrollment', 'qualifying_event', 'deadline'],
    bodySummary:
      'Annual enrollment dates and the qualifying life events that open an out-of-cycle window.',
  },
  {
    n: 182,
    title: 'Payroll schedule and payslip access',
    space: 'People Handbook',
    ownerTeam: 'People Operations',
    reviewedDaysAgo: 29,
    authority: 0.89,
    concepts: ['payroll', 'payslip', 'pay_date', 'tax_documents', 'access'],
    bodySummary:
      'Pay dates by region, where payslips are published, and how to retrieve year-end tax documents.',
  },
  {
    n: 186,
    title: 'Time off: requesting, approving and carry-over',
    space: 'People Handbook',
    ownerTeam: 'People Operations',
    // Stale on purpose.
    reviewedDaysAgo: 154,
    authority: 0.6,
    concepts: ['time_off', 'leave_request', 'approval', 'carry_over', 'accrual'],
    bodySummary:
      'How to request time off, who approves it, and the carry-over rules at year end.',
  },

  /* --- Software & Tools ------------------------------------------------------ */
  {
    n: 191,
    title: 'Requesting a software license',
    space: 'IT Service Desk Handbook',
    ownerTeam: 'Workplace Technology',
    reviewedDaysAgo: 35,
    authority: 0.84,
    concepts: ['software_license', 'access_request', 'approval', 'cost_center', 'renewal'],
    bodySummary:
      'The license request path, which approvals apply by cost band, and how renewals are handled.',
  },
  {
    n: 195,
    title: 'Approved collaboration tools and when to use each',
    space: 'IT Service Desk Handbook',
    ownerTeam: 'Workplace Technology',
    reviewedDaysAgo: 67,
    authority: 0.71,
    concepts: ['collaboration', 'tooling', 'guidance', 'file_sharing', 'external_sharing'],
    bodySummary:
      'Guidance on which approved tool fits which kind of work, including external sharing constraints.',
  },
  {
    n: 199,
    title: 'Reporting a suspected phishing message',
    space: 'Security Guidance',
    ownerTeam: 'Security Operations',
    reviewedDaysAgo: 15,
    authority: 0.95,
    concepts: ['phishing', 'security_report', 'suspicious_email', 'escalation'],
    bodySummary:
      'How to report a suspected phishing attempt and what happens after a report is filed.',
  },

  /* --- Facilities ------------------------------------------------------------- */
  {
    n: 204,
    title: 'Building access and visitor registration',
    space: 'Workplace Services Guide',
    ownerTeam: 'Facilities',
    reviewedDaysAgo: 52,
    authority: 0.81,
    concepts: ['building_access', 'badge', 'visitor', 'registration', 'office_location'],
    bodySummary:
      'Badge activation for each office and the lead time required to register a visitor.',
  },
  {
    n: 208,
    title: 'Desk booking and office capacity',
    space: 'Workplace Services Guide',
    ownerTeam: 'Facilities',
    // Stale on purpose.
    reviewedDaysAgo: 191,
    authority: 0.55,
    concepts: ['desk_booking', 'office_capacity', 'reservation', 'office_location'],
    bodySummary:
      'How to reserve a desk and the capacity limits currently applied per floor.',
  },
];

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = ARTICLE_SEEDS.map((seed) => ({
  id: formatId('article', seed.n) as ArticleId,
  title: seed.title,
  space: seed.space,
  ownerTeam: seed.ownerTeam,
  lastReviewedAt: isoOffset({ days: -seed.reviewedDaysAgo }),
  authority: seed.authority,
  concepts: seed.concepts,
  bodySummary: seed.bodySummary,
}));

export const ARTICLE_BY_ID = new Map<ArticleId, KnowledgeArticle>(
  KNOWLEDGE_ARTICLES.map((a) => [a.id, a]),
);

/**
 * Topics with real demand and no acceptable article. These are asserted by the
 * knowledge-gap view; the absence is the point, so it is declared explicitly
 * rather than left to be inferred from missing data.
 */
export const DELIBERATE_KNOWLEDGE_GAPS = [
  {
    topicKey: 'expense_policy_exception',
    label: 'Expense policy exceptions and pre-approval',
    category: 'Finance & Expense' as const,
  },
  {
    topicKey: 'contractor_equipment',
    label: 'Equipment provisioning for contractors',
    category: 'Network & Devices' as const,
  },
  {
    topicKey: 'parental_leave_topup',
    label: 'Parental leave pay top-up eligibility',
    category: 'People & Benefits' as const,
  },
] as const;
