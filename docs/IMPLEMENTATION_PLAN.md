# Implementation Plan

Seven vertical slices. Each one ends with something a reviewer can click through, plus green focused tests, typecheck, lint, and a passing production build. No slice is marked done otherwise.

---

## Dependencies

### Required

| Package | Why |
|---|---|
| `next`, `react`, `react-dom` | Required by the brief (App Router) |
| `typescript`, `@types/react`, `@types/node` | Strict mode required |
| `tailwindcss`, `@tailwindcss/postcss` | Required by the brief; v4 gives CSS-first tokens (ADR D-011) |
| `recharts` | Required by the brief |
| `eslint`, `eslint-config-next` | Lint gate |
| `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react` | Domain and derivation tests |
| `@playwright/test` | Workflow tests, required by the quality gates |

### Non-standard, each justified

| Package | Why this and not the obvious alternative |
|---|---|
| `zustand` + `immer` | Four workspaces read and write one shared state graph. Selector-level subscriptions keep Product Intelligence from re-rendering nine derived metrics on every keystroke elsewhere. Context + `useReducer` would re-render every consumer on any change (ADR D-003). |
| `class-variance-authority`, `clsx`, `tailwind-merge` | shadcn/ui's variant and class-merge primitives. Needed for the four visual registers to be expressed as typed variants rather than ad-hoc class strings. |
| `@radix-ui/react-*` (subset) | Pulled in only by the shadcn components actually used: dialog, dropdown-menu, select, tabs, tooltip, popover, scroll-area, separator, slot. Accessible primitives are the cheapest route to the keyboard-only quality gate. |
| `lucide-react` | Icon set shadcn expects. Restricted to a small allowlist; no sparkle or brain iconography. |
| `eslint-plugin-local-rules` (or a flat-config inline rule) | Hosts the two custom rules the trust and determinism guarantees depend on: no wall-clock or randomness in `src/domain/**` and `src/data/**`, and no imports from `src/app` or `src/components` into `src/domain`. |

### Deliberately not used

`uuid` / `nanoid` (breaks determinism, ADR D-002) · `date-fns` / `dayjs` (a 40-line `src/domain/time.ts` keeps the fixed-clock rule explicit and auditable) · any state-persistence library (a 20-line sessionStorage adapter suffices) · any charting library besides Recharts · any AI SDK in the default dependency set (ADR D-013; the Claude adapter uses `fetch`).

---

## Proposed file tree

