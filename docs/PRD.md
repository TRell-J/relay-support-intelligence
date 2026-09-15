# PRD — Relay Support Intelligence

Status: draft for approval · Owner: candidate (product) · Type: portfolio prototype

---

## 1. Problem

Internal employee support fails in a predictable pattern that most support tooling never surfaces:

1. An employee asks a question in chat. The answer exists, but they cannot find it, or the article they find is stale and they have no way to know.
2. When self-service fails, the employee re-explains everything in a ticket. The conversation, the steps already attempted, and the business impact are lost at the boundary.
3. An agent rebuilds that context by hand, resolves the individual ticket, and moves on. The ticket closes; the cause does not.
4. The same failure recurs across dozens of employees. Nobody connects them, so engineering never sees a defect and product never sees a roadmap item.

Each layer is locally rational and globally expensive. The cost stays invisible because **no single system holds the whole chain**, so no dataset exists that can say "this recurring platform defect consumed 62 agent-hours and 340 employee-minutes this month."

## 2. Hypothesis

> Connecting source-grounded self-service, context-preserving escalation, recurring-issue detection, and roadmap prioritization into one evidence chain will reduce employee effort and agent rework while exposing systemic product problems earlier than ticket-by-ticket resolution can.

Falsifiable prototype claim: **every number in Product Intelligence traces back to a specific employee interaction**, and the SSO opportunity's priority score is defensible from that evidence alone.

## 3. Users and jobs

| User | Job to be done | Success looks like | Failure mode today |
|---|---|---|---|
| **Employee** (Priya, Sales Ops) | Unblock me now, and let me trust the answer | Correct answer with a source and a date, or a fast handoff that does not make me repeat myself | Stale wiki page, ticket restart, silence |
| **Support agent** (Marcus, IT Service Desk) | Resolve fast without rebuilding context | Case arrives with transcript, attempts, impact, and a suggested article | Copy-paste archaeology, duplicated work |
| **Engineering owner** (Dana, Identity Platform) | Tell me whether this is one user or a systemic defect | Linked cases, affected-user count, evidence, severity derived from data | One vague ticket, no blast radius |
| **Product manager** (the role this prototype supports) | Decide what to build from evidence, not anecdote | Demand, failure modes, recurring clusters, and a scored, editable backlog | Loudest-voice prioritization |

## 4. Non-goals

- A general-purpose chatbot, or any impression that chat is the product.
- Real integrations with Slack, Zendesk, or Jira. The UI borrows *interaction patterns*; it claims no connection.
- Live LLM inference as a requirement. The demo is deterministic and works offline.
- Authentication, multi-tenancy, or persistence beyond the browser session.
- Data volume for its own sake. Narrative clarity beats record count.

## 5. Workspaces

### 5.1 Employee Help

Two-column intake workspace. Left: a threaded, Slack-*inspired* conversation in original visual language, capped near 640px so chat never dominates the frame. Right: the **Answer & Evidence** panel — concise answer, guided steps, confidence band with component breakdown, fictional source cards carrying owner and last-reviewed date plus a staleness flag, helpful/unhelpful feedback, and the two terminal actions **Resolve** and **Still need help**.

Behavior:

- Three seeded scenario launchers plus free-text input. Free text maps to the nearest seeded intent and says so plainly rather than implying live generation.
- Low confidence, an escalation-sensitive domain, or **Still need help** creates a structured `SupportCase` and navigates to its agent detail with a visible handoff receipt listing exactly what was carried across.

### 5.2 Agent Workspace

Queue plus detail.

- **Queue** — searchable and filterable by status, category, source, assignee, urgency, SLA state, AI-confidence band, and cluster membership. The cluster indicator is a first-class column, not an afterthought badge.
- **Detail** — employee context, full transcript, AI structured summary, attempted actions, routing rationale, suggested knowledge, similar cases, SLA countdown, unified timeline, and audit events.
- **Actions** — assign, change status, compose and preview a send-update (draft until explicitly sent), link knowledge, mark related, escalate to engineering.
- Escalation creates a linked `EngineeringIssue` and updates queue, cluster, timeline, and metrics in one transaction.

### 5.3 Engineering Escalation

Issue list plus detail: linked support cases, **affected-user count derived from the distinct employees on linked cases** and never typed in, business impact, severity, evidence log, suspected cause, workaround, owner, status, and timeline.

Status transitions (`Investigating → In Progress → Monitoring → Resolved`) propagate to every linked case and generate an *unsent* employee-update draft.

