/**
 * AC-2.5, AC-8.1 — the action-claim integrity rule.
 *
 * These are release-blocking. If the guard stops firing, the product can assert
 * things that never happened, which is the exact failure the prototype argues
 * against (ADR D-006).
 */
import { describe, expect, it } from 'vitest';

import { DEMO_NOW } from '@/domain/clock';
import {
  UnrecordedActionClaimError,
  assertActionsRecorded,
  buildEventIndex,
  checkActionsRecorded,
  formatActionClaim,
  resolveActionClaims,
} from '@/domain/trust/actionClaims';
import { RELAY_EVENT_TYPES, type CaseEventId, type RelayEvent } from '@/domain/types';

const systemActor = { kind: 'system' as const, id: null };

const caseCreated: RelayEvent = {
  id: 'EVT-00001' as CaseEventId,
  at: DEMO_NOW,
  actor: systemActor,
  type: 'case.created',
  payload: {
    caseId: 'CASE-0013',
    conversationId: 'CONV-0007',
    employeeId: 'EMP-0001',
    category: 'Access & Identity',
    system: 'Identity Provider',
    urgency: 'high',
    source: 'low_confidence_handoff',
    contextCompleteness: 1,
  },
};

const statusChanged: RelayEvent = {
  id: 'EVT-00002' as CaseEventId,
  at: DEMO_NOW,
  actor: { kind: 'agent', id: 'AGT-0001' },
  type: 'case.status_changed',
  payload: { caseId: 'CASE-0013', from: 'new', to: 'in_progress', reason: null, isRegression: false },
};

const log = [caseCreated, statusChanged];
const index = buildEventIndex(log);

describe('AC-8.1 claims are generated from events, not authored', () => {
  it('renders a case creation as a past-tense statement of what the log holds', () => {
    expect(formatActionClaim(caseCreated)).toBe(
      'Created support case CASE-0013 and routed it for triage.',
    );
  });

  it('renders a status change using the recorded from and to values', () => {
    expect(formatActionClaim(statusChanged)).toBe('Moved CASE-0013 from New to In progress.');
  });

  it('returns an empty claim for observational events, so nothing is asserted', () => {
    const observed: RelayEvent = {
      id: 'EVT-00003' as CaseEventId,
      at: DEMO_NOW,
      actor: systemActor,
      type: 'answer.presented',
      payload: {
        conversationId: 'CONV-0007',
        answerId: 'ANS-0001',
        confidence: 0.96,
        band: 'high',
        articleIds: ['KB-0104'],
        sensitiveDomain: null,
      },
    };
    expect(formatActionClaim(observed)).toBe('');
  });

  it('never throws for any event type in the union', () => {
    // A new event type must not be able to crash the audit renderer.
    expect(RELAY_EVENT_TYPES.length).toBeGreaterThan(20);
    for (const event of log) {
      expect(() => formatActionClaim(event)).not.toThrow();
    }
  });
});

describe('AC-2.5 the guard fires on a dangling reference', () => {
  it('passes a message whose refs all exist', () => {
    const result = checkActionsRecorded({ id: 'MSG-0001', actionRefs: ['EVT-00001'] }, index);
    expect(result.ok).toBe(true);
    expect(result.missingRefs).toEqual([]);
  });

  it('passes a message that asserts nothing', () => {
    expect(checkActionsRecorded({ id: 'MSG-0002', actionRefs: [] }, index).ok).toBe(true);
  });

  it('detects a reference to an event that was never recorded', () => {
    const result = checkActionsRecorded(
      { id: 'MSG-0003', actionRefs: ['EVT-00001', 'EVT-99999' as CaseEventId] },
      index,
    );
    expect(result.ok).toBe(false);
    expect(result.missingRefs).toEqual(['EVT-99999']);
  });

  it('throws outside production, naming the message and the missing refs', () => {
    expect(() =>
      assertActionsRecorded({ id: 'MSG-0004', actionRefs: ['EVT-99999' as CaseEventId] }, index, {
        throwOnFailure: true,
      }),
    ).toThrow(UnrecordedActionClaimError);

    try {
      assertActionsRecorded({ id: 'MSG-0004', actionRefs: ['EVT-99999' as CaseEventId] }, index, {
        throwOnFailure: true,
      });
    } catch (error) {
      expect((error as Error).message).toContain('MSG-0004');
      expect((error as Error).message).toContain('EVT-99999');
      expect((error as Error).message).toContain('ADR D-006');
    }
  });

  it('degrades to a reported failure rather than a crash in production', () => {
    const result = assertActionsRecorded(
      { id: 'MSG-0005', actionRefs: ['EVT-99999' as CaseEventId] },
      index,
      { throwOnFailure: false },
    );
    expect(result.ok).toBe(false);
    expect(result.missingRefs).toEqual(['EVT-99999']);
  });
});

describe('resolving claims for the audit view', () => {
  it('returns one generated sentence per recorded action', () => {
    const claims = resolveActionClaims({ actionRefs: ['EVT-00001', 'EVT-00002'] }, log);
    expect(claims).toHaveLength(2);
    expect(claims[0]!.claim).toContain('Created support case CASE-0013');
    expect(claims[1]!.claim).toContain('Moved CASE-0013');
  });

  it('silently drops unresolvable refs, leaving the guard to report them', () => {
    const claims = resolveActionClaims(
      { actionRefs: ['EVT-00001', 'EVT-99999' as CaseEventId] },
      log,
    );
    expect(claims).toHaveLength(1);
  });

  it('omits observational events, which make no claim', () => {
    const claims = resolveActionClaims({ actionRefs: [] }, log);
    expect(claims).toEqual([]);
  });
});
