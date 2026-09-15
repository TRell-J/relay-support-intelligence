# Relay Support Intelligence

A prototype internal employee-support orchestration and product-intelligence layer.

**Everything in it is synthetic** — the product, the people, the knowledge base, the cases, the metrics. It integrates with nothing. Slack, Zendesk and Jira are borrowed here as interaction patterns, never as live connections.

```bash
npm ci
npm run dev     # http://localhost:3000
npm run verify  # typecheck, lint, branding gate, 194 unit tests, production build
npm run e2e     # 142 workflow tests across desktop and tablet
```

No API key, no environment file, no network access, no database. Click **Run guided demo** in the sidebar for a seven-beat tour.

---

## The problem

Internal employee support fails in a pattern that most support tooling never surfaces:

1. An employee asks a question in chat. The answer exists, but they can't find it — or the article they find is stale and they have no way to know.
2. When self-service fails, they re-explain everything in a ticket. The conversation, what they already tried, and the business impact are lost at the boundary.
3. An agent rebuilds that context by hand, resolves the ticket, and moves on. The ticket closes; the cause does not.
4. The same failure recurs across dozens of employees. Nobody connects them, so engineering never sees a defect and product never sees a roadmap item.

Each layer is locally rational and globally expensive. The cost stays invisible because **no single system holds the whole chain**, so no dataset exists that can say *"this recurring platform defect consumed 62 agent-hours and 340 employee-minutes this month."*

## The hypothesis

> Connecting source-grounded self-service, context-preserving escalation, recurring-issue detection, and roadmap prioritization into one evidence chain will reduce employee effort and agent rework while exposing systemic product problems earlier than ticket-by-ticket resolution can.

The falsifiable claim this prototype makes: **every number in Product Intelligence traces back to a specific employee interaction**, and the SSO opportunity's priority score is defensible from that evidence alone.

## Users

| User | Job to be done | Workspace |
|---|---|---|
| **Employee** | Unblock me now, and let me trust the answer | Employee Help |
| **Support agent** | Resolve fast without rebuilding context | Agent Workspace |
| **Engineering owner** | Tell me whether this is one user or a systemic defect | Engineering Escalation |
| **Product manager** | Decide what to build from evidence, not anecdote | Product Intelligence |

---

## Architecture

**Pure domain core, thin React shell.**

```
src/domain/**   framework-free TypeScript: retrieval scoring, case creation,
                clustering, issue propagation, metrics, prioritization, trust
                guards. No React, no browser APIs, no imports from the UI.
src/data/**     synthetic seed + deterministic generator
src/store/**    one Zustand store — the only place state mutates
src/components/ presentational; reads via selectors, writes via actions
src/app/**      routing and layout only, no business logic
```

Four workspaces share one store, so escalating a case updates the queue, the issue list, and every metric at once — cross-workspace consistency is a property of the architecture rather than something each screen remembers to do.

### Determinism is a feature

Same seed, same interactions, byte-identical state. That is what makes **Reset demo** an assertable guarantee and lets metric tests snapshot real derivations.

- Time comes from a fixed epoch (`DEMO_NOW`) and a monotonic demo clock. No wall-clock reads anywhere in the domain or data layers.
- IDs are counter-based (`CASE-0013`), never UUIDs.
- Randomness comes from one seeded PRNG.

A test scans `src/domain/**` and `src/data/**` for `Date.now`, `Math.random`, `crypto.randomUUID`, uuid/nanoid imports, and argless `new Date()` — and asserts the scanner still catches a planted violation, so it can't pass by matching nothing.

---

## The AI trust model

The interesting work in an AI product is trust, evaluation, and the escalation path — not the generation. Seven mechanisms, each enforced in code rather than in copy:

| Requirement | Mechanism |
|---|---|
| **Sources** | Every answer cites 1–3 articles with owning team and last-reviewed date |
| **Freshness** | Articles past 90 days are flagged and reduce confidence directly |
| **Confidence rationale** | The explanation is *emitted by the calculation* — each line is a term that contributed, so the number and its explanation cannot disagree |
| **Sensitive domains** | Security, identity/access, employee relations, policy exceptions, compensation and legal are capped at 0.45 and can never self-resolve, whatever the sources look like |
| **Unrecognized questions** | Free text that matches no known intent is capped at 0.40 and says so — coverage measured against a *guessed* intent is measuring the wrong question |
| **No unrecorded claims** | Messages carry `actionRefs`; action sentences are generated *from* recorded events, and a guard throws if a referenced event is missing |
| **Human escalation** | Always one click, never gated behind retry loops |

Confidence is a weighted score, not a decoration:

```
coverage      0.45   required concepts covered by the retrieved set
sourceQuality 0.25   mean authority of cited articles
freshness     0.20   decay over a 180-day review horizon
specificity   0.10   how much of the question retrieval addressed
              → then bounded by the lowest applicable ceiling
```

The three seeded scenarios each land differently, and all three values are **computed, not authored**:

