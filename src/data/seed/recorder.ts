/**
 * Seed-time recording helpers.
 *
 * Seeding and runtime both append to the same event log through helpers shaped
 * the same way, so a conversation created during the demo is indistinguishable
 * in structure from one that was seeded. If they diverged, metrics would quietly
 * treat "before the demo" and "during the demo" as different kinds of data.
 */
import type { Iso } from '@/domain/clock';
import type { CaseEventId } from '@/domain/ids';
import type { Actor, RelayEvent } from '@/domain/types';
import type { RelayState, SeedContext } from '../buildInitialState';

export const SYSTEM_ACTOR: Actor = { kind: 'system', id: null };
export const ASSISTANT_ACTOR: Actor = { kind: 'assistant', id: null };
export const employeeActor = (id: string): Actor => ({ kind: 'employee', id });
export const agentActor = (id: string): Actor => ({ kind: 'agent', id });
export const engineerActor = (id: string): Actor => ({ kind: 'engineer', id });

/**
 * Append one event and return its id, so callers can reference it from a
 * message's `actionRefs` without a second lookup (ADR D-006).
 */
export function record<T extends RelayEvent['type']>(
  state: RelayState,
  ctx: SeedContext,
  type: T,
  at: Iso,
  actor: Actor,
  payload: Extract<RelayEvent, { type: T }>['payload'],
): CaseEventId {
  const id = ctx.ids.next('event') as CaseEventId;
  state.events.push({ id, at, actor, type, payload } as RelayEvent);
  return id;
}
