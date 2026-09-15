'use client';

/**
 * Answer and evidence.
 *
 * Three registers stacked, deliberately distinguishable:
 *   AI recommendation   the answer and its confidence, accent hairline
 *   human decision      the two terminal actions, highest contrast on screen
 *   supporting evidence source cards, recessed and quieter
 *
 * The confidence breakdown renders the scorer's own components. Nothing here is
 * written prose about the score — every line is a term that contributed to it,
 * which is why the number and its explanation cannot disagree (ADR D-005).
 */
import { AlertTriangle, Check, FileText, ShieldAlert, ThumbsDown, ThumbsUp } from 'lucide-react';

import { ARTICLE_BY_ID } from '@/data/seed/articles';
import { isStale } from '@/domain/retrieval/search';
import { reconciledContributions } from '@/domain/retrieval/score';
import { absoluteLabel, daysSince } from '@/domain/time';
import { ARTICLE_STALE_AFTER_DAYS, LABELS, type Answer } from '@/domain/types';

const BAND_STYLE = {
  high: { label: 'High confidence', dot: 'bg-positive', text: 'text-positive' },
  medium: { label: 'Medium confidence', dot: 'bg-caution', text: 'text-caution' },
  low: { label: 'Low confidence', dot: 'bg-critical', text: 'text-critical' },
} as const;

interface Props {
  answer: Answer;
  feedbackGiven: 'helpful' | 'unhelpful' | null;
  resolved: boolean;
  escalated: boolean;
  onFeedback: (verdict: 'helpful' | 'unhelpful') => void;
  onResolve: () => void;
  onEscalate: () => void;
}