The SSO scenario is the teaching case: one login-loop ticket looks like user error; five in seven days, all following a password reset, all on one identity provider, is a platform defect. The UI must make that difference legible rather than asserted.

### 5.4 Product Intelligence (with Product Opportunities tab)

Every figure is a pure function of the event log.

Metrics: support demand by category and trend, self-service resolution rate, escalation rate, answer acceptance, search-failure rate, context completeness, recurring-issue volume share, time-to-detection, agent-rework proxy. Each carries a definition tooltip stating formula, numerator, denominator, and window. Filters for date range, category, system, and source recompute every view.

Views: failed searches, knowledge gaps (demand with no acceptable article), and the recurring-issue cluster table.

**Product Opportunities** converts evidence into a backlog. Each opportunity keeps its evidence links and exposes editable Impact, Reach, Confidence, Effort, and Risk with a transparent formula, live arithmetic, and a plain-language explanation. States: Discover → Validate → Planned → In Progress.

## 6. Priority model

```
reachNorm = affectedEmployees / activeEmployeePopulation        (0..1)
raw       = (reachNorm * impact * confidence) / effort
priority  = round( raw * (1 - risk) * 100 )
```

`impact` 1–5, `confidence` 0–1, `effort` 1–5 (person-week proxy), `risk` 0–0.5.

The panel renders the substituted arithmetic, names the dominant driver, and shows a sensitivity line ("effort 3 → 2 raises this above *Reduce expense-policy ambiguity*"). Every input is editable. The score is never stored, always computed.

## 7. Metric definitions

| Metric | Formula | Window |
|---|---|---|
| Support demand | `count(conversation.started)` grouped by category and day | filter range |
| Self-service resolution rate | `count(conversation.resolved[self_service]) / count(conversation.started)` | filter range |
| Escalation rate | `count(case.created) / count(conversation.started)` | filter range |
| Answer acceptance | `helpful / (helpful + unhelpful)` from `answer.feedback` | filter range |
| Search failure rate | `count(search.failed) / count(search.performed)` | filter range |
| Context completeness | mean over `case.created` of populated / 6 required context fields | filter range |
| Recurring-issue volume | cases in an active cluster / all open cases | point in time |
| Time-to-detection | `cluster.detectedAt - min(case.created.at of members)` | per cluster, median |
| Agent rework proxy | mean(reassignments + status regressions) per resolved case | filter range |

## 8. AI trust model

| Requirement | Mechanism |
|---|---|
| Sources | Every answer cites 1–3 `KnowledgeArticle` cards with owner and last-reviewed date |
| Freshness | Articles older than 90 days render a staleness flag and reduce confidence |
| Confidence rationale | Component breakdown: coverage, source quality, freshness, domain sensitivity |
| Human escalation | Always one click, never gated behind retry loops |
| Sensitive domains | Hard confidence ceiling of 0.45, so the answer cannot self-resolve |
| Auditability | Append-only `CaseEvent` log rendered as human-readable audit history |
| No false claims | Action sentences are generated from recorded events; a dev-mode guard fails the render if the referenced event is absent |
| No hidden reasoning | Concise rationale and evidence only, never chain-of-thought |

## 9. Visual direction

Near-black graphite canvas (`#0B0C0E`) with elevated surfaces (`#131519`, `#191C21`), warm neutral text (`#E8E6E3` / `#A5A29D`), and a single indigo accent (`#6C7BFF`). Semantic status colors appear only to convey state. Inter or the system stack, with `font-variant-numeric: tabular-nums` on all figures. Hairline 1px borders (`rgba(255,255,255,0.07)`), radii of 6 and 8px, one soft shadow level, motion capped at 160ms and used only for state change.

Four registers, visually distinct and consistently applied:

- **Operational state** — neutral surface, status chip, left rule
- **AI recommendation** — indigo hairline, "Recommended" label, confidence band
- **Human decision** — solid action controls, always the highest-contrast element on screen
- **Supporting evidence** — recessed surface, monospace metadata, source cards

Charts carry no gradients, no 3D, no decorative fills. Axis labels always present, tabular tick values, one accent series against neutrals, and direct labeling in place of legends wherever it fits.

## 10. Release criteria

See `tests/acceptance.spec.md`. In summary: all four workspaces functional through interaction; every KPI derived; Reset Demo restores byte-identical state; the three seeded scenarios deterministic; zero TypeScript, lint, test, or build errors; Playwright covering the seven-beat narrative; keyboard-only completion; loading, empty, and error states present; branding gate clean; README complete.
