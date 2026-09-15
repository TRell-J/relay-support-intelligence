# Demo Script

Seven beats, roughly six minutes. Every beat has a deterministic expected state that is asserted in `tests/e2e/narrative.spec.ts`. **Run Guided Demo** walks these same steps from `DemoScenario.guidedSteps`, so the tour, the script, and the test cannot drift apart.

Preconditions: fresh load or **Reset Demo** clicked. The "Synthetic demo data" marker is visible in the shell.

---

## Beat 0 — Frame (20s)

**Say:** "This is Relay Support Intelligence, a fictional internal employee-support layer. Everything is synthetic. The claim I want to test is that if you connect self-service, escalation, engineering, and prioritization into one evidence chain, systemic product problems surface weeks earlier."

**Show:** the four workspaces in the rail, and the synthetic-data marker.

---

## Beat 1 — Self-service that earns trust (60s)

**Do:** Employee Help → launch **VPN access after password reset**.

**Expected state:**

| Assertion | Value |
|---|---|
| Answer confidence band | `high` |
| Confidence value | `0.96` |
| Sources cited | `KB-0104`, `KB-0118` |
| Staleness flags | none |
| `canSelfResolve` | `true` |
| Events appended | `conversation.started`, `message.sent` ×2, `search.performed`, `answer.presented` |

**Do:** mark **Helpful**, then **Resolve**.

**Expected:** `answer.feedback[helpful]` and `conversation.resolved[self_service]` appended. Self-service resolution rate in Product Intelligence increases; the exact delta is computed, not asserted as a literal.

**Say:** "Two things matter here. The answer cites sources with an owner and a review date, so the employee can judge it. And the confidence isn't a decoration — it's a weighted score over coverage, source authority, freshness, and specificity, and you can open the breakdown."

---

## Beat 2 — The knowledge gap that should not self-resolve (50s)

**Do:** New conversation → launch **Expense-policy exception**.

**Expected state:**

| Assertion | Value |
|---|---|
| `search.failed` reason | `no_results` |
| `sensitiveDomain` | `policy_exception` |
| Confidence | `0.10`, band `low` |
| Sources retrieved | none — 0 of 4 required points covered |
| `canSelfResolve` | `false` |
| UI | Answer panel shows the ceiling explicitly, not a hedged answer |

**Say:** "The system knows what it does not know. Nothing in the knowledge base covers any of the four things this question needs, so it declines rather than assembling something plausible from adjacent articles. Policy exceptions are also an escalation-sensitive domain, so even a good answer here would need a person to confirm it."

**Do:** **Still need help**.

**Expected:** `case.created` with `source: 'low_confidence_handoff'`, `contextCompleteness: 1.0`, and navigation to the agent detail. A handoff receipt lists the six context fields carried across.

---

## Beat 3 — Escalation that preserves context (60s)

**Do:** New conversation → launch **SSO login loop**. Follow through to **Still need help**.

**Expected:** confidence `0.45` — the raw score was `0.69`, capped by the identity-access ceiling, with `post_password_reset` listed as the one uncovered concept and one of the two sources flagged past its review window. `CASE-0013` created, `system: 'Identity Provider'`, `urgency: 'high'`, `category: 'Access & Identity'`, `contextCompleteness: 1.0`. Navigates to Agent Workspace detail.

**Show on the case:** transcript, AI structured summary, attempted actions with outcomes, routing rationale with matched signals, suggested knowledge, similar cases, SLA countdown, audit history.

**Say:** "This is the more interesting failure. Two articles came back and both look relevant, but neither covers what happens after a password reset — so the score lands mid-band, and then the identity-access ceiling pulls it to 0.45. The agent didn't have to ask a single re-qualifying question. That's the context-completeness metric on the intelligence page — and it's derived from which of six required fields are actually populated, not self-reported."

---

## Beat 4 — Agent work, and the moment of recognition (60s)

**Do:** Assign to **Marcus Adeyemi**. Open **Similar cases** — four prior SSO login-loop cases from the last six days.

**Do:** **Mark related** on all four.

