'use client';

/**
 * The guided tour.
 *
 * A dockable panel rather than a modal or a spotlight overlay: the reviewer has
 * to be able to read the instruction *and* operate the product at the same time,
 * and an overlay that dims the thing you are being asked to look at is working
 * against itself.
 *
 * Content comes from `GUIDED_BEATS`, which the narrative end-to-end test also
 * drives — so the tour and the test cannot describe different products.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';

import { GUIDED_BEATS, TOTAL_BEATS } from '@/domain/demo/guidedSteps';

export function GuidedDemo() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const beat = GUIDED_BEATS[index];

  // Escape closes the tour from anywhere, which is what people try first.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(TOTAL_BEATS - 1, next));
    setIndex(clamped);
    const target = GUIDED_BEATS[clamped];
    if (target) router.push(target.route);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          goTo(0);
        }}
        data-testid="run-guided-demo"
        className="flex w-full items-center gap-2 rounded-sm border border-accent/40 bg-accent-muted px-2.5 py-1.5 text-[12px] text-accent-fg transition-colors hover:bg-surface-hover"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        <Play size={12} aria-hidden />
        Run guided demo
      </button>
    );
  }

  return (
    <section
      aria-label="Guided demo"
      data-testid="guided-demo-panel"
      className="fixed bottom-4 right-4 z-40 w-[380px] rounded-md border border-border-strong bg-surface-raised p-4 shadow-[var(--shadow-raised)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="meta">
            Beat {index + 1} of {TOTAL_BEATS}
          </div>
          <h2 className="mt-0.5 text-[13px] font-semibold leading-snug" data-testid="beat-title">
            {beat?.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close guided demo"
          data-testid="close-guided-demo"
          className="shrink-0 rounded-sm p-1 text-fg-subtle hover:text-fg"
        >
          <X size={13} aria-hidden />
        </button>
      </div>

      <p className="mt-2.5 text-[12px] leading-relaxed text-fg" data-testid="beat-instruction">
        {beat?.instruction}
      </p>

      <p className="register-evidence mt-2.5 p-2.5 text-[11px] leading-relaxed text-fg-muted">
        <span className="text-fg-subtle">Should show: </span>
        {beat?.assertion}
      </p>

      <p className="mt-2.5 text-[11px] leading-relaxed text-fg-subtle" data-testid="beat-say">
        {beat?.say}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex gap-1" aria-hidden>
          {GUIDED_BEATS.map((b, i) => (
            <span
              key={b.id}
              className={`h-1 w-4 rounded-full ${i <= index ? 'bg-accent' : 'bg-border-strong'}`}
            />
          ))}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            data-testid="beat-previous"
            className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[12px] text-fg-muted hover:text-fg disabled:opacity-30"
          >
            <ChevronLeft size={12} aria-hidden />
            Back
          </button>
          <button
            type="button"
            onClick={() => (index === TOTAL_BEATS - 1 ? setOpen(false) : goTo(index + 1))}
            data-testid="beat-next"
            className="inline-flex items-center gap-1 rounded-sm bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover"
          >
            {index === TOTAL_BEATS - 1 ? 'Finish' : 'Next'}
            {index < TOTAL_BEATS - 1 && <ChevronRight size={12} aria-hidden />}
          </button>
        </div>
      </div>
    </section>
  );
}
