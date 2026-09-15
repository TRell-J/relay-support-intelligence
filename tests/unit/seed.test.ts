/**
 * AC-1.3, AC-1.4, AC-1.7 — the seed.
 *
 * The reset guarantee and every metric snapshot rest on `buildInitialState` being
 * a pure function of its seed. These tests assert that, and also assert the shape
 * of the corpus the narrative depends on: if the SSO cases stop being four
 * distinct employees inside the clustering window, the demo silently stops
 * working and no other test would notice.
 */
import { describe, expect, it } from 'vitest';

import { buildInitialState, hashState, serializeState } from '@/data/buildInitialState';
import { RELAY_SEED } from '@/data/prng';
import { EMPLOYEES, ACTIVE_EMPLOYEE_COUNT, AGENTS } from '@/data/seed/people';
import { KNOWLEDGE_ARTICLES } from '@/data/seed/articles';
import { DEMO_SCENARIOS } from '@/data/seed/scenarios';
import { DEMO_NOW_MS, toMs } from '@/domain/clock';
import { daysSince } from '@/domain/time';
import { isStale } from '@/domain/retrieval/search';
import { contextCompleteness } from '@/domain/cases/context';

const state = buildInitialState(RELAY_SEED);

describe('AC-1.3 the seed is a pure function', () => {
  it('produces byte-identical state across two builds', () => {
    expect(serializeState(buildInitialState(RELAY_SEED))).toBe(
      serializeState(buildInitialState(RELAY_SEED)),
    );
  });

  it('produces a stable hash', () => {
    expect(hashState(buildInitialState(RELAY_SEED))).toBe(hashState(state));
  });

  it('produces different state for a different seed', () => {
    expect(hashState(buildInitialState(RELAY_SEED + 1))).not.toBe(hashState(state));
  });

  it('mints ids in a stable order', () => {
    const a = buildInitialState(RELAY_SEED);
    const b = buildInitialState(RELAY_SEED);
    expect(a.caseOrder).toEqual(b.caseOrder);
    expect(a.events.map((e) => e.id)).toEqual(b.events.map((e) => e.id));
  });
});

describe('AC-1.7 reference data matches the data dictionary', () => {
  it('seeds the documented population', () => {
    expect(EMPLOYEES).toHaveLength(24);
    expect(ACTIVE_EMPLOYEE_COUNT).toBe(23);
    expect(AGENTS).toHaveLength(5);
    expect(KNOWLEDGE_ARTICLES).toHaveLength(22);
    expect(DEMO_SCENARIOS).toHaveLength(3);
  });

  it('includes exactly four deliberately stale articles', () => {
    expect(KNOWLEDGE_ARTICLES.filter((a) => isStale(a))).toHaveLength(4);
  });

  it('gives every article a unique id and a review date in the past', () => {
    const ids = new Set(KNOWLEDGE_ARTICLES.map((a) => a.id));
    expect(ids.size).toBe(KNOWLEDGE_ARTICLES.length);
    for (const article of KNOWLEDGE_ARTICLES) {
      expect(daysSince(article.lastReviewedAt)).toBeGreaterThan(0);
      expect(article.authority).toBeGreaterThan(0);
      expect(article.authority).toBeLessThanOrEqual(1);
    }
  });
});

