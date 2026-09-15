# Data Dictionary

All types live in `src/domain/types/**` and are exported from `src/domain/types/index.ts`. Every field below is required unless marked optional. `Iso` is a branded ISO-8601 string produced only by `src/domain/clock.ts`.

## 0. Determinism primitives

| Primitive | Location | Contract |
|---|---|---|
| `DEMO_NOW` | `src/domain/clock.ts` | Fixed epoch `2026-09-14T09:00:00.000Z`. Every seeded timestamp is expressed as an offset from it. |
| `DemoClock` | `src/domain/clock.ts` | Monotonic. `now()` returns `DEMO_NOW + tickOffset`; each recorded event advances the offset by a fixed 1000ms. No wall-clock reads anywhere in `src/domain` or `src/data`. |
| `makeIdFactory(prefix)` | `src/domain/ids.ts` | Zero-padded counter, e.g. `CASE-0007`. Reset on demo reset so IDs are stable across runs. |
| `mulberry32(seed)` | `src/data/prng.ts` | Seeded PRNG for the background-volume generator. Seed is `RELAY_SEED = 20260914`. |

Consequence: `buildInitialState(RELAY_SEED)` is a pure function. Two runs produce identical state, which is what makes the metric snapshot tests and the Reset Demo guarantee meaningful.

---

## 1. Employee

| Field | Type | Notes |
|---|---|---|
| `id` | `EmployeeId` | `EMP-0001` |
| `displayName` | `string` | Fully fictional names, generated from a fixed synthetic name pool |
| `department` | `Department` | `Sales Ops` \| `Engineering` \| `Finance` \| `People` \| `Marketing` \| `Legal` \| `Support` |
| `location` | `string` | Fictional office labels, e.g. `Harbor Point`, `Remote (EU)` |
| `role` | `string` | Free text, synthetic |
| `tenureMonths` | `number` | Feeds a light "new hire" context signal in the agent view |
| `isActive` | `boolean` | Active population is the denominator for reach normalization |

## 2. Conversation

| Field | Type | Notes |
|---|---|---|
| `id` | `ConversationId` | `CONV-0001` |
| `employeeId` | `EmployeeId` | |
| `channel` | `'chat_intake' \| 'help_portal'` | Both are in-product surfaces; no external channel is claimed |
| `startedAt` | `Iso` | |
| `intentKey` | `IntentKey` | Stable key linking a conversation to seeded scenario logic, e.g. `vpn_after_password_reset` |
| `category` | `SupportCategory` | `Access & Identity` \| `Network & Devices` \| `Finance & Expense` \| `People & Benefits` \| `Software & Tools` \| `Facilities` |
| `resolution` | `ConversationResolution \| null` | `self_service` \| `escalated` \| `abandoned`; null while open |
| `resolvedAt` | `Iso \| null` | |
| `messageIds` | `MessageId[]` | Ordered |

## 3. Message

| Field | Type | Notes |
|---|---|---|
| `id` | `MessageId` | `MSG-0001` |
| `conversationId` | `ConversationId` | |
| `author` | `'employee' \| 'assistant' \| 'agent' \| 'system'` | |
| `sentAt` | `Iso` | |
| `body` | `string` | Plain text; no markdown execution |
| `answerId` | `AnswerId \| null` | Present on assistant messages that carry a grounded answer |
| `actionRefs` | `CaseEventId[]` | Any event this message asserts happened. Empty array means the message asserts nothing. Enforced by `assertActionsRecorded`. |

## 4. Answer

Not in the required entity list, but separated from `Message` because confidence, sources, and feedback are attributes of the *answer*, not the message envelope.

| Field | Type | Notes |
|---|---|---|
| `id` | `AnswerId` | `ANS-0001` |
| `summary` | `string` | 1–2 sentences |
| `steps` | `AnswerStep[]` | `{ ordinal, text, articleId? }` |
| `articleIds` | `ArticleId[]` | 0–3 cited sources |
| `confidence` | `number` | 0–1, computed by the scorer, never authored |
| `band` | `'high' \| 'medium' \| 'low'` | Thresholds 0.75 / 0.5 |
| `rationale` | `ConfidenceComponent[]` | `{ key, label, contribution, detail }` — the user-facing explanation |
| `sensitiveDomain` | `SensitiveDomain \| null` | `security` \| `identity_access` \| `employee_relations` \| `policy_exception` \| `compensation` \| `legal` |
| `canSelfResolve` | `boolean` | `band !== 'low' && sensitiveDomain === null` |