export function AnswerPanel({
  answer,
  feedbackGiven,
  resolved,
  escalated,
  onFeedback,
  onResolve,
  onEscalate,
}: Props) {
  const band = BAND_STYLE[answer.band];

  return (
    <section aria-labelledby="answer-heading" data-testid="answer-panel" className="flex flex-col gap-4">
      {/* --- AI recommendation register --- */}
      <div className="register-ai rounded-sm bg-surface py-3.5 pl-4 pr-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="answer-heading" className="text-[11px] font-medium uppercase tracking-wider text-accent-fg">
            Suggested answer
          </h2>
          <div className="flex items-center gap-1.5" data-testid="confidence-band">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${band.dot}`} />
            <span className={`text-[11px] font-medium ${band.text}`}>{band.label}</span>
            <span className="meta ml-1">{answer.confidence.toFixed(2)}</span>
          </div>
        </div>

        <p className="mt-2 text-[13px] leading-relaxed text-fg">{answer.summary}</p>

        {answer.sensitiveDomain !== null && (
          <div
            data-testid="sensitive-notice"
            className="mt-3 flex items-start gap-2 rounded-sm border border-caution/25 bg-caution-muted px-3 py-2"
          >
            <ShieldAlert size={13} className="mt-0.5 shrink-0 text-caution" aria-hidden />
            <p className="text-[12px] leading-relaxed text-fg-muted">
              <span className="font-medium text-fg">
                {LABELS.sensitiveDomain[answer.sensitiveDomain]}
              </span>{' '}
              questions are capped at low confidence and always routed to a person, however
              well-sourced the answer looks.
            </p>
          </div>
        )}

        {answer.steps.length > 0 && (
          <ol className="mt-3.5 space-y-2" data-testid="answer-steps">
            {answer.steps.map((step) => (
              <li key={step.ordinal} className="flex gap-2.5">
                <span className="meta mt-[3px] w-3.5 shrink-0 text-right">{step.ordinal}</span>
                <span className="text-[13px] leading-relaxed text-fg-muted">
                  {step.text}
                  {step.articleId && <span className="meta ml-1.5">{step.articleId}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <ConfidenceBreakdown answer={answer} />

      {/* --- human decision register --- */}
      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
            Your call
          </span>
          <div className="flex items-center gap-1">
            <FeedbackButton
              active={feedbackGiven === 'helpful'}
              disabled={feedbackGiven !== null}
              onClick={() => onFeedback('helpful')}
              testId="feedback-helpful"
              Icon={ThumbsUp}
              label="Helpful"
            />
            <FeedbackButton
              active={feedbackGiven === 'unhelpful'}
              disabled={feedbackGiven !== null}
              onClick={() => onFeedback('unhelpful')}
              testId="feedback-unhelpful"
              Icon={ThumbsDown}
              label="Not helpful"
            />
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onResolve}
            disabled={resolved || escalated || !answer.canSelfResolve}
            data-testid="action-resolve"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-accent px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-fg-subtle"
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            <Check size={14} aria-hidden />
            {resolved ? 'Resolved' : 'This resolved it'}
          </button>
          <button
            type="button"
            onClick={onEscalate}
            disabled={resolved || escalated}
            data-testid="action-escalate"
            className="flex flex-1 items-center justify-center rounded-sm border border-border-strong px-3 py-2 text-[13px] font-medium text-fg transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-fg-subtle"
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            {escalated ? 'Sent to support' : 'Still need help'}
          </button>
        </div>

        {!answer.canSelfResolve && !escalated && (
          <p className="mt-2.5 text-[12px] leading-relaxed text-fg-subtle">
            Self-resolution is unavailable here — this needs a person. Sending it to support carries
            your whole conversation across, so you will not be asked to repeat any of it.
          </p>
        )}
      </div>

      <SourceList answer={answer} />
    </section>
  );
}

function FeedbackButton({
  active,
  disabled,
  onClick,
  testId,
  Icon,
  label,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  testId: string;
  Icon: typeof ThumbsUp;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={[
        'rounded-sm border px-2 py-1.5 transition-colors',
        active
          ? 'border-accent/40 bg-accent-muted text-accent-fg'
          : 'border-border text-fg-subtle hover:border-border-strong hover:text-fg-muted',
        disabled && !active ? 'opacity-40' : '',
      ].join(' ')}
      style={{ transitionDuration: 'var(--duration-fast)' }}
    >
      <Icon size={13} aria-hidden />
    </button>
  );
}

/** The scorer's components, rendered directly. */
function ConfidenceBreakdown({ answer }: { answer: Answer }) {
  // Displayed to the same precision they are summed at, so the rows visibly
  // reconcile to the headline figure rather than missing it by a rounding unit.
  const shown = reconciledContributions(answer.rationale, answer.confidence, 3);

  return (
    <details className="group rounded-sm border border-border bg-surface" data-testid="confidence-breakdown">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-[12px] text-fg-muted hover:text-fg">
        <span>Why this confidence</span>
        <span className="meta group-open:hidden">show</span>
        <span className="meta hidden group-open:inline">hide</span>
      </summary>
      <div className="border-t border-border px-4 py-3">
        <table className="w-full">
          <caption className="sr-only">Weighted components of the confidence score</caption>
          <tbody>
            {answer.rationale.map((component, i) => (
              <tr key={component.key} className="align-baseline">
                <th scope="row" className="py-1 pr-3 text-left text-[12px] font-normal text-fg">
                  {component.label}
                </th>
                <td className="num w-16 py-1 text-[12px] text-fg-muted">
                  {(shown[i] ?? 0) >= 0 ? '+' : '−'}
                  {Math.abs(shown[i] ?? 0).toFixed(3)}
                </td>
                <td className="py-1 pl-3 text-[11px] leading-snug text-fg-subtle">
                  {component.detail}
                </td>
              </tr>
            ))}
            <tr className="border-t border-border">
              <th scope="row" className="pt-2 pr-3 text-left text-[12px] font-medium text-fg">
                Confidence
              </th>
              <td className="num w-16 pt-2 text-[12px] font-medium text-fg">
                {answer.confidence.toFixed(2)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Evidence register: every cited source with owner, review date, and staleness. */
function SourceList({ answer }: { answer: Answer }) {
  if (answer.articleIds.length === 0) {
    return (
      <div className="register-evidence p-4" data-testid="source-list-empty">
        <div className="flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-caution" aria-hidden />
          <div>
            <div className="text-[12px] font-medium text-fg">No sources found</div>
            <p className="mt-1 text-[12px] leading-relaxed text-fg-subtle">
              Nothing in the knowledge base covers this topic. This gap is recorded and appears in
              Product Intelligence as a knowledge gap with its demand.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="source-list">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        Sources
      </div>
      <ul className="space-y-2">
        {answer.articleIds.map((id) => {
          const article = ARTICLE_BY_ID.get(id);
          if (!article) return null;
          const stale = isStale(article);
          const age = daysSince(article.lastReviewedAt);

          return (
            <li key={id} className="register-evidence p-3" data-testid={`source-card-${id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-2.5">
                  <FileText size={13} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />
                  <div className="min-w-0">
                    <div className="text-[13px] leading-snug text-fg">{article.title}</div>
                    <div className="meta mt-1">
                      {article.id} &middot; {article.ownerTeam} &middot; {article.space}
                    </div>
                  </div>
                </div>
                <span className="meta shrink-0 whitespace-nowrap">
                  {absoluteLabel(article.lastReviewedAt).split(',')[0]}
                </span>
              </div>

              {stale && (
                <div
                  data-testid={`stale-flag-${id}`}
                  className="mt-2 flex items-center gap-1.5 text-[11px] text-caution"
                >
                  <AlertTriangle size={11} aria-hidden />
                  Last reviewed {age} days ago, past the {ARTICLE_STALE_AFTER_DAYS}-day window
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