| Scenario | Confidence | Outcome |
|---|---|---|
| VPN after password reset | **0.96** | Resolves. Two fresh sources, 4/4 coverage. |
| Expense-policy exception | **0.10** | Declines. Nothing in the corpus matches at all. |
| SSO login loop | **0.45** | Two plausible articles, neither covers the post-reset case, one is stale — raw score 0.69, then the identity-access ceiling binds. |

---

## Metric definitions

Every KPI is a pure function over one append-only event log. No stored totals, no authored chart series — a source scan fails the build if a metric value ever appears as a literal in the intelligence components. Each tile carries its formula, numerator, denominator and window as a tooltip.

| Metric | Formula |
|---|---|
| Support demand | `count(conversation.started)` |
| Self-service resolution | `conversation.resolved[self_service] / conversation.started` |
| Escalation rate | `case.created / conversation.started` |
| Answer acceptance | `helpful / (helpful + unhelpful)` |
| Search failure rate | `search.failed / search.performed` |
| Context completeness | `mean(populated required fields / 6)` at case creation |
| Recurring-issue volume | cases in an active cluster / open cases |
| Time to detection | `median(cluster.detectedAt − first member case createdAt)` |
| Agent rework | `mean(reassignments + status regressions)` per case |

**A failed search is not automatically a knowledge gap.** `mfa_device_change` is the most frequent failure in the corpus, and the article covering it already exists — it fails because the topic is escalation-sensitive and routes to a person by design. Reporting it as a gap would commission an article that already exists and bury the real finding. Failed searches are classified as **content gaps** (write the article) or **policy gates** (revisit the policy; an article changes nothing).

## Prioritization

```
reachNorm = reachEmployees / activeEmployees
raw       = (reachNorm × impact × confidence) / effort
priority  = round(raw × (1 − risk) × 100)
```

The score is **never stored** — only the inputs are. It is recomputed on every render, shown as substituted arithmetic rather than a bare number, and accompanied by the dominant driver and a sensitivity line. A prioritization number you can't argue with is one that gets ignored the moment someone disagrees.

---

## Demo script

Full version with expected state at each beat: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md). The seven beats are also the in-app guided tour *and* the end-to-end narrative test — one source, so they cannot drift apart.

1. **Self-service that earns trust** — VPN scenario resolves at 0.96 with sources and a breakdown that adds up.
2. **Knowing what it doesn't know** — expense-policy exception declines rather than improvising.
3. **Escalation that preserves context** — SSO case created at 100% context completeness; the agent asks nothing twice.
4. **The moment of recognition** — four related cases become a cluster, with the match rationale printed.
5. **Engineering handoff** — derived blast radius, proposed severity, status propagation, employee updates drafted *unsent*.
6. **Every number traces to an interaction** — filters recompute every panel; MFA is correctly classed a policy gate.
7. **Evidence becomes a roadmap decision** — editable inputs, live arithmetic, ranking that moves.

---

## Tradeoffs

Named as choices, not gaps.

| Not built | Why | What's there instead |
|---|---|---|
| Live LLM generation | Would make the demo non-deterministic and network-dependent, undermining the evaluation story | An isolated provider interface with a deterministic default |
| Real integrations | Out of scope, and faking them would violate the honesty rule this product is partly about | Clearly labelled pattern borrowing and an explicit state contract |
| Phone layout | Time better spent on the evidence chain | Desktop-first with a credible tablet state at 1024px |
| Agent scheduling, CSAT, capacity planning | Adjacent surfaces that would dilute the single hypothesis | Rework proxy and SLA state as the productivity signals the narrative needs |

**Deliberate data choices:** the recurring issue is absent from background demand (a cluster only means something if the pattern is *new*); some cases carry incomplete context on purpose (a metric that always reads 100% measures nothing); four articles are deliberately stale.

Every non-obvious decision is recorded with its rejected alternatives in [`docs/DECISIONS.md`](docs/DECISIONS.md) — 34 entries.

## Documentation

| Document | Contents |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Problem, hypothesis, users, workspaces, metric definitions |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every architectural and product decision, with alternatives rejected |
| [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) | Entities, the 25-type event taxonomy, derivation formulas |
| [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) | Seven beats with expected state |
| [`docs/ROLE_SIGNAL_MAP.md`](docs/ROLE_SIGNAL_MAP.md) | What each part of the build is meant to evidence |
| [`tests/acceptance.spec.md`](tests/acceptance.spec.md) | ~60 acceptance criteria, each mapped to a named test |

## Optional Claude adapter

`src/lib/ai/provider.ts` defines an `AnswerProvider` interface. `DeterministicProvider` is the default and the only implementation exercised by the demo or the tests. A Claude-backed implementation would sit behind the same interface, selected by an environment variable — it is never on a required path, and the build, the test suite, and the demo all pass with no network and no environment file.

## Synthetic data disclosure

All people, articles, cases, issues, systems, and metrics are invented for this prototype. Employee names are drawn from a fixed synthetic pool. Article contents are written for the demo. No real organization, product, employee, or internal document is represented, referenced, or implied. A branding gate (`npm run check:branding`) fails the build on any real-employer reference or any claim of a live external connection.