### Confidence scorer

`src/domain/retrieval/score.ts`, pure and unit-tested:

```
coverage      = matchedRequiredConcepts / requiredConcepts        weight 0.45
sourceQuality = mean(article.authority)                            weight 0.25
freshness     = clamp(1 - daysSinceReview / 180, 0, 1)             weight 0.20
specificity   = min(matchedTokens / queryTokens, 1)                weight 0.10
raw           = weighted sum
confidence    = sensitiveDomain ? min(raw, 0.45) : raw
```

Each term becomes one `ConfidenceComponent` so the UI explanation is generated, never written.

## 5. KnowledgeArticle

| Field | Type | Notes |
|---|---|---|
| `id` | `ArticleId` | `KB-0114` |
| `title` | `string` | Fictional internal titles |
| `space` | `string` | Fictional knowledge space, e.g. `IT Service Desk Handbook` |
| `ownerTeam` | `string` | Fictional owning team |
| `lastReviewedAt` | `Iso` | Drives the staleness flag at > 90 days |
| `authority` | `number` | 0–1 quality prior, authored per article |
| `concepts` | `string[]` | Normalized concept tags used by the scorer |
| `bodySummary` | `string` | Short synthetic excerpt shown on the source card |
| `isStale` | derived | `daysSince(lastReviewedAt) > 90` — computed, not stored |

## 6. SupportCase

| Field | Type | Notes |
|---|---|---|
| `id` | `CaseId` | `CASE-0007` |
| `conversationId` | `ConversationId \| null` | Null for cases seeded as agent-created |
| `employeeId` | `EmployeeId` | |
| `title` | `string` | Generated from intent plus system |
| `category` | `SupportCategory` | |
| `system` | `AffectedSystem` | `Identity Provider` \| `VPN Gateway` \| `Expense Platform` \| `Device Management` \| `Directory` \| `Collaboration Suite` |
| `status` | `CaseStatus` | `new` \| `triage` \| `in_progress` \| `waiting_on_employee` \| `waiting_on_engineering` \| `resolved` \| `closed` |
| `urgency` | `'low' \| 'normal' \| 'high' \| 'critical'` | |
| `source` | `'self_service_escalation' \| 'low_confidence_handoff' \| 'direct_intake' \| 'agent_created'` | |
| `assigneeId` | `AgentId \| null` | |
| `createdAt` / `updatedAt` | `Iso` | |
| `slaTargetAt` | `Iso` | Derived from urgency at creation |
| `slaState` | derived | `on_track` \| `at_risk` (< 25% remaining) \| `breached` |
| `aiConfidenceAtHandoff` | `number \| null` | The self-service confidence that led here |
| `structuredContext` | `CaseContext` | See below; the source of the completeness metric |
| `attemptedActions` | `AttemptedAction[]` | `{ text, outcome: 'failed' \| 'partial' \| 'not_tried', sourceMessageId? }` |
| `routingRationale` | `RoutingRationale` | `{ queue, reasonKey, explanation, matchedSignals[] }` |
| `suggestedArticleIds` | `ArticleId[]` | |
| `linkedArticleIds` | `ArticleId[]` | Agent-confirmed, distinct from suggested |
| `relatedCaseIds` | `CaseId[]` | Agent-confirmed relations |
| `clusterId` | `ClusterId \| null` | Set by the detector |
| `issueId` | `IssueId \| null` | Set on escalation |
| `reworkCount` | `number` | Reassignments plus status regressions, incremented by reducers |
| `resolutionType` | `'self_service' \| 'agent_resolved' \| 'engineering_fix' \| 'duplicate' \| null` | |

### CaseContext — the six required fields

Context completeness is `populatedCount / 6`. Nothing else counts.

| Field | Type |
|---|---|
| `problemStatement` | `string \| null` |
| `attemptedActionsSummary` | `string \| null` |
| `businessImpact` | `string \| null` |
| `urgencyRationale` | `string \| null` |
| `affectedSystem` | `AffectedSystem \| null` |
| `conversationTranscriptRef` | `ConversationId \| null` |