**Expected:** cluster detector fires. `cluster.detected` appended with `CLU-0003`, five member cases, signature `{Access & Identity, Identity Provider, [login_loop, post_password_reset, saml_assertion]}`. Match rationale printed. Cluster indicator appears in the queue for all five cases.

**Say:** "One of these tickets looks like user error. Five of them in seven days, all after a password reset, all on the same identity provider, is a platform defect. That distinction is the entire job of a support-platform data foundation."

---

## Beat 5 — Engineering handoff with derived blast radius (60s)

**Do:** **Escalate to engineering** from the case.

**Expected:**

| Assertion | Value |
|---|---|
| Issue created | `ENG-0005`, display key `IDP-207` |
| `linkedCaseIds` | the 5 cluster members |
| `affectedEmployees` | `5`, derived from distinct employees, shown with its provenance |
| Proposed severity | `sev2`, from affected count plus urgency mix |
| Linked case statuses | all → `waiting_on_engineering` |
| Events | `case.escalated`, `issue.created`, `issue.propagated` |

**Show:** the evidence list on the issue — the five cases, the cluster detection event, and the search-failure metric.

**Do:** Engineering Escalation → set `IDP-207` to **In Progress**, then **Monitoring**.

**Expected:** each transition propagates to all five cases and generates an **unsent** employee-update draft.

**Say:** "Note the draft is unsent. The system will not tell an employee something happened until a human sends it and the event is recorded. That's a rule enforced in code — the assistant literally cannot render an action claim without a matching event."

**Do:** Send the update on one case → `case.update_sent` appended and visible in audit history.

---

## Beat 6 — Product Intelligence (70s)

**Do:** Product Intelligence.

**Show, in order:**

1. Demand by category and trend — Access & Identity rising over three weeks.
2. Self-service resolution rate and escalation rate, with definition tooltips open on one of them.
3. Failed searches — the expense-policy exception query at the top.
4. Knowledge gaps — three topics with demand and no acceptable article.
5. Recurring-issue clusters — `CLU-0003` with time-to-detection.

**Do:** Filter to category **Access & Identity**.

**Expected:** every panel recomputes. Demand, rates, failed searches, and clusters all change. No panel is static.

**Say:** "Every number here is a pure function over the same event log the last five minutes produced. There are no hard-coded totals in this build — the tooltips give you formula, numerator, denominator, and window, and the tests snapshot the derivations."

**Point at:** time-to-detection for `CLU-0003`.

**Say:** "Six days from the first case to detection. That's the metric I'd actually run this team on."

---

## Beat 7 — Evidence becomes a roadmap decision (60s)

**Do:** Product Opportunities tab. Open **Eliminate the post-reset SSO login loop**.

**Show:** evidence links back to the cluster, the issue, and the failed searches. Then the priority panel:

```
reachNorm = 5 / 23 active employees
raw       = (reachNorm * impact * confidence) / effort
priority  = raw * (1 - risk) * 100
```

The panel renders the substituted arithmetic live from the current inputs. Exact
figures are filled in here once `src/domain/prioritization/score.ts` exists, so
this script never states a number the code does not compute.

**Do:** Edit **Effort** from 3 to 2.

**Expected:** score recomputes live, the explanation restates the arithmetic, the dominant driver updates, and the ranking against other opportunities changes. An `opportunity.scored` event is recorded.

**Do:** Move state from **Discover** to **Validate**.

**Say:** "The prototype's argument in one screen: the priority of this bet is defensible because every input traces to a recorded interaction. When engineering asks why this is above their preferred item, I can show the chain rather than the conviction."

---

## Reset

**Do:** **Reset Demo**.

**Expected:** state is byte-identical to a fresh `buildInitialState(20260914)`. Asserted by comparing a stable hash of the serialized store before and after the run.

---

## Failure recovery during a live demo

| If | Then |
|---|---|
| Cluster does not form at beat 4 | You marked fewer than three related cases. Mark the rest; the threshold is visible in the cluster panel. |
| Metrics look unchanged at beat 6 | A filter from a previous run is active. The active-filter chip row shows what is applied; clear it. |
| Anything is inconsistent | **Reset Demo** takes under a second and restores the exact starting state. |
