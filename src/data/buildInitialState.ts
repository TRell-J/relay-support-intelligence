/**
 * The seed.
 *
 * `buildInitialState(seed)` is a pure function: same seed in, byte-identical
 * state out. That is what makes Reset Demo an assertable guarantee rather than a
 * best effort, and what lets metric tests snapshot real derivations (ADR D-001).
 *
 * Nothing here reads the wall clock or `Math.random`. Timestamps come from
 * `isoOffset`, ids from the counter factory, and every stochastic choice from the
 * seeded PRNG.
 */
import { DEMO_NOW, isoOffset, type Iso } from '@/domain/clock';
import { createIdFactory, type IdFactory } from '@/domain/ids';
import type {
  Answer,
  Conversation,
  EmployeeUpdateDraft,
  EngineeringIssue,
  IssueCluster,
  Message,
  ProductOpportunity,
  RelayEvent,
  SupportCase,
} from '@/domain/types';
import { mulberry32, RELAY_SEED, type Prng } from './prng';
import { AGENTS, EMPLOYEES } from './seed/people';
import { KNOWLEDGE_ARTICLES } from './seed/articles';
import { DEMO_SCENARIOS } from './seed/scenarios';
import { buildBackgroundHistory } from './seed/history';
import { buildSsoNarrative } from './seed/narrative';
import { flagKnowledgeGaps } from './seed/gaps';
import { SEEDED_OPPORTUNITIES } from './seed/opportunities';

/** Everything the application holds. Serialized wholesale for persistence and reset. */
export interface RelayState {
  /** Bumped when this shape changes, so a stale persisted session resets cleanly. */
  schemaVersion: number;
  seed: number;
  /** Milliseconds the demo clock has advanced past DEMO_NOW. */
  clockOffsetMs: number;
  idCounters: Record<string, number>;

  conversations: Record<string, Conversation>;
  messages: Record<string, Message>;
  answers: Record<string, Answer>;
  cases: Record<string, SupportCase>;
  clusters: Record<string, IssueCluster>;
  issues: Record<string, EngineeringIssue>;
  opportunities: Record<string, ProductOpportunity>;
  updateDrafts: Record<string, EmployeeUpdateDraft>;

  /** Append-only. Every KPI is a pure function over this array. */
  events: RelayEvent[];

  /** Ordering for views that present records chronologically. */
  conversationOrder: string[];
  caseOrder: string[];
  issueOrder: string[];
}

export const SCHEMA_VERSION = 1;

/** Static reference data. Identical in every state, so it lives outside the store. */
export const REFERENCE = {
  employees: EMPLOYEES,
  agents: AGENTS,
  articles: KNOWLEDGE_ARTICLES,
  scenarios: DEMO_SCENARIOS,
} as const;

export interface SeedContext {
  ids: IdFactory;
  prng: Prng;
  now: Iso;
}

function emptyState(seed: number, ids: IdFactory): RelayState {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    clockOffsetMs: 0,
    idCounters: ids.snapshot(),
    conversations: {},
    messages: {},
    answers: {},
    cases: {},
    clusters: {},
    issues: {},
    opportunities: {},
    updateDrafts: {},
    events: [],
    conversationOrder: [],
    caseOrder: [],
    issueOrder: [],
  };
}

/**
 * Build the complete starting state.
 *
 * Order matters. Background history is generated first so that the hand-authored
 * narrative records land on top of a populated timeline with realistic ids,
 * rather than appearing as the only activity in the system.
 */
export function buildInitialState(seed: number = RELAY_SEED): RelayState {
  const ids = createIdFactory();
  const prng = mulberry32(seed);
  const state = emptyState(seed, ids);
  const ctx: SeedContext = { ids, prng, now: DEMO_NOW };

  buildBackgroundHistory(state, ctx);
  buildSsoNarrative(state, ctx);
  // Last: a knowledge gap is a property of the whole corpus, not of one pass.
  flagKnowledgeGaps(state, ctx);

  for (const opportunity of SEEDED_OPPORTUNITIES) {
    state.opportunities[opportunity.id] = opportunity;
  }
  // Advance the id counter past the seeded ids so runtime minting does not collide.
  for (let i = 0; i < SEEDED_OPPORTUNITIES.length; i++) ids.next('opportunity');

  state.idCounters = ids.snapshot();

  // Chronological, with id as a stable tiebreak so equal timestamps never reorder.
  state.events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id.localeCompare(b.id)));

  return state;
}

/** Serialize deterministically, for the reset guarantee and snapshot assertions. */
export function serializeState(state: RelayState): string {
  return JSON.stringify(state, Object.keys(state).sort());
}

/**
 * A stable hash of the serialized state.
 *
 * Used by the reset test to assert that a mutated session returns exactly to the
 * seeded state. FNV-1a: not cryptographic, just stable and dependency-free.
 */
export function hashState(state: RelayState): string {
  const text = serializeState(state);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Convenience for seed authoring: an instant N days before the demo present. */
export const daysAgo = (days: number, hours = 0, minutes = 0): Iso =>
  isoOffset({ days: -days, hours, minutes });