## 7. CaseEvent (append-only)

The single source of truth. `RelayEvent` is a discriminated union on `type`; every variant carries `id: CaseEventId`, `at: Iso`, `actor: Actor`, and a typed `payload`.

`Actor = { kind: 'employee' | 'agent' | 'engineer' | 'system' | 'assistant'; id: string | null }`

| Event type | Payload highlights | Feeds |
|---|---|---|
| `conversation.started` | `conversationId, employeeId, category, channel` | Demand, all rate denominators |
| `message.sent` | `conversationId, messageId, author` | Transcript, timeline |
| `search.performed` | `conversationId, query, retrievedArticleIds, topScore` | Search-failure denominator |
| `search.failed` | `conversationId, query, reason` (`no_results` \| `below_threshold` \| `stale_only`) | Failed-search view, knowledge gaps |
| `answer.presented` | `conversationId, answerId, confidence, band, articleIds, sensitiveDomain` | Confidence distribution |
| `answer.feedback` | `answerId, verdict, reasonCode?` | Answer acceptance |
| `conversation.resolved` | `conversationId, resolution` | Self-service rate, escalation rate |
| `case.created` | `caseId, conversationId?, category, system, urgency, source, contextCompleteness` | Escalation rate, completeness |
| `case.assigned` | `caseId, agentId, assignmentType` | Rework proxy |
| `case.status_changed` | `caseId, from, to, reason?` | Timeline, rework proxy |
| `case.knowledge_linked` | `caseId, articleId` | Knowledge effectiveness |
| `case.related_marked` | `caseId, relatedCaseId` | Cluster evidence |
| `case.update_sent` | `caseId, updateId, channel, bodyHash` | Proof an update actually left the system |
| `case.escalated` | `caseId, issueId` | Escalation chain |
| `case.resolved` | `caseId, resolutionType` | Resolution mix |
| `cluster.detected` | `clusterId, caseIds, signature, firstCaseAt` | Recurring volume, time-to-detection |
| `issue.created` | `issueId, clusterId?, severity` | Issue funnel |
| `issue.status_changed` | `issueId, from, to` | Issue timeline |
| `issue.propagated` | `issueId, caseIds` | Proof propagation occurred |
| `opportunity.created` | `opportunityId, sourceEvidence` | Backlog provenance |
| `opportunity.scored` | `opportunityId, inputs, score` | Prioritization audit |
| `opportunity.state_changed` | `opportunityId, from, to` | Roadmap movement |
| `kb.gap_flagged` | `topicKey, evidenceCount` | Knowledge-gap view |

**Rule:** reducers append events; components read derived state. No component writes an event directly.

## 8. IssueCluster

| Field | Type | Notes |
|---|---|---|
| `id` | `ClusterId` | `CLU-0002` |
| `signature` | `ClusterSignature` | `{ category, system, conceptTags: string[] }` — the deterministic match key |
| `caseIds` | `CaseId[]` | |
| `firstCaseAt` / `detectedAt` | `Iso` | Difference is time-to-detection |
| `status` | `'candidate' \| 'confirmed' \| 'linked_to_issue' \| 'dismissed'` | |
| `matchRationale` | `string[]` | Human-readable reasons, generated from the signature comparison |
| `affectedEmployeeCount` | derived | Distinct `employeeId` over `caseIds` |

### Detection rule (`src/domain/clustering/detect.ts`)

Deterministic, explainable, no ML:

```
similarity(a, b) =
    0.40 * (a.category === b.category)
  + 0.30 * (a.system === b.system)
  + 0.30 * jaccard(a.conceptTags, b.conceptTags)

members  = cases with pairwise similarity >= 0.75 within a rolling 7-day window
cluster  = formed when members >= 3
```

The rationale strings are produced from the terms that fired, so the UI explanation cannot drift from the computation.

## 9. EngineeringIssue

