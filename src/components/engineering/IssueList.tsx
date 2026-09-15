'use client';

/**
 * Engineering issue list.
 *
 * Deliberately small and impact-ordered. An engineering owner does not need a
 * queue — they need to know which platform defect is costing the most, and every
 * figure in that judgment is derived from linked support cases rather than
 * entered by whoever filed the issue (ADR D-008).
 */
import Link from 'next/link';
import { useMemo } from 'react';
import { Layers } from 'lucide-react';

import { deriveImpact } from '@/domain/issues/issue';
import { relativeLabel } from '@/domain/time';
import { LABELS, type Severity } from '@/domain/types';
import { useRelayStore } from '@/store/store';
import { useHydrated } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/agent/primitives';

const SEVERITY_TONE: Record<Severity, string> = {
  sev1: 'border-critical/40 bg-critical-muted text-critical',
  sev2: 'border-caution/40 bg-caution-muted text-caution',
  sev3: 'border-info/30 bg-info-muted text-info',
  sev4: 'border-border text-fg-subtle',
};

export function SeverityChip({ severity, overridden }: { severity: Severity; overridden?: boolean }) {
  return (
    <span
      data-testid={`severity-${severity}`}
      className={`inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[11px] leading-none ${SEVERITY_TONE[severity]}`}
    >
      {LABELS.severity[severity]}
      {overridden && (
        <span className="opacity-70" title="Overridden by an engineer">
          ·set
        </span>
      )}
    </span>
  );
}

export function IssueList() {
  const hydrated = useHydrated();
  const issues = useRelayStore((s) => s.data.issues);
  const cases = useRelayStore((s) => s.data.cases);

  const rows = useMemo(
    () =>
      Object.values(issues)
        .map((issue) => ({
          issue,
          impact: deriveImpact(
            issue.linkedCaseIds.map((id) => cases[id]).filter((c) => c !== undefined),
          ),
        }))
        .sort((a, b) => b.impact.affectedEmployees - a.impact.affectedEmployees),
    [issues, cases],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-[15px] font-semibold tracking-tight">Engineering Escalation</h1>
        <p className="mt-0.5 text-[12px] text-fg-subtle">
          Platform defects raised from support, ordered by derived blast radius
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {!hydrated ? null : rows.length === 0 ? (
          <EmptyState
            testId="issues-empty"
            title="No engineering issues yet"
            body="Issues are created from the Agent Workspace when a case — or a cluster of related cases — turns out to be a platform defect rather than an individual problem."
          />
        ) : (
          <table className="w-full border-collapse" data-testid="issue-table">
            <caption className="sr-only">Engineering issues by affected-employee count</caption>
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-fg-subtle">
                <th scope="col" className="py-2 pr-3 text-left font-medium">Issue</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Severity</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Owner</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Employees</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Cases</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Agent hrs</th>
                <th scope="col" className="py-2 pl-3 text-left font-medium">Opened</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ issue, impact }) => (
                <tr
                  key={issue.id}
                  data-testid={`issue-row-${issue.id}`}
                  className="border-b border-border/60 hover:bg-surface"
                >
                  <td className="max-w-[420px] py-2.5 pr-3">
                    <Link
                      href={`/engineering/${issue.id}`}
                      prefetch={false}
                      className="block truncate text-[13px] text-fg hover:text-accent-fg"
                    >
                      {issue.title}
                    </Link>
                    <div className="meta mt-0.5 flex items-center gap-1.5">
                      {issue.key}
                      {issue.clusterId && (
                        <span className="inline-flex items-center gap-0.5 text-accent-fg">
                          <Layers size={9} aria-hidden />
                          {issue.clusterId}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3">
                    <SeverityChip severity={issue.severity} overridden={issue.severityOverridden} />
                  </td>
                  <td className="px-3 text-[12px] text-fg-muted">{LABELS.issueStatus[issue.status]}</td>
                  <td className="px-3 text-[12px] text-fg-muted">{issue.ownerTeam}</td>
                  <td className="num px-3 text-[12px] text-fg">{impact.affectedEmployees}</td>
                  <td className="num px-3 text-[12px] text-fg-muted">{issue.linkedCaseIds.length}</td>
                  <td className="num px-3 text-[12px] text-fg-muted">{impact.agentHoursConsumed}</td>
                  <td className="meta py-2.5 pl-3">{relativeLabel(issue.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
