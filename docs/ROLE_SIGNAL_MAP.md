# Role Signal Map

Maps each requirement in the target role to the specific artifact in this prototype that demonstrates it, and to the judgment the artifact is meant to evidence. This is the document a hiring manager should be able to read alongside the demo.

Legend for **Evidence type**: `P` product thinking · `D` design judgment · `T` technical execution · `M` measurement rigor

---

## Core role requirements

| # | Role requirement | Where it shows in the product | Evidence type | The judgment being demonstrated |
|---|---|---|---|---|
| 1 | Product strategy and roadmaps | `Product Opportunities` tab: evidence-linked backlog with Discover / Validate / Planned / In Progress states and an explicit priority formula | P, M | Strategy expressed as a sequenced, defensible set of bets rather than a feature list |
| 2 | Full-lifecycle ownership | The seven-beat narrative runs intake → self-service → escalation → agent resolution → engineering defect → status propagation → prioritized opportunity, in one state model | P | Ownership of the whole loop, including the unglamorous handoffs where value leaks |
| 3 | Customer insights and metrics | `Product Intelligence`: nine KPIs, all derived from one event log, each with a formula tooltip; failed-search and knowledge-gap views | M | Insight discipline — a metric is only as good as its definition and its lineage |
| 4 | Cross-functional product judgment | Four workspaces model four distinct operating roles with genuinely different information needs, not one dashboard with role filters | P, D | Understanding that support, engineering, and product disagree about what matters, and designing for that |
| 5 | Intuitive design across complex workflows | Four visual registers (operational state / AI recommendation / human decision / supporting evidence) applied consistently across dense screens | D | Managing density without flattening meaning |
| 6 | Internal support tools | Agent Workspace: SLA state, assignment, rework signals, suggested knowledge, similar cases, audit history | P, D | Familiarity with the actual mechanics of agent work, not a ticket list mockup |
| 7 | Slack / Zendesk / Jira-style integrations | Chat-style intake, case queue and detail, engineering issue tracker with bidirectional status propagation — all clearly labeled as patterns, never as connections | P, T | Integration thinking centered on the *state contract* between systems, plus the honesty to not fake it |
| 8 | Data foundation for support demand and recurring issues | Typed append-only event model; every KPI a pure function over it; clustering derived from case attributes | M, T | The foundational move: instrument the chain first, then the metrics fall out |
| 9 | Self-service | Source-grounded answers with confidence, freshness, sources, and feedback; failed self-service is measured, not hidden | P, M | Treating deflection as a quality problem rather than a volume target |
| 10 | Support-agent productivity | Context-preserving escalation, AI summary, routing rationale, suggested knowledge, one-click related-case linking | P, D | Productivity as removing rework, not adding automation surface |
| 11 | Workflow automation | Deterministic transitions: escalation creates a linked issue, clustering triggers on threshold, issue status propagates to cases and drafts an update | P, T | Automation placed at verified state boundaries, with a human confirmation before anything leaves the building |
| 12 | AI-powered products | Confidence with component rationale, sensitive-domain ceilings, source grounding, feedback capture, audit trail, and a hard rule that the assistant cannot claim unrecorded actions | P, T | AI product maturity: the interesting work is trust, evaluation, and the escalation path, not the generation |

## Differentiating signals beyond the checklist

| Signal | Artifact | Why it matters for this role |
|---|---|---|
| **Incident vs. systemic problem** | The SSO scenario deliberately shows one case that reads as user error and five that read as a platform defect, with the clustering rationale printed | The central analytical skill of a support-platform PM; most portfolios show a ticket list and stop |
| **Metric lineage** | Every KPI tooltip names formula, numerator, denominator, window; a reviewer can click from a chart to the underlying cases | Prevents the "dashboard of plausible numbers" failure that makes support metrics untrustworthy |
| **Context completeness as a measured KPI** | Derived from populated context fields at case creation, not self-reported | Names and instruments the exact place value leaks between self-service and agent work |
| **Time-to-detection** | Computed as cluster detection time minus first member case | Reframes support data as an early-warning system for product defects |
| **Trust enforcement in code** | `assertActionsRecorded` guard; action sentences formatted from events | Turns an AI-safety principle into a mechanism, which is what shipping actually requires |
| **Deterministic evaluation surface** | Fixed seed, fixed clock, deterministic IDs, snapshot-tested metrics | The prerequisite for evaluating an AI feature at all; also makes the demo reliable in an interview |
| **Prioritization transparency** | Editable inputs, substituted arithmetic, dominant-driver callout, sensitivity line | Shows prioritization as a conversation with stakeholders rather than a spreadsheet verdict |
| **Restraint** | No chatbot hero, no gradients, no sparkle iconography; chat is one column of four workspaces | Demonstrates the taste to keep AI in proportion to the operational product around it |

## Deliberate scope sacrifices

Named here so a reviewer reads them as choices, not gaps.

| Not built | Why | What is shown instead |
|---|---|---|
| Live LLM generation | Would make the demo non-deterministic and network-dependent, undermining the evaluation story | An isolated provider interface with a deterministic default, documented in the README |
| Real integrations | Out of scope, and faking them would violate the honesty rule that this product is partly about | Clearly labeled pattern borrowing and an explicit state contract |
| Multi-language, accessibility beyond WCAG AA basics, mobile phone layout | Time better spent on the evidence chain, which is the differentiating claim | Desktop-first with a credible tablet state and keyboard-complete flows |
| Agent scheduling, capacity planning, CSAT surveys | Adjacent surfaces that would dilute the single hypothesis | Rework proxy and SLA state as the productivity signals that matter to the narrative |
