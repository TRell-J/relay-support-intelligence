/**
 * The answer-provider seam.
 *
 * The demo never needs this to be anything but deterministic. It exists so the
 * extension point is explicit rather than implied: swapping in a model-backed
 * implementation is a one-file change behind a stable interface, and nothing in
 * the build, the test suite, or the demo depends on that ever happening.
 *
 * See ADR D-013. The deterministic implementation is the only one exercised
 * anywhere, and `npm run verify` passes with no network and no environment file.
 */
import type { KnowledgeArticle } from '@/domain/types';
import type { IntentDefinition } from '@/domain/retrieval/intents';
import { retrieve, type RetrievalResult } from '@/domain/retrieval/search';

export interface AnswerRequest {
  intent: IntentDefinition;
  corpus: KnowledgeArticle[];
  /** 0-1: how much of the question the retrieval addresses. */
  specificity: number;
  /** False when free text fell back to a guessed intent. */
  questionUnderstood: boolean;
}

export interface AnswerProvider {
  readonly id: string;
  /** Whether this provider can run in the current environment. */
  isAvailable(): boolean;
  answer(request: AnswerRequest): RetrievalResult;
}

/**
 * The default, and the only provider the prototype uses.
 *
 * Lexical retrieval over the synthetic corpus with an explainable weighted
 * score. Deterministic by construction, which is what makes the confidence
 * values assertable and the demo reproducible.
 */
export const deterministicProvider: AnswerProvider = {
  id: 'deterministic',
  isAvailable: () => true,
  answer: ({ intent, corpus, specificity, questionUnderstood }) =>
    retrieve(intent, corpus, { specificity, questionUnderstood }),
};

/**
 * Resolve the active provider.
 *
 * Deliberately not a registry or a plugin system. There is one provider; the
 * function exists to name the seam, not to pretend there is a choice to make.
 */
export function resolveProvider(): AnswerProvider {
  return deterministicProvider;
}
