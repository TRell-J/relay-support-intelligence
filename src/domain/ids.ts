/**
 * Deterministic identifiers.
 *
 * IDs are counter-based rather than random so that two runs of the demo produce
 * identical records. That is what makes the Reset Demo guarantee assertable, keeps
 * metric snapshots stable, and lets the demo script and the end-to-end tests refer
 * to `CASE-0013` by name. See ADR D-002.
 *
 * `uuid`, `nanoid` and `crypto.randomUUID` are banned in this layer.
 */

export type EmployeeId = `EMP-${string}`;
export type AgentId = `AGT-${string}`;
export type ConversationId = `CONV-${string}`;
export type MessageId = `MSG-${string}`;
export type AnswerId = `ANS-${string}`;
export type ArticleId = `KB-${string}`;
export type CaseId = `CASE-${string}`;
export type CaseEventId = `EVT-${string}`;
export type ClusterId = `CLU-${string}`;
export type IssueId = `ENG-${string}`;
export type OpportunityId = `OPP-${string}`;
export type UpdateId = `UPD-${string}`;

/** Every entity prefix in the system, with the width its counter is padded to. */
export const ID_PREFIXES = {
  employee: { prefix: 'EMP', width: 4 },
  agent: { prefix: 'AGT', width: 4 },
  conversation: { prefix: 'CONV', width: 4 },
  message: { prefix: 'MSG', width: 4 },
  answer: { prefix: 'ANS', width: 4 },
  article: { prefix: 'KB', width: 4 },
  case: { prefix: 'CASE', width: 4 },
  event: { prefix: 'EVT', width: 5 },
  cluster: { prefix: 'CLU', width: 4 },
  issue: { prefix: 'ENG', width: 4 },
  opportunity: { prefix: 'OPP', width: 4 },
  update: { prefix: 'UPD', width: 4 },
} as const satisfies Record<string, { prefix: string; width: number }>;

export type IdKind = keyof typeof ID_PREFIXES;

export interface IdFactory {
  /** Mint the next id for `kind`, e.g. `next('case')` -> `CASE-0013`. */
  next<K extends IdKind>(kind: K): string;
  /** How many ids of `kind` have been minted. */
  count(kind: IdKind): number;
  /** Restore counters to zero. Called on demo reset. */
  reset(): void;
  /** Snapshot the counters, for persistence and equality assertions. */
  snapshot(): Record<IdKind, number>;
  /** Restore counters from a snapshot, so a rehydrated session keeps minting forward. */
  restore(snapshot: Partial<Record<IdKind, number>>): void;
}

export function createIdFactory(): IdFactory {
  const counters = new Map<IdKind, number>();

  const format = (kind: IdKind, n: number): string => {
    const { prefix, width } = ID_PREFIXES[kind];
    return `${prefix}-${String(n).padStart(width, '0')}`;
  };

  return {
    next(kind) {
      const n = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, n);
      return format(kind, n);
    },
    count: (kind) => counters.get(kind) ?? 0,
    reset: () => counters.clear(),
    snapshot() {
      const out = {} as Record<IdKind, number>;
      for (const kind of Object.keys(ID_PREFIXES) as IdKind[]) {
        out[kind] = counters.get(kind) ?? 0;
      }
      return out;
    },
    restore(snapshot) {
      counters.clear();
      for (const [kind, n] of Object.entries(snapshot) as [IdKind, number][]) {
        if (kind in ID_PREFIXES && Number.isInteger(n) && n >= 0) counters.set(kind, n);
      }
    },
  };
}

/** Format a known id without advancing a counter. Used by hand-authored seed data. */
export function formatId(kind: IdKind, n: number): string {
  const { prefix, width } = ID_PREFIXES[kind];
  return `${prefix}-${String(n).padStart(width, '0')}`;
}