```
relay-support-intelligence/
├─ CLAUDE.md
├─ README.md                              (slice 7)
├─ package.json  tsconfig.json  next.config.ts
├─ eslint.config.mjs  postcss.config.mjs
├─ vitest.config.ts  playwright.config.ts
├─ scripts/check-branding.mjs
├─ docs/
│  ├─ PRD.md  ROLE_SIGNAL_MAP.md  DATA_DICTIONARY.md
│  ├─ DEMO_SCRIPT.md  DECISIONS.md  IMPLEMENTATION_PLAN.md
├─ tests/
│  ├─ acceptance.spec.md
│  ├─ unit/
│  │  ├─ retrieval.score.test.ts        clustering.detect.test.ts
│  │  ├─ metrics.derive.test.ts         prioritization.score.test.ts
│  │  ├─ issues.propagate.test.ts       trust.actionClaims.test.ts
│  │  ├─ store.reducers.test.ts         seed.determinism.test.ts
│  └─ e2e/
│     ├─ narrative.spec.ts    employee-help.spec.ts   agent-workspace.spec.ts
│     ├─ engineering.spec.ts  intelligence.spec.ts    opportunities.spec.ts
│     ├─ keyboard.spec.ts     reset.spec.ts           responsive.spec.ts
└─ src/
   ├─ app/
   │  ├─ layout.tsx  globals.css  page.tsx            (page.tsx redirects to /help)
   │  ├─ help/page.tsx
   │  ├─ agent/page.tsx           agent/[caseId]/page.tsx
   │  ├─ engineering/page.tsx     engineering/[issueId]/page.tsx
   │  ├─ intelligence/page.tsx
   │  ├─ loading.tsx  error.tsx  not-found.tsx
   ├─ domain/                                  (pure, no React, no browser APIs)
   │  ├─ types/{index,ids,employee,conversation,knowledge,case,event,cluster,issue,opportunity,scenario}.ts
   │  ├─ clock.ts  ids.ts  time.ts
   │  ├─ retrieval/{score,intents,search}.ts
   │  ├─ cases/{create,context,sla,routing,transitions}.ts
   │  ├─ clustering/{detect,signature}.ts
   │  ├─ issues/{create,severity,propagate,impact}.ts
   │  ├─ metrics/{registry,definitions,demand,selfService,quality,clusters,rework,filters}.ts
   │  ├─ prioritization/{score,explain}.ts
   │  ├─ trust/{actionClaims,guard}.ts
   │  └─ demo/{scenarios,guidedSteps}.ts
   ├─ data/
   │  ├─ prng.ts  spec.ts
   │  ├─ seed/{employees,articles,narrative,generate}.ts
   │  └─ buildInitialState.ts
   ├─ store/
   │  ├─ store.ts  persist.ts
   │  ├─ actions/{conversation,case,issue,opportunity,demo}.ts
   │  └─ selectors/{cases,issues,metrics,opportunities}.ts
   ├─ lib/ai/{provider,deterministic,claude}.ts
   └─ components/
      ├─ shell/{AppShell,WorkspaceRail,DemoControls,SyntheticDataBadge,DemoClockIndicator,RouteAnnouncer}.tsx
      ├─ ui/                                   (shadcn subset)
      ├─ primitives/{StatChip,ConfidenceMeter,MetricTooltip,EvidenceCard,RegisterPanel,DataTable,EmptyState,ErrorState,LoadingState}.tsx
      ├─ help/{ConversationThread,ScenarioLauncher,AnswerPanel,SourceCard,ConfidenceBreakdown,FeedbackControls,HandoffReceipt}.tsx
      ├─ agent/{CaseQueue,QueueFilters,CaseDetail,CaseSummary,AttemptedActions,RoutingRationale,SuggestedKnowledge,SimilarCases,CaseTimeline,AuditLog,CaseActions,UpdatePreview}.tsx
      ├─ engineering/{IssueList,IssueDetail,LinkedCases,ImpactPanel,EvidenceList,StatusControl,PropagationPreview}.tsx
      ├─ intelligence/{MetricGrid,DemandChart,TrendChart,FunnelPanel,FailedSearches,KnowledgeGaps,ClusterTable,FilterBar}.tsx
      └─ opportunities/{OpportunityBoard,OpportunityDetail,PriorityInputs,PriorityExplanation,EvidenceLinks,StateControl}.tsx
```

---

## Slice 1 — Foundation

**Delivers:** the app shell a reviewer can navigate, with the domain model and seed behind it.

Scaffold Next.js + TS strict + Tailwind v4 tokens + shadcn subset. All `src/domain/types/**`. `clock.ts`, `ids.ts`, `time.ts`, `prng.ts`. Full seed: employees, articles, narrative records, generator, `buildInitialState`. Zustand store, sessionStorage persistence, Reset Demo. App shell: workspace rail, synthetic-data badge, demo-clock indicator, `loading` / `error` / `not-found`. Custom ESLint rules and the branding script.

**Acceptance**

- AC-1.1 All four routes render an identified workspace region; the rail marks the current one.
- AC-1.2 The synthetic-data marker is visible at 1440px and 1024px on every route.
- AC-1.3 `buildInitialState(20260914)` called twice produces identical serialized output (snapshot test).
- AC-1.4 Reset Demo restores a state whose hash equals the fresh-seed hash after arbitrary mutations.
- AC-1.5 Lint fails on an introduced `Date.now()` in `src/domain` and on a `src/domain` → `src/components` import.
- AC-1.6 `npm run check:branding` passes and fails on a planted forbidden term.
- AC-1.7 Seed counts match the Data Dictionary §12 table.

**Commands:** `npm run test:unit -- tests/unit/seed.determinism.test.ts` · `npm run typecheck` · `npm run lint` · `npm run check:branding` · `npm run build` · `npm run e2e -- tests/e2e/reset.spec.ts`

---

## Slice 2 — Employee self-service

**Delivers:** Beat 1 end to end.