describe('the corpus has enough substance for filters and charts to mean something', () => {
  it('spans a usable history', () => {
    expect(Object.keys(state.conversations).length).toBeGreaterThan(120);
    expect(Object.keys(state.cases).length).toBeGreaterThan(40);
    expect(state.events.length).toBeGreaterThan(800);
  });

  it('orders the event log chronologically', () => {
    for (let i = 1; i < state.events.length; i++) {
      expect(toMs(state.events[i]!.at)).toBeGreaterThanOrEqual(toMs(state.events[i - 1]!.at));
    }
  });

  it('places every event at or before the demo present', () => {
    for (const event of state.events) {
      expect(toMs(event.at)).toBeLessThanOrEqual(DEMO_NOW_MS);
    }
  });

  it('contains both self-service resolutions and escalations', () => {
    const resolutions = Object.values(state.conversations).map((c) => c.resolution);
    expect(resolutions.filter((r) => r === 'self_service').length).toBeGreaterThan(20);
    expect(resolutions.filter((r) => r === 'escalated').length).toBeGreaterThan(20);
  });

  it('leaves context incomplete on some cases, so the metric can move', () => {
    const scores = Object.values(state.cases).map((c) => contextCompleteness(c.structuredContext));
    expect(Math.min(...scores)).toBeLessThan(1);
    expect(Math.max(...scores)).toBe(1);
  });

  it('records rework on some cases but not most', () => {
    const cases = Object.values(state.cases);
    const withRework = cases.filter((c) => c.reworkCount > 0);
    expect(withRework.length).toBeGreaterThan(0);
    expect(withRework.length).toBeLessThan(cases.length / 2);
  });

  it('flags the three deliberate knowledge gaps', () => {
    const flagged = state.events.filter((e) => e.type === 'kb.gap_flagged');
    expect(flagged.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * The narrative preconditions. The demo depends on all four of these; without
 * them the cluster either does not form or forms without meaning.
 */
describe('the SSO narrative is set up for the cluster to be a discovery', () => {
  const ssoCases = Object.values(state.cases).filter((c) => c.conceptTags.includes('login_loop'));

  it('seeds exactly four prior cases, leaving the fifth for the demo', () => {
    expect(ssoCases).toHaveLength(4);
  });

  it('spreads them across four distinct employees, so affected-user count is real', () => {
    expect(new Set(ssoCases.map((c) => c.employeeId)).size).toBe(4);
  });

  it('places all four inside the seven-day clustering window', () => {
    for (const c of ssoCases) {
      const age = daysSince(c.createdAt);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(7);
    }
  });

  it('gives them an identical cluster signature', () => {
    for (const c of ssoCases) {
      expect(c.category).toBe('Access & Identity');
      expect(c.system).toBe('Identity Provider');
      expect(c.conceptTags).toEqual(['login_loop', 'post_password_reset', 'saml_assertion']);
    }
  });

  it('leaves them unclustered, because detection happens on screen', () => {
    expect(ssoCases.every((c) => c.clusterId === null)).toBe(true);
    expect(Object.keys(state.clusters)).toHaveLength(0);
    expect(Object.keys(state.issues)).toHaveLength(0);
  });

  it('shows inconsistent handling, which is what hid the pattern', () => {
    const statuses = new Set(ssoCases.map((c) => c.status));
    expect(statuses.size).toBeGreaterThan(1);
    // One was closed as user error and reopened when the loop came back.
    expect(ssoCases.some((c) => c.reworkCount > 0)).toBe(true);
  });

  it('leaves one case with incomplete context, the one an agent had to chase', () => {
    const incomplete = ssoCases.filter((c) => contextCompleteness(c.structuredContext) < 1);
    expect(incomplete).toHaveLength(1);
  });

  it('records that every agent linked the same article and none of them resolved it', () => {
    expect(ssoCases.every((c) => c.linkedArticleIds.includes('KB-0121'))).toBe(true);
  });
});

describe('every case references data that exists', () => {
  it('points at a real employee and a real conversation', () => {
    const employeeIds = new Set(EMPLOYEES.map((e) => e.id));
    for (const c of Object.values(state.cases)) {
      expect(employeeIds.has(c.employeeId)).toBe(true);
      if (c.conversationId !== null) {
        expect(state.conversations[c.conversationId]).toBeDefined();
      }
    }
  });

  it('gives every conversation at least one message', () => {
    for (const conversation of Object.values(state.conversations)) {
      expect(conversation.messageIds.length).toBeGreaterThan(0);
      for (const id of conversation.messageIds) {
        expect(state.messages[id]).toBeDefined();
      }
    }
  });

  it('sets an SLA target after the creation time on every case', () => {
    for (const c of Object.values(state.cases)) {
      expect(toMs(c.slaTargetAt)).toBeGreaterThan(toMs(c.createdAt));
    }
  });
});
