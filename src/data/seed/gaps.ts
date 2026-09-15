/**
 * Knowledge-gap flagging.
 *
 * Runs after every other seed step, because a gap is a property of the whole
 * corpus: flagging from inside the background generator missed the hand-authored
 * SSO cases entirely, since they had not been written yet.
 *
 * A failed search is not automatically a content gap. `mfa_device_change` fails
 * repeatedly, yet KB-0127 covers every concept it needs — it fails because
 * identity and access is escalation-sensitive and gets ceiling-capped. Reporting
 * that as a knowledge gap would send a product manager off to commission an
 * article that already exists, and would bury the real finding: a policy gate is
 * generating support volume.
 *
 * So a gap is recorded only when the corpus genuinely cannot answer — nothing
 * retrieved, only stale sources, or a measurable coverage shortfall.
 */
import { atHour } from '@/domain/clock';
import { INTENTS } from '@/domain/retrieval/intents';
import { retrieve } from '@/domain/retrieval/search';
import type { RelayState, SeedContext } from '../buildInitialState';
import { KNOWLEDGE_ARTICLES } from './articles';
import { SYSTEM_ACTOR, record } from './recorder';

export function flagKnowledgeGaps(state: RelayState, ctx: SeedContext): void {
  const failuresByTopic = new Map<string, number>();
  for (const event of state.events) {
    if (event.type === 'search.failed') {
      failuresByTopic.set(
        event.payload.topicKey,
        (failuresByTopic.get(event.payload.topicKey) ?? 0) + 1,
      );
    }
  }

  for (const [topicKey, count] of [...failuresByTopic.entries()].sort()) {
    const intent = INTENTS.find((i) => i.topicKey === topicKey);
    if (!intent) continue;

    const result = retrieve(intent, KNOWLEDGE_ARTICLES);
    const isContentGap =
      result.failure === 'no_results' ||
      result.failure === 'stale_only' ||
      result.score.uncoveredConcepts.length > 0;
    if (!isContentGap) continue;

    record(state, ctx, 'kb.gap_flagged', atHour(1, 18), SYSTEM_ACTOR, {
      topicKey,
      evidenceCount: count,
      category: intent.category,
    });
  }
}
