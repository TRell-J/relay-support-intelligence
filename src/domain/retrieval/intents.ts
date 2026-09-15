/**
 * Intent catalogue.
 *
 * Each intent declares the concepts an answer *must* cover to be considered
 * complete. Coverage is the heaviest term in the confidence score, so this list
 * is what decides whether a question can be self-served.
 *
 * `requiredConcepts` is authored from the employee's point of view — what they
 * need to know — not from what the knowledge base happens to contain. That
 * asymmetry is deliberate: it is how a knowledge gap becomes measurable instead
 * of invisible.
 */
import type {
  AffectedSystem,
  IntentKey,
  SensitiveDomain,
  SupportCategory,
  Urgency,
} from '@/domain/types';

export interface IntentDefinition {
  key: IntentKey;
  /** Canonical phrasing, used as the search query and shown in failed-search views. */
  canonicalQuery: string;
  /** Normalized topic key so different phrasings aggregate into one gap. */
  topicKey: string;
  category: SupportCategory;
  system: AffectedSystem;
  defaultUrgency: Urgency;
  /** What a complete answer has to cover. Drives the coverage term. */
  requiredConcepts: string[];
  /** Tags used for cluster signatures when this intent becomes a case. */
  conceptTags: string[];
  /**
   * Escalation-sensitive classification. Any value here caps confidence at
   * SENSITIVE_DOMAIN_CEILING and blocks self-resolution, whatever the raw score
   * says (CLAUDE.md rule 7).
   */
  sensitiveDomain: SensitiveDomain | null;
  /** Free-text phrases that route to this intent. Lower-cased, matched on substring. */
  matchPhrases: string[];
}

