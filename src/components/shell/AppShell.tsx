'use client';

/**
 * The application frame.
 *
 * A narrow persistent rail rather than a top nav: four workspaces that operators
 * move between constantly should cost one click and no scanning, and the
 * horizontal space is worth more to dense tables than to a header.
 *
 * The synthetic-data marker is part of the frame, not a dismissible banner. It is
 * visible at every viewport on every route, which is a hard requirement of this
 * artifact (CLAUDE.md rule 2).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LifeBuoy, Inbox, Wrench, BarChart3, RotateCcw } from 'lucide-react';

import { GuidedDemo } from './GuidedDemo';

import { DEMO_NOW_MS } from '@/domain/clock';
import { absoluteLabel } from '@/domain/time';
import { fromMs } from '@/domain/clock';
import { useRelayStore } from '@/store/store';
import type { WorkspaceKey } from '@/domain/types';

interface WorkspaceLink {
  key: WorkspaceKey;
  href: string;
  label: string;
  hint: string;
  Icon: typeof LifeBuoy;
}

const WORKSPACES: WorkspaceLink[] = [
  { key: 'help', href: '/help', label: 'Employee Help', hint: 'Ask and self-serve', Icon: LifeBuoy },
  { key: 'agent', href: '/agent', label: 'Agent Workspace', hint: 'Triage and resolve', Icon: Inbox },
  { key: 'engineering', href: '/engineering', label: 'Engineering', hint: 'Defects and impact', Icon: Wrench },
  { key: 'intelligence', href: '/intelligence', label: 'Product Intelligence', hint: 'Evidence and roadmap', Icon: BarChart3 },
];

/**
 * True once the client has mounted.
 *
 * The store may rehydrate from sessionStorage, which the server cannot see, so
 * data-dependent regions render only after mount to avoid a hydration mismatch.
 *
 * Implemented with useSyncExternalStore rather than an effect: it returns the
 * server snapshot during hydration and the client snapshot afterwards, in one
 * pass, with no state write and no cascading render.
 */
const neverChanges = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(neverChanges, clientSnapshot, serverSnapshot);
}

const WORKSPACE_TITLES: Record<string, string> = {
  '/help': 'Employee Help',
  '/agent': 'Agent Workspace',
  '/engineering': 'Engineering Escalation',
  '/intelligence': 'Product Intelligence',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  // Derived, not stored: writing it into state from an effect causes a
  // cascading render, and the value is a pure function of the route anyway.
  const workspaceTitle =
    Object.entries(WORKSPACE_TITLES).find(([href]) => pathname.startsWith(href))?.[1] ?? 'Workspace';

  /*
   * On route *change*, move focus to the workspace region.
   *
   * Without this a keyboard user who activates a rail link keeps focus in the
   * navigation and has to tab back through it to reach the content they just
   * asked for, with nothing said about what changed.
   *
   * The guard matters as much as the effect. Focusing on mount put focus
   * inside <main> before the user had done anything, so the very first Tab
   * landed on page content and the skip link and the entire navigation rail
   * were unreachable by keyboard.
   *
   * It compares the previous path rather than tracking "is first render",
   * because StrictMode invokes effects twice in development: a boolean guard
   * gets flipped by the first invocation and then focuses on the second.
   */
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    mainRef.current?.focus();
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-canvas text-fg">
      <nav
        aria-label="Workspaces"
        className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-border bg-surface"
      >
        <div className="px-4 pt-5 pb-4">
          <div className="text-[13px] font-semibold tracking-tight text-fg">Relay</div>
          <div className="text-[11px] text-fg-subtle">Support Intelligence</div>
        </div>

        <ul className="flex flex-col gap-0.5 px-2">
          {WORKSPACES.map(({ key, href, label, hint, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  data-testid={`rail-${key}`}
                  className={[
                    'group flex items-start gap-2.5 rounded-sm px-2.5 py-2 transition-colors',
                    active
                      ? 'bg-surface-raised text-fg'
                      : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                  ].join(' ')}
                  style={{ transitionDuration: 'var(--duration-fast)' }}
                >
                  <Icon
                    size={15}
                    className={active ? 'mt-0.5 text-accent' : 'mt-0.5 text-fg-subtle'}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-tight">{label}</span>
                    <span className="block text-[11px] leading-tight text-fg-subtle">{hint}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto space-y-2 border-t border-border p-3">
          <GuidedDemo />
          <DemoControls />
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <SyntheticDataBar />
        <main
          id="workspace"
          ref={mainRef}
          tabIndex={-1}
          aria-label="Workspace"
          className="min-w-0 flex-1 focus:outline-none"
        >
          {children}
        </main>
        {/* Keyed on the route so it re-announces even when the text repeats. */}
        <div
          key={pathname}
          aria-live="polite"
          className="sr-only"
          data-testid="route-announcer"
        >
          {workspaceTitle} loaded
        </div>
      </div>
    </div>
  );
}

/**
 * Persistent disclosure strip.
 *
 * Also carries the demo date. A fixed clock without an explanation reads as a
 * bug; labelled, it reads as the deliberate choice it is (ADR D-001).
 */
function SyntheticDataBar() {
  return (
    <div
      data-testid="synthetic-data-badge"
      className="flex items-center justify-between gap-4 border-b border-border bg-surface-sunken px-5 py-1.5"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-caution"
        />
        <span className="text-[11px] font-medium tracking-wide text-fg-muted">
          Synthetic demo data
        </span>
        <span className="text-[11px] text-fg-subtle">
          &middot; fictional product, people, and records &middot; not connected to any external system
        </span>
      </div>
      <span className="meta shrink-0">
        Demo time {absoluteLabel(fromMs(DEMO_NOW_MS))} UTC
      </span>
    </div>
  );
}

/** Reset restores the seeded state exactly. Confirmed, because it discards work. */
function DemoControls() {
  const resetDemo = useRelayStore((s) => s.resetDemo);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onClick = () => {
    if (!confirming) {
      setConfirming(true);
      timer.current = setTimeout(() => setConfirming(false), 3500);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setConfirming(false);
    resetDemo();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="reset-demo"
      className={[
        'flex w-full items-center gap-2 rounded-sm border px-2.5 py-1.5 text-[12px] transition-colors',
        confirming
          ? 'border-caution/40 bg-caution-muted text-fg'
          : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
      ].join(' ')}
      style={{ transitionDuration: 'var(--duration-fast)' }}
    >
      <RotateCcw size={13} aria-hidden />
      {confirming ? 'Confirm reset' : 'Reset demo'}
    </button>
  );
}
