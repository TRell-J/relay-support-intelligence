'use client';

/**
 * Product Opportunities.
 *
 * The argument this tab has to make: the priority of a bet is defensible because
 * every input traces to a recorded interaction. So the panel shows the
 * substituted arithmetic rather than a score, names the dominant driver, and
 * states what one change would do — everything needed to disagree with it.
 *
 * The score is computed on every render and never stored (ADR D-009).
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Layers, Link2 } from 'lucide-react';

import { ACTIVE_EMPLOYEE_COUNT } from '@/data/seed/people';
import {
  INPUT_BOUNDS,
  PRIORITY_INPUT_KEYS,
  computePriority,
  rankOpportunities,
  type PriorityInputKey,
} from '@/domain/prioritization/score';
import {
  LABELS,
  OPPORTUNITY_STATES,
  type OpportunityId,
  type OpportunityState,
  type ProductOpportunity,
} from '@/domain/types';
import { useRelayStore } from '@/store/store';
import { useHydrated } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/agent/primitives';

export function Opportunities({ initialId }: { initialId?: string | null }) {
  const hydrated = useHydrated();
  const opportunities = useRelayStore((s) => s.data.opportunities);
  const updatePriorityInput = useRelayStore((s) => s.updatePriorityInput);
  const changeOpportunityState = useRelayStore((s) => s.changeOpportunityState);

  const ranked = useMemo(
    () => rankOpportunities(Object.values(opportunities), ACTIVE_EMPLOYEE_COUNT),
    [opportunities],
  );

  /*
   * Selection is pinned the moment the panel is used.
   *
   * Falling back to the top-ranked row on every render meant that editing an input
   * re-sorted the list and swapped the detail panel out from under the person
   * editing it — they would adjust effort and find themselves looking at a
   * different opportunity.
   */
  const [selectedId, setSelectedId] = useState<OpportunityId | null>(
    (initialId as OpportunityId | null) ?? null,
  );
  const selected =
    (selectedId ? opportunities[selectedId] : undefined) ?? ranked[0]?.opportunity ?? null;
  const pin = (id: OpportunityId) => setSelectedId(id);

  if (!hydrated) return null;

  if (ranked.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          testId="opportunities-empty"
          title="No opportunities yet"
          body="Opportunities are created from engineering issues and from the gaps this page surfaces."
        />
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px] overflow-hidden">
      <div className="min-w-0 overflow-y-auto px-6 py-5">
        <table className="w-full" data-testid="opportunity-table">
          <caption className="sr-only">Product opportunities ranked by computed priority</caption>
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-[0.09em] text-fg-subtle">
              <th scope="col" className="pb-2 text-left font-medium">Opportunity</th>
              <th scope="col" className="px-3 pb-2 text-left font-medium">State</th>
              <th scope="col" className="px-3 pb-2 text-right font-medium">Reach</th>
              <th scope="col" className="px-3 pb-2 text-right font-medium">Effort</th>
              <th scope="col" className="pb-2 pl-3 text-right font-medium">Priority</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ opportunity, result }) => {
              const active = opportunity.id === selected?.id;
              return (
                <tr
                  key={opportunity.id}
                  data-testid={`opportunity-row-${opportunity.id}`}
                  onClick={() => setSelectedId(opportunity.id)}
                  className={[
                    'cursor-pointer border-b border-border/60 align-top transition-colors',
                    active ? 'bg-surface-raised' : 'hover:bg-surface',
                  ].join(' ')}
                  style={{ transitionDuration: 'var(--duration-fast)' }}
                >
                  <td className="max-w-[420px] py-2.5 pr-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(opportunity.id)}
                      className="block text-left text-[13px] leading-snug text-fg hover:text-accent-fg"
                    >
                      {opportunity.title}
                    </button>
                    <div className="meta mt-0.5">
                      {opportunity.id} &middot; {opportunity.owner} &middot;{' '}
                      {opportunity.evidence.length} evidence link
                      {opportunity.evidence.length === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StateChip state={opportunity.state} />
                  </td>
                  <td className="num px-3 py-2.5 text-[12px] text-fg-muted">
                    {opportunity.inputs.reachEmployees}
                  </td>
                  <td className="num px-3 py-2.5 text-[12px] text-fg-muted">
                    {opportunity.inputs.effort}
                  </td>
                  <td className="num py-2.5 pl-3 text-[15px] font-medium text-fg">
                    {result.score}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-fg-subtle">
          Priority is recomputed on every render from the inputs on the right. It is never stored,
          so the number and the inputs cannot disagree.
        </p>
      </div>

      {selected && (
        <OpportunityDetail
          opportunity={selected}
          onInput={(key, value) => {
            pin(selected.id);
            updatePriorityInput(selected.id, key, value);
          }}
          onState={(to) => {
            pin(selected.id);
            changeOpportunityState(selected.id, to);
          }}
          runnerUp={ranked.find((r) => r.opportunity.id !== selected.id)?.opportunity ?? null}
        />
      )}
    </div>
  );
}

function OpportunityDetail({
  opportunity,
  onInput,
  onState,
  runnerUp,
}: {
  opportunity: ProductOpportunity;
  onInput: (key: PriorityInputKey, value: number) => void;
  onState: (to: OpportunityState) => void;
  runnerUp: ProductOpportunity | null;
}) {
  const result = computePriority(opportunity.inputs, ACTIVE_EMPLOYEE_COUNT);
  const hasErrors = Object.keys(result.errors).length > 0;

  return (
    <aside
      data-testid="opportunity-detail"
      className="min-w-0 space-y-4 overflow-y-auto border-l border-border px-5 py-5"
    >
      <div>
        <h2 className="text-[14px] font-semibold leading-snug tracking-tight">
          {opportunity.title}
        </h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
          {opportunity.problemStatement}
        </p>
      </div>

      {/* --- human decision register --- */}
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-1.5">
          <span className="sr-only">Opportunity state</span>
          <select
            value={opportunity.state}
            onChange={(e) => onState(e.target.value as OpportunityState)}
            data-testid="opportunity-state"
            className="w-full rounded-sm border border-border-strong bg-surface-sunken px-2 py-1.5 text-[12px] text-fg focus:border-border-accent focus:outline-none"
          >
            {OPPORTUNITY_STATES.map((state) => (
              <option key={state} value={state}>
                {LABELS.opportunityState[state]}
              </option>
            ))}
          </select>
        </label>
        <span className="meta shrink-0">{opportunity.targetHorizon}</span>
      </div>

      <section className="rounded-md border border-border bg-surface p-3.5" data-testid="priority-inputs">
        <h3 className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.09em] text-fg-subtle">
          Prioritization inputs
        </h3>
        <div className="space-y-2.5">
          {PRIORITY_INPUT_KEYS.map((key) => {
            const bound = INPUT_BOUNDS[key];
            const error = result.errors[key];
            const isDominant = result.dominantDriver === key && !hasErrors;
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`input-${key}`}
                    className="flex items-center gap-1.5 text-[12px] text-fg-muted"
                  >
                    {bound.label}
                    {isDominant && (
                      <span
                        data-testid="dominant-driver"
                        className="rounded-xs border border-accent/40 bg-accent-muted px-1 py-0.5 text-[9px] uppercase tracking-wider text-accent-fg"
                      >
                        Biggest lever
                      </span>
                    )}
                    {key === 'reachEmployees' && opportunity.inputs.reachOverridden && (
                      <span
                        data-testid="reach-overridden"
                        className="text-[10px] text-caution"
                        title="Manually overridden; the default is the derived affected-employee count"
                      >
                        overridden
                      </span>
                    )}
                  </label>
                  <input
                    id={`input-${key}`}
                    type="number"
                    inputMode="decimal"
                    value={opportunity.inputs[key]}
                    min={bound.min}
                    max={bound.max}
                    step={bound.step}
                    onChange={(e) => onInput(key, Number(e.target.value))}
                    data-testid={`priority-input-${key}`}
                    aria-invalid={error !== undefined}
                    aria-describedby={error ? `error-${key}` : undefined}
                    className={[
                      'num w-[76px] rounded-sm border bg-surface-sunken px-2 py-1 text-[12px] text-fg focus:outline-none',
                      error ? 'border-critical' : 'border-border focus:border-border-accent',
                    ].join(' ')}
                  />
                </div>
                {error ? (
                  <p id={`error-${key}`} className="mt-0.5 text-[11px] text-critical">
                    {error}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-fg-subtle">{bound.hint}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/*
        AI-recommendation register: the arithmetic, substituted. Not "priority 21"
        but the expression that produces 21, so a stakeholder who disagrees can
        point at the term they disagree with.
      */}
      <section className="register-ai rounded-md bg-surface p-3.5" data-testid="priority-explanation">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.09em] text-accent-fg">
            How this score is produced
          </h3>
          <span className="num text-[22px] font-medium leading-none text-fg" data-testid="priority-score">
            {result.score}
          </span>
        </div>

        {hasErrors ? (
          <p className="mt-2 text-[12px] text-critical">{result.sensitivity}</p>
        ) : (
          <>
            <dl className="mt-2.5 space-y-1">
              {result.steps.map((step) => (
                <div key={step.label} className="flex gap-2">
                  <dt className="w-[64px] shrink-0 font-mono text-[11px] text-fg-subtle">
                    {step.label}
                  </dt>
                  <dd className="font-mono text-[11px] leading-snug text-fg-muted">{step.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2.5 text-[11px] leading-relaxed text-fg-muted" data-testid="sensitivity">
              {result.sensitivity}
            </p>
            {runnerUp && (
              <p className="mt-1 text-[11px] leading-relaxed text-fg-subtle">
                Next highest is <span className="text-fg-muted">{runnerUp.title}</span>.
              </p>
            )}
          </>
        )}
      </section>

      <section className="register-evidence p-3.5" data-testid="opportunity-evidence">
        <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.09em] text-fg-subtle">
          Evidence
        </h3>
        <ul className="space-y-2">
          {opportunity.evidence.map((item, i) => (
            <li key={`${item.ref}-${i}`} className="flex items-start gap-2">
              {item.kind === 'cluster' ? (
                <Layers size={11} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />
              ) : (
                <Link2 size={11} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />
              )}
              <div className="min-w-0">
                {item.kind === 'issue' ? (
                  <Link
                    href={`/engineering/${item.ref}`}
                    data-testid={`evidence-link-${item.ref}`}
                    className="inline-flex items-center gap-1 text-[12px] text-fg hover:text-accent-fg"
                  >
                    {item.ref}
                    <ArrowRight size={10} aria-hidden />
                  </Link>
                ) : item.kind === 'case' ? (
                  <Link
                    href={`/agent/${item.ref}`}
                    data-testid={`evidence-link-${item.ref}`}
                    className="inline-flex items-center gap-1 text-[12px] text-fg hover:text-accent-fg"
                  >
                    {item.ref}
                    <ArrowRight size={10} aria-hidden />
                  </Link>
                ) : (
                  <span className="text-[12px] text-fg">{item.ref.replace(/_/g, ' ')}</span>
                )}
                <div className="text-[11px] leading-snug text-fg-subtle">{item.summary}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

const STATE_TONE: Record<OpportunityState, string> = {
  discover: 'border-border text-fg-subtle',
  validate: 'border-info/30 bg-info-muted text-info',
  planned: 'border-accent/30 bg-accent-muted text-accent-fg',
  in_progress: 'border-positive/30 bg-positive-muted text-positive',
};

export function StateChip({ state }: { state: OpportunityState }) {
  return (
    <span
      data-testid={`opportunity-state-${state}`}
      className={`inline-flex whitespace-nowrap rounded-xs border px-1.5 py-0.5 text-[11px] leading-none ${STATE_TONE[state]}`}
    >
      {LABELS.opportunityState[state]}
    </span>
  );
}