export const INTENTS: IntentDefinition[] = [
  {
    key: 'vpn_after_password_reset',
    canonicalQuery: 'VPN will not connect after I reset my password',
    topicKey: 'vpn_after_password_reset',
    category: 'Network & Devices',
    system: 'VPN Gateway',
    defaultUrgency: 'normal',
    requiredConcepts: ['vpn', 'password_reset', 'cached_credentials', 'client_restart'],
    conceptTags: ['vpn', 'password_reset', 'cached_credentials'],
    sensitiveDomain: null,
    matchPhrases: ['vpn', 'cannot connect', 'password reset', 'remote access'],
  },
  {
    key: 'expense_policy_exception',
    canonicalQuery: 'Can I get an exception to the expense policy for a client dinner over the limit',
    topicKey: 'expense_policy_exception',
    category: 'Finance & Expense',
    system: 'Expense Platform',
    defaultUrgency: 'normal',
    // Nothing in the corpus covers any of these. That absence is the scenario.
    requiredConcepts: ['expense_policy', 'exception_request', 'pre_approval', 'spend_threshold'],
    conceptTags: ['expense_policy', 'exception_request', 'over_limit'],
    sensitiveDomain: 'policy_exception',
    matchPhrases: ['expense', 'exception', 'over the limit', 'policy', 'client dinner'],
  },
  {
    key: 'sso_login_loop',
    canonicalQuery: 'Single sign-on keeps redirecting me back to the login page after a password reset',
    topicKey: 'sso_login_loop',
    category: 'Access & Identity',
    system: 'Identity Provider',
    defaultUrgency: 'high',
    requiredConcepts: ['sso', 'login_loop', 'post_password_reset', 'saml_assertion'],
    conceptTags: ['login_loop', 'post_password_reset', 'saml_assertion'],
    sensitiveDomain: 'identity_access',
    matchPhrases: ['sso', 'single sign-on', 'login loop', 'redirect', 'cannot sign in'],
  },
  {
    key: 'laptop_replacement',
    canonicalQuery: 'How do I request a replacement laptop',
    topicKey: 'laptop_replacement',
    category: 'Network & Devices',
    system: 'Device Management',
    defaultUrgency: 'normal',
    requiredConcepts: ['laptop', 'hardware_replacement', 'eligibility'],
    conceptTags: ['laptop', 'hardware_replacement'],
    sensitiveDomain: null,
    matchPhrases: ['laptop', 'replacement', 'new machine', 'broken screen'],
  },
  {
    key: 'payroll_question',
    canonicalQuery: 'Where do I find my payslip and year-end tax documents',
    topicKey: 'payroll_access',
    category: 'People & Benefits',
    system: 'Directory',
    defaultUrgency: 'low',
    requiredConcepts: ['payroll', 'payslip', 'access'],
    conceptTags: ['payroll', 'payslip'],
    sensitiveDomain: null,
    matchPhrases: ['payslip', 'payroll', 'tax document', 'pay date'],
  },
  {
    key: 'software_license_request',
    canonicalQuery: 'How do I request a license for design software',
    topicKey: 'software_license_request',
    category: 'Software & Tools',
    system: 'Collaboration Suite',
    defaultUrgency: 'low',
    requiredConcepts: ['software_license', 'access_request', 'approval'],
    conceptTags: ['software_license', 'access_request'],
    sensitiveDomain: null,
    matchPhrases: ['license', 'software request', 'subscription', 'seat'],
  },
  {
    key: 'mfa_device_change',
    canonicalQuery: 'I have a new phone and need to move my authenticator',
    topicKey: 'mfa_device_change',
    category: 'Access & Identity',
    system: 'Identity Provider',
    defaultUrgency: 'high',
    requiredConcepts: ['mfa', 'device_change', 'enrollment'],
    conceptTags: ['mfa', 'device_change'],
    sensitiveDomain: 'identity_access',
    matchPhrases: ['mfa', 'authenticator', 'new phone', 'two factor'],
  },
  {
    key: 'building_access',
    canonicalQuery: 'My badge will not open the office door',
    topicKey: 'building_access',
    category: 'Facilities',
    system: 'Directory',
    defaultUrgency: 'normal',
    requiredConcepts: ['building_access', 'badge'],
    conceptTags: ['building_access', 'badge'],
    sensitiveDomain: null,
    matchPhrases: ['badge', 'door', 'building access', 'office entry'],
  },
  {
    key: 'benefits_enrollment',
    canonicalQuery: 'When can I change my benefits selections',
    topicKey: 'benefits_enrollment',
    category: 'People & Benefits',
    system: 'Directory',
    defaultUrgency: 'low',
    requiredConcepts: ['benefits', 'enrollment', 'deadline'],
    conceptTags: ['benefits', 'enrollment'],
    sensitiveDomain: null,
    matchPhrases: ['benefits', 'enrollment', 'health plan', 'open enrollment'],
  },
  {
    key: 'shared_drive_permissions',
    canonicalQuery: 'I need access to a shared team drive',
    topicKey: 'shared_drive_permissions',
    category: 'Software & Tools',
    system: 'Collaboration Suite',
    defaultUrgency: 'normal',
    requiredConcepts: ['shared_drive', 'permissions', 'access_request'],
    conceptTags: ['shared_drive', 'permissions'],
    sensitiveDomain: null,
    matchPhrases: ['shared drive', 'permission', 'folder access', 'team space'],
  },
];

export const INTENT_BY_KEY = new Map<IntentKey, IntentDefinition>(INTENTS.map((i) => [i.key, i]));

export function requireIntent(key: IntentKey): IntentDefinition {
  const intent = INTENT_BY_KEY.get(key);
  if (!intent) throw new Error(`Unknown intent: ${key}`);
  return intent;
}

export interface IntentMatch {
  intent: IntentDefinition;
  /** How many match phrases fired. Zero means this was a fallback. */
  matchedPhraseCount: number;
  /**
   * True when free text did not clearly match, so the UI must disclose that it
   * fell back to the nearest seeded intent rather than implying generation.
   */
  isFallback: boolean;
}

/**
 * Map free text to the nearest seeded intent.
 *
 * This is substring matching, not language understanding, and the UI says so.
 * The prototype's honesty rule extends to its own capabilities: it would be
 * simple to make this look smarter and dishonest to do it (ADR D-005).
 */
export function matchIntent(input: string): IntentMatch {
  const text = input.toLowerCase();

  let best: IntentDefinition | null = null;
  let bestCount = 0;

  for (const intent of INTENTS) {
    const count = intent.matchPhrases.filter((phrase) => text.includes(phrase)).length;
    if (count > bestCount) {
      best = intent;
      bestCount = count;
    }
  }

  if (best === null || bestCount === 0) {
    return { intent: INTENTS[0]!, matchedPhraseCount: 0, isFallback: true };
  }
  return { intent: best, matchedPhraseCount: bestCount, isFallback: false };
}
