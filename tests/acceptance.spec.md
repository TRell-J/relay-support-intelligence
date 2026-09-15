# Acceptance Specification

The executable contract. Every `AC-*` maps to at least one automated test. `AC-*` ids are used verbatim in test titles so a failure names the criterion it broke. Any criterion that cannot be automated is marked **manual** and must be checked during slice review.

Fixtures: seed `20260914`, `DEMO_NOW = 2026-09-14T09:00:00.000Z`. Every e2e test starts from a fresh browser context, which implies a fresh store.

---

## A. Foundation and determinism

| ID | Criterion | Test |
|---|---|---|
| AC-1.1 | Each of `/help`, `/agent`, `/engineering`, `/intelligence` renders a landmark workspace region and the rail marks the active one | `e2e/narrative.spec.ts` |
| AC-1.2 | The "Synthetic demo data" marker is visible on every route at 1440px and 1024px | `e2e/responsive.spec.ts` |
| AC-1.3 | `buildInitialState(20260914)` twice produces identical serialized output | `unit/seed.determinism.test.ts` |
| AC-1.4 | After arbitrary mutations, Reset Demo yields a state hash equal to the fresh-seed hash | `unit/seed.determinism.test.ts`, `e2e/reset.spec.ts` |
| AC-1.5 | Lint fails on `Date.now()` in `src/domain/**` and on a `src/domain` → `src/components` import | `npm run lint` against planted fixtures |
| AC-1.6 | The branding gate passes clean and fails on a planted forbidden term | `npm run check:branding` |
| AC-1.7 | Seeded entity counts match Data Dictionary §12 | `unit/seed.determinism.test.ts` |
| AC-1.8 | No `Math.random`, `uuid`, `nanoid`, or `crypto.randomUUID` under `src/domain/**` or `src/data/**` | `unit/seed.determinism.test.ts` (source scan) |

## B. Employee self-service

| ID | Criterion | Test |
|---|---|---|
| AC-2.1 | VPN scenario → confidence `0.96`, band `high`, sources `KB-0104` + `KB-0118`, no staleness flag | `unit/retrieval.score.test.ts`, `e2e/employee-help.spec.ts` |
| AC-2.2 | The confidence breakdown lists four components whose weighted contributions sum to the displayed value (±0.005) | `unit/retrieval.score.test.ts` |
| AC-2.3 | Each source card renders owner team and last-reviewed date; an article older than 90 days renders the staleness flag | `e2e/employee-help.spec.ts` |
| AC-2.4 | Helpful then Resolve appends exactly `answer.feedback[helpful]` and `conversation.resolved[self_service]` | `e2e/employee-help.spec.ts` |
| AC-2.5 | A message referencing a non-existent event throws via `assertActionsRecorded` in test mode | `unit/trust.actionClaims.test.ts` |
| AC-2.6 | The conversation column is ≤ 640px and is not the widest region at 1440px | `e2e/responsive.spec.ts` |
| AC-2.7 | Pre-launch empty state and in-retrieval loading state both render | `e2e/employee-help.spec.ts` |
| AC-2.8 | Free-text input maps to the nearest seeded intent and discloses that it did so | `e2e/employee-help.spec.ts` |

## C. Escalation and agent work

| ID | Criterion | Test |
|---|---|---|
| AC-3.1 | Expense scenario → `search.failed[no_results]`, `sensitiveDomain: policy_exception`, confidence `0.10`, `canSelfResolve: false`; SSO scenario → `below_threshold`, capped at `0.45` | `unit/retrieval.score.test.ts`, `e2e/employee-help.spec.ts` |
| AC-3.2 | Still need help creates a case with `contextCompleteness = 1.0` and navigates to `/agent/<caseId>` | `e2e/agent-workspace.spec.ts` |
| AC-3.3 | The handoff receipt enumerates all six context fields with their carried values | `e2e/agent-workspace.spec.ts` |
| AC-3.4 | Each of the eight queue filters plus text search changes the row set; combined filters intersect; a no-match empty state renders | `e2e/agent-workspace.spec.ts` |
| AC-3.5 | An update preview is a draft; only Send appends `case.update_sent` and it appears in the audit log | `e2e/agent-workspace.spec.ts` |
| AC-3.6 | A status regression (e.g. `in_progress` → `triage`) increments `reworkCount` | `unit/store.reducers.test.ts` |
| AC-3.7 | SLA state computes `on_track`, `at_risk` (< 25% remaining), and `breached` against `DEMO_NOW` | `unit/store.reducers.test.ts` |
| AC-3.8 | Assign, status change, link knowledge, and mark related each append their event and update the timeline | `unit/store.reducers.test.ts` |

## D. Clustering and engineering