Retrieval scorer, intent mapping, search. `AnswerProvider` interface with `DeterministicProvider`. Employee Help two-column workspace, scenario launcher, thread, answer panel, confidence breakdown, source cards with owner/date/staleness, feedback, Resolve. Event recording for the full beat-1 sequence. Trust guard wired.

**Acceptance**

- AC-2.1 Launching the VPN scenario yields confidence `0.86`, band `high`, sources `KB-0104` and `KB-0118`, no staleness flag.
- AC-2.2 The breakdown lists four components whose weighted contributions sum to the displayed confidence.
- AC-2.3 Each source card shows owner team and last-reviewed date; a stale article shows the flag.
- AC-2.4 Helpful then Resolve appends `answer.feedback` and `conversation.resolved[self_service]`, both visible in a debug event view.
- AC-2.5 A message with a dangling `actionRef` throws in test mode.
- AC-2.6 Chat column never exceeds 640px; the answer panel is the wider region at 1440px.
- AC-2.7 Empty state before a scenario is launched; loading state during the simulated retrieval delay.

**Commands:** `npm run test:unit -- tests/unit/retrieval.score.test.ts tests/unit/trust.actionClaims.test.ts` · `npm run e2e -- tests/e2e/employee-help.spec.ts` · typecheck, lint, build

---

## Slice 3 — Context-preserving escalation

**Delivers:** Beats 2 and 3.

Sensitive-domain ceiling. Case creation from conversation with the six context fields, completeness computation, SLA targets, routing rationale. Handoff receipt and navigation. Agent queue with all eight filters plus search. Case detail with transcript, summary, attempted actions, rationale, suggested knowledge, timeline, audit. Assign, status change, link knowledge, update preview and send.

**Acceptance**

- AC-3.1 The expense scenario produces `search.failed[below_threshold]`, `sensitiveDomain: policy_exception`, confidence ≤ 0.45, `canSelfResolve: false`.
- AC-3.2 Still need help creates a case with `contextCompleteness` 1.0 and navigates to its detail.
- AC-3.3 The handoff receipt enumerates all six carried fields.
- AC-3.4 Every queue filter changes the visible row set; combined filters intersect; a no-match state renders.
- AC-3.5 An update preview is a draft; only Send appends `case.update_sent`, and the audit log shows it.
- AC-3.6 A status regression increments `reworkCount`.
- AC-3.7 SLA state renders `on_track` / `at_risk` / `breached` correctly against `DEMO_NOW`.

**Commands:** `npm run test:unit -- tests/unit/store.reducers.test.ts` · `npm run e2e -- tests/e2e/agent-workspace.spec.ts` · typecheck, lint, build

---

## Slice 4 — Recurring issue and engineering escalation

**Delivers:** Beats 4 and 5.

Cluster signature and detector with rationale. Similar cases and Mark related. Engineering issue creation, derived affected count, proposed severity with override, evidence list, business impact. Issue list and detail. Status transitions with propagation and unsent update drafts.

**Acceptance**

- AC-4.1 Marking the third related SSO case forms `CLU-0003` with 5 members and prints the match rationale.
- AC-4.2 Below-threshold sets do not cluster; the panel states the threshold and current count.
- AC-4.3 Escalation creates `ENG-0005` linked to all 5 cases, `affectedEmployees: 5` shown with provenance, proposed severity `sev2`.
- AC-4.4 Each issue status transition updates every linked case per the propagation table and creates an unsent draft.
- AC-4.5 A severity override records an event and renders an override marker.
- AC-4.6 The issue detail contrasts the single-incident view with the cluster view.
- AC-4.7 Reaching `resolved` sets all linked cases to `resolved` with `resolutionType: 'engineering_fix'`.

**Commands:** `npm run test:unit -- tests/unit/clustering.detect.test.ts tests/unit/issues.propagate.test.ts` · `npm run e2e -- tests/e2e/engineering.spec.ts` · typecheck, lint, build

---

## Slice 5 — Product Intelligence

**Delivers:** Beat 6.

Metric registry with machine-readable definitions. All nine derivations. Filter model and recomputation. Demand and trend charts, funnel, failed searches, knowledge gaps, cluster table with time-to-detection. Definition tooltips.