| Field | Type | Notes |
|---|---|---|
| `id` | `IssueId` | `ENG-0004` |
| `key` | `string` | Jira-*style* display key, e.g. `IDP-142`. Cosmetic only. |
| `title` / `description` | `string` | |
| `clusterId` | `ClusterId \| null` | |
| `linkedCaseIds` | `CaseId[]` | |
| `severity` | `'sev1' \| 'sev2' \| 'sev3' \| 'sev4'` | Proposed from affected-user count and urgency mix; engineer may override, which records an event |
| `status` | `'investigating' \| 'in_progress' \| 'monitoring' \| 'resolved'` | |
| `ownerTeam` / `ownerId` | `string` | Fictional |
| `suspectedCause` / `workaround` | `string \| null` | |
| `businessImpact` | `BusinessImpact` | `{ affectedEmployees (derived), agentHoursConsumed (derived), employeeMinutesLost (derived), narrative }` |
| `evidence` | `IssueEvidence[]` | `{ kind: 'case' \| 'event' \| 'metric', ref, note }` |
| `timeline` | derived | Projection of `issue.*` events |
| `createdAt` / `updatedAt` | `Iso` | |

### Status propagation (`src/domain/issues/propagate.ts`)

| Issue status | Linked case effect | Employee update draft |
|---|---|---|
| `investigating` | → `waiting_on_engineering` | "We have identified a platform issue affecting your request." |
| `in_progress` | stays `waiting_on_engineering`, timeline note appended | Progress note |
| `monitoring` | → `in_progress` (agent verification) | Fix deployed, verification in progress |
| `resolved` | → `resolved` with `resolutionType: 'engineering_fix'` | Resolution note |

Every draft is created **unsent**. Sending requires an explicit human action that records `case.update_sent`.

## 10. ProductOpportunity

| Field | Type | Notes |
|---|---|---|
| `id` | `OpportunityId` | `OPP-0003` |
| `title` / `problemStatement` | `string` | |
| `state` | `'discover' \| 'validate' \| 'planned' \| 'in_progress'` | |
| `evidence` | `OpportunityEvidence[]` | `{ kind: 'cluster' \| 'issue' \| 'metric' \| 'failed_search' \| 'case', ref, summary }` |
| `inputs` | `PriorityInputs` | `{ impact 1-5, reachEmployees, confidence 0-1, effort 1-5, risk 0-0.5 }` — all editable |
| `priorityScore` | derived | Never persisted; computed by `src/domain/prioritization/score.ts` |
| `explanation` | derived | Substituted arithmetic, dominant driver, sensitivity line |
| `owner` / `targetHorizon` | `string` | Fictional |

`reachEmployees` defaults to the linked cluster's derived affected-employee count and is overridable, with the override flagged in the UI so the provenance stays visible.

## 11. DemoScenario

| Field | Type | Notes |
|---|---|---|
| `id` | `ScenarioId` | `vpn_after_password_reset` \| `expense_policy_exception` \| `sso_login_loop` |
| `label` / `blurb` | `string` | Launcher copy |
| `intentKey` | `IntentKey` | |
| `seedMessages` | `SeedMessage[]` | The employee turns |
| `expectedOutcome` | `'self_service_resolved' \| 'escalated_knowledge_gap' \| 'escalated_clustered'` | Asserted directly in tests |
| `guidedSteps` | `GuidedStep[]` | `{ id, workspace, instruction, targetTestId, assertion }` — drives Run Guided Demo and is the source list for the Playwright narrative test |

`guidedSteps` is deliberately shared between the in-app guided tour and the e2e test, so the demo and the test can never diverge.

---

## 12. Seed volume plan

Enough to make filtering and clustering real; small enough to stay maintainable.

| Entity | Count | Composition |
|---|---|---|
| Employee | 48 | Hand-authored department and location mix |
| KnowledgeArticle | 22 | 4 deliberately stale, 3 deliberately absent for the knowledge-gap view |
| Conversation | ~180 | 14 hand-authored narrative conversations, remainder generated from a declarative spec |
| SupportCase | ~64 | 12 hand-authored, including the 5 SSO cases; remainder generated |
| RelayEvent | ~900 | Fully generated from the above; never hand-authored |
| IssueCluster | 3 | 1 pre-existing confirmed, 1 forming in-demo (SSO), 1 dismissed to exercise the state |
| EngineeringIssue | 4 | 1 created during the demo, 3 pre-existing across all four statuses |
| ProductOpportunity | 6 | 2 per state except In Progress; the SSO one is created during the demo |

The generator emits records from a compact declarative spec in `src/data/spec.ts` (rate curves per category per week, resolution mix, feedback mix). Changing a narrative fact means editing the spec, not 900 records.