| ID | Criterion | Test |
|---|---|---|
| AC-4.1 | Marking the third related SSO case forms `CLU-0003` with 5 members and non-empty match rationale | `unit/clustering.detect.test.ts`, `e2e/engineering.spec.ts` |
| AC-4.2 | Two similar cases do not cluster; the panel shows the threshold and the current count | `unit/clustering.detect.test.ts` |
| AC-4.3 | Escalation creates `ENG-0005` linked to 5 cases, `affectedEmployees = 5` with visible provenance, proposed severity `sev2` | `e2e/engineering.spec.ts` |
| AC-4.4 | Each of the four issue statuses propagates to linked cases exactly per the propagation table and creates an unsent draft | `unit/issues.propagate.test.ts` |
| AC-4.5 | A severity override records an event and renders an override marker | `e2e/engineering.spec.ts` |
| AC-4.6 | The issue detail presents the single-incident and cluster views distinctly | **manual** + `e2e/engineering.spec.ts` presence check |
| AC-4.7 | `resolved` sets every linked case to `resolved` with `resolutionType: 'engineering_fix'` | `unit/issues.propagate.test.ts` |
| AC-4.8 | Cluster membership is reflected in the agent queue's cluster column for all members | `e2e/agent-workspace.spec.ts` |

## E. Product Intelligence

| ID | Criterion | Test |
|---|---|---|
| AC-5.1 | No numeric literal serves as a metric value in `src/components/intelligence/**` | `unit/metrics.derive.test.ts` (source scan) |
| AC-5.2 | All nine metrics match snapshots computed directly from the seed event log | `unit/metrics.derive.test.ts` |
| AC-5.3 | Every metric tooltip exposes formula, numerator, denominator, and window | `e2e/intelligence.spec.ts` |
| AC-5.4 | Filtering to Access & Identity changes demand, rates, failed searches, and clusters; Clear restores baseline | `e2e/intelligence.spec.ts` |
| AC-5.5 | Metrics incorporate in-session actions from beats 1–5 | `e2e/narrative.spec.ts` |
| AC-5.6 | Failed searches list the expense-policy query with reason and occurrence count | `e2e/intelligence.spec.ts` |
| AC-5.7 | Knowledge gaps show exactly three topics with demand and no acceptable article | `unit/metrics.derive.test.ts` |
| AC-5.8 | Time-to-detection for `CLU-0003` equals `detectedAt - firstCaseAt` | `unit/metrics.derive.test.ts` |
| AC-5.9 | A zero-result filter combination renders an empty state, not a broken chart | `e2e/intelligence.spec.ts` |

## F. Product Opportunities

| ID | Criterion | Test |
|---|---|---|
| AC-6.1 | All five inputs are editable and keyboard-operable; the score recomputes on change | `e2e/opportunities.spec.ts` |
| AC-6.2 | The explanation's substituted arithmetic evaluates to the displayed score | `unit/prioritization.score.test.ts` |
| AC-6.3 | Effort 3 → 2 changes the ranking as stated in the demo script | `unit/prioritization.score.test.ts`, `e2e/opportunities.spec.ts` |
| AC-6.4 | Every opportunity has ≥ 1 evidence link that navigates to its source record | `e2e/opportunities.spec.ts` |
| AC-6.5 | State changes record `opportunity.state_changed` and move the card | `e2e/opportunities.spec.ts` |
| AC-6.6 | Out-of-range input shows an inline error and the score never renders `NaN` | `unit/prioritization.score.test.ts`, `e2e/opportunities.spec.ts` |
| AC-6.7 | `reachEmployees` defaults to the cluster-derived count and flags manual overrides | `e2e/opportunities.spec.ts` |

## G. Narrative, accessibility, resilience

| ID | Criterion | Test |
|---|---|---|
| AC-7.1 | Run Guided Demo completes all seven beats with correct step highlighting and progress | `e2e/narrative.spec.ts` |
| AC-7.2 | The full narrative completes keyboard-only, with no pointer events dispatched | `e2e/keyboard.spec.ts` |
| AC-7.3 | Route change moves focus to the workspace heading and announces it politely | `e2e/keyboard.spec.ts` |
| AC-7.4 | All routes usable at 1024×768 with no horizontal page scroll; wide tables scroll in their own container | `e2e/responsive.spec.ts` |
| AC-7.5 | Text and UI contrast meet WCAG AA; no state encoded by color alone | **manual** review per slice |
| AC-7.6 | Every route exposes loading, empty, and error states, each reachable in a test | `e2e/*.spec.ts` |
| AC-7.7 | README covers all eleven required sections | **manual** checklist |
| AC-7.8 | `npm run verify` clean from a fresh `npm ci` | CI-equivalent local run |
| AC-7.9 | Full `npm run e2e` green | `npm run e2e` |

## H. Trust and integrity invariants

Regressions here are release-blocking regardless of slice.

| ID | Invariant | Test |
|---|---|---|
| AC-8.1 | No rendered assistant or system message asserts an action without a matching event in the log | `unit/trust.actionClaims.test.ts`, runtime guard |
| AC-8.2 | Escalation-sensitive domains never produce `canSelfResolve: true` at any confidence | `unit/retrieval.score.test.ts` (property test over the scorer's input space) |
| AC-8.3 | No UI copy claims a live connection to any external system | `npm run check:branding` (phrase list) |
| AC-8.4 | `affectedEmployees` always equals the distinct employee count over linked cases | `unit/issues.propagate.test.ts` |
| AC-8.5 | `priorityScore` is never persisted in the store snapshot | `unit/prioritization.score.test.ts` |
| AC-8.6 | The production build contains no secrets and no API key reference | `npm run check:branding`, build output scan |
| AC-8.7 | The app builds, tests, and demos with no network access and no environment file | `npm run verify` offline |