**Acceptance**

- AC-5.1 A repo-wide grep finds no numeric literal serving as a metric value in `src/components/intelligence/**`.
- AC-5.2 Each of the nine metrics matches a snapshot computed directly from the seed event log.
- AC-5.3 Every metric tooltip states formula, numerator, denominator, and window.
- AC-5.4 Filtering to Access & Identity changes every panel; the active-filter row reflects it; Clear restores.
- AC-5.5 Metrics reflect actions taken in slices 2–4 within the same session.
- AC-5.6 Failed searches list the expense query with its failure reason and occurrence count.
- AC-5.7 Knowledge gaps show three topics with demand and no acceptable article.
- AC-5.8 Time-to-detection for `CLU-0003` equals `detectedAt - firstCaseAt`.
- AC-5.9 A filter combination yielding no data renders an empty state, not a broken chart.

**Commands:** `npm run test:unit -- tests/unit/metrics.derive.test.ts` · `npm run e2e -- tests/e2e/intelligence.spec.ts` · typecheck, lint, build

---

## Slice 6 — Product Opportunities

**Delivers:** Beat 7.

Opportunities tab, board by state, detail with evidence links. Editable inputs, computed score, substituted arithmetic, dominant driver, sensitivity line. State transitions. Ranked comparison.

**Acceptance**

- AC-6.1 All five inputs are editable and keyboard-operable; the score recomputes on change.
- AC-6.2 The explanation shows the substituted formula matching the displayed score.
- AC-6.3 Editing effort 3 → 2 changes the ranking as the demo script states.
- AC-6.4 Every opportunity links to at least one evidence item that navigates to its source.
- AC-6.5 State changes record events and move the card between columns.
- AC-6.6 Out-of-range input is rejected with an inline error; the score never reads `NaN`.
- AC-6.7 `reachEmployees` defaults to the cluster-derived count and marks manual overrides.

**Commands:** `npm run test:unit -- tests/unit/prioritization.score.test.ts` · `npm run e2e -- tests/e2e/opportunities.spec.ts` · typecheck, lint, build

---

## Slice 7 — Guided demo, accessibility, polish, README

**Delivers:** the reviewable artifact.

Run Guided Demo driven by `guidedSteps`. Focus management and route announcement. Keyboard audit and visible focus rings. Tablet layout at 1024px. Loading, empty, and error states audited across all routes. README. Production-build verification. Full Playwright narrative test.

**Acceptance**

- AC-7.1 Run Guided Demo completes all seven beats with correct highlighting and progress.
- AC-7.2 The full narrative completes keyboard-only, no pointer events.
- AC-7.3 Focus moves to the workspace heading on route change and is announced.
- AC-7.4 All four workspaces are usable at 1024×768 with no horizontal page scroll; wide tables scroll within their own container.
- AC-7.5 Text and UI contrast meet WCAG AA; no color-only state encoding.
- AC-7.6 Every route has loading, empty, and error states, each reachable in a test.
- AC-7.7 README covers problem, users, hypothesis, architecture, AI trust model, metric definitions, tradeoffs, demo script, setup, and synthetic-data disclosure.
- AC-7.8 `npm run verify` is clean from a fresh `npm ci`.
- AC-7.9 `npm run e2e` fully green, including the narrative and reset specs.

**Commands:** `npm run verify` · `npm run e2e` · manual screenshot review at 1440×900 and 1024×768

---

## Checklist

- [x] Slice 1 — Foundation (scaffold, tokens, domain model, seed, store, shell, reset, gates)
- [x] Slice 2 — Employee self-service (retrieval, scoring, trust guard, two-column workspace, 26 e2e)
- [x] Slice 3 — Context-preserving escalation (queue, filters, case detail, actions, 48 e2e)
- [x] Slice 4 — Recurring issue and engineering escalation (clustering, derived impact, severity, propagation, 70 e2e)
- [x] Slice 5 — Product Intelligence (9 derived KPIs, filters, charts, gap classification, 92 e2e)
- [x] Slice 6 — Product Opportunities (editable prioritization, transparent arithmetic, roadmap states)
- [x] Slice 7 — Guided demo, accessibility, README, deploy config
