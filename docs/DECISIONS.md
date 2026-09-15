# Decision Log

Append-only. One entry per decision that a future reader would otherwise have to reverse-engineer. Format: context → decision → consequences → alternatives rejected.

---

## D-001 — Fixed demo clock instead of wall-clock time

**Date:** planning · **Status:** accepted

**Context.** The prototype must show a 90-day demand trend, SLA countdowns, article staleness, and time-to-detection. It must also be resettable to a known state and snapshot-testable. Wall-clock time makes all four of those drift: seeded records age, SLA states flip depending on when the demo is run, and snapshots rot overnight.

**Decision.** A fixed epoch `DEMO_NOW = 2026-09-14T09:00:00.000Z`. All seeded timestamps are authored as offsets from it. Runtime events come from a monotonic `DemoClock` that advances a fixed 1000ms per recorded event. `Date.now()` and `new Date()` are lint-banned in `src/domain/**` and `src/data/**`.

**Consequences.** Metrics are snapshot-testable. Reset is exact. The UI must render relative times against `DEMO_NOW`, and a small "demo time" indicator in the shell prevents the fixed date from reading as a bug.

**Rejected.** Rebasing seed data to the current date at load — makes snapshots impossible and introduces timezone-dependent off-by-one failures in tests.

---

## D-002 — Deterministic IDs, no UUIDs

**Status:** accepted

**Context.** Test assertions, the demo script, and the reset guarantee all reference specific records.

**Decision.** Zero-padded counter factories per prefix (`CASE-0013`), reset with the store. No `uuid`, `nanoid`, or `crypto.randomUUID`.

**Consequences.** IDs are stable across runs and readable in the UI and in test failures. Two demo runs produce identical IDs, which is what makes the byte-identical reset assertion meaningful.

---

## D-003 — Client-side Zustand store, App Router as a thin shell

**Status:** accepted

**Context.** Next.js App Router encourages server components, but this prototype has no backend, and every workspace mutates shared state that must stay consistent across four routes.

**Decision.** The route layer provides layout, metadata, and navigation only. All workspaces are client components under one `RelayStoreProvider`. State is a single Zustand store with immer, hydrated from the pure `buildInitialState(RELAY_SEED)`.

**Consequences.** Cross-workspace consistency is free: escalating in the Agent Workspace updates the queue, the issue list, and every metric because they all select from one store. Cost: no server rendering benefit for the workspaces, which is irrelevant for a local prototype.

**Rejected.** React Context plus `useReducer` — workable, but selector-level subscriptions matter once Product Intelligence recomputes nine metrics on every filter change. Server actions plus a database — explicitly out of scope.

---

## D-004 — Session-scoped persistence, not local-storage persistence

**Status:** accepted

**Context.** A reviewer who accidentally refreshes mid-demo should not lose their place. But state that survives across days would make the "known state" guarantee confusing.

**Decision.** Persist the store to `sessionStorage` under a schema-versioned key. **Reset Demo** clears the key and rehydrates from seed. A schema-version mismatch resets silently. Playwright uses fresh contexts, so tests always start clean.

**Consequences.** Refresh-safe within a tab; a new tab or a closed browser starts fresh. The persistence layer must serialize the event log, which is the only thing that actually needs persisting.

---

## D-005 — Deterministic retrieval and confidence, no LLM in the default path

**Status:** accepted

**Context.** The brief requires source-grounded answers with confidence and rationale, and requires the demo to work with no network access or API key.

**Decision.** `src/domain/retrieval/score.ts` implements a weighted, unit-tested scorer over concept coverage, source authority, freshness, and specificity, with a hard confidence ceiling of 0.45 for escalation-sensitive domains. Confidence rationale strings are generated from the scorer's component outputs.

**Consequences.** The confidence number and its explanation cannot disagree, because the explanation is produced from the computation. Free-text employee input maps to the nearest seeded intent and states that it is doing so, rather than pretending to generate.

**Rejected.** Authoring confidence values per scenario — would make the rationale decorative and the sensitive-domain ceiling unenforceable.

---

## D-006 — Action claims must reference recorded events

**Status:** accepted

**Context.** The brief forbids the assistant claiming an action occurred unless state records it. A style guideline would not survive contact with a deadline.

**Decision.** Assistant and system messages carry `actionRefs: CaseEventId[]`. Sentences that assert an action are produced by `formatActionClaim(event)` from the recorded event, never authored as free text. A render-time guard `assertActionsRecorded` throws in development and test if any `actionRef` is missing from the event log, and renders a visible warning in production builds.

**Consequences.** Adding a new "we did X" message requires appending the event first. This is the intended friction. A unit test seeds a message with a dangling ref and asserts the guard fires.

---

## D-007 — Rule-based, explainable clustering

**Status:** accepted

**Context.** Recurring-issue detection must be credible, deterministic, and explainable to a support agent.

**Decision.** Weighted similarity over category (0.40), affected system (0.30), and Jaccard overlap of concept tags (0.30), with a 0.75 threshold, a rolling 7-day window, and a minimum of 3 members. Match rationale strings are emitted from the terms that fired.

**Consequences.** An agent can read exactly why two cases were grouped. Thresholds are constants in one module and are surfaced in the cluster panel, so the demo can explain the rule rather than assert it.

**Rejected.** Embedding similarity — non-deterministic without a pinned model, unexplainable in the UI, and requires a network dependency the brief rules out.

---

## D-008 — Affected-user count and severity are derived, never entered

**Status:** accepted

**Context.** The credibility of the whole intelligence layer rests on numbers being traceable.

**Decision.** `affectedEmployees` is the distinct `employeeId` count over an issue's linked cases. Proposed severity is a function of that count and the urgency mix of member cases. An engineer may override severity, which records an event and shows an override marker.

**Consequences.** Impact numbers cannot be inflated by authoring. The override path exists because real engineering judgment overrides heuristics, and showing the override is more honest than hiding it.

---

## D-009 — Priority score computed, never stored

**Status:** accepted

**Context.** Editable prioritization inputs plus a stored score invites divergence between the two.

**Decision.** Only `PriorityInputs` are stored. `priorityScore` and `explanation` are derived on every render by `src/domain/prioritization/score.ts`. Edits record an `opportunity.scored` event carrying the inputs and the resulting score, which gives an audit trail without making the score a source of truth.

---

## D-010 — Product Opportunities as a tab, not a drawer

**Status:** accepted

**Context.** The brief allows either. Opportunities need five editable numeric inputs, an arithmetic explanation, a sensitivity line, an evidence list, and a ranked comparison against peers.

**Decision.** A tab within Product Intelligence.

**Consequences.** Room for the comparison table that makes prioritization legible. A drawer would have forced either truncation or a scrolling form, and the comparison is the point.

---

## D-011 — Tailwind v4 with CSS-first design tokens

**Status:** accepted

**Context.** The visual direction depends on a disciplined, small token set, and the brief asks for design tokens as a foundation deliverable.

**Decision.** Tailwind v4 with tokens declared in `@theme` in `globals.css`. shadcn/ui components are added individually, in its Tailwind-v4 mode, and only where they earn their place.

**Consequences.** Tokens are inspectable in one file, which suits a portfolio artifact. Risk: shadcn's v4 support is newer than its v3 support. Mitigation in the plan — the component subset is small and each one is verified as it is added; falling back to Tailwind v3 is a contained change confined to the config and `globals.css`.

---

## D-012 — Vitest for domain, Playwright for workflow

**Status:** accepted

**Decision.** Vitest covers pure domain functions, metric derivations (snapshot), reducers, and the trust guard. Playwright covers the seven-beat narrative, keyboard-only completion, filter recomputation, and the reset guarantee. No component-level unit tests except for the trust guard and the priority panel arithmetic.

**Rationale.** The risk in this build is derivation correctness and workflow integrity, not component rendering. Testing effort follows the risk.

---

## D-013 — Claude adapter isolated and unwired

**Status:** accepted

**Context.** The brief permits an optional Claude adapter but requires that it never be needed to build, test, or demo.

**Decision.** `src/lib/ai/provider.ts` defines an `AnswerProvider` interface. `DeterministicProvider` is the default and the only implementation exercised anywhere. `ClaudeProvider` ships as a documented implementation selected only when `RELAY_AI_PROVIDER=claude` and a key are both present; it throws a clear error otherwise and is never imported by a required path. No API route exists in the default build.

**Consequences.** `npm run build` and the full test suite pass with no network and no environment file. The README documents the interface as the extension point.

---

## D-014 — Repository name and location carry no employer reference

**Status:** accepted

**Context.** The working directory sits under a folder named for a real company.

**Decision.** The repository is `relay-support-intelligence`. No file, string, comment, commit message, or package field references any real employer. `npm run check:branding` greps for a forbidden-term list and fails the build.

**Consequences.** The parent directory can be renamed or the project moved with no changes. The gate runs in `npm run verify`.

---

## D-015 — Toolchain versions pinned by scaffold, with one corrected peer

**Status:** accepted · **Slice:** 1

**Context.** The plan flagged two dependency risks: shadcn/ui on Tailwind v4, and Recharts against React 19.

**Decision.** Scaffolded on Next 16.3.5 / React 19.2.8 / Tailwind v4. Recharts 3.10.1 installed with no peer warnings, so the React 19 risk is retired. `create-next-app` pinned `@types/node@^20`, which conflicts with Vitest 5's `^22 || >=24`; raised it to `^24` to match the actual Node 24 runtime rather than forcing resolution with `--legacy-peer-deps`.

**Consequences.** No forced peer resolutions anywhere in the tree. The shadcn/Tailwind-v4 risk is still open and will be settled when the first component is added.

---

## D-016 — The determinism rule is a release gate, not a convention

**Status:** accepted · **Slice:** 1

**Context.** ADR D-001 and D-002 ban wall-clock time and entropy in the pure layers. A convention that only lives in a doc will not survive a deadline.

**Decision.** `tests/unit/determinism.test.ts` scans every file under `src/domain/**` and `src/data/**` for `Math.random`, `crypto.randomUUID`, `Date.now`, `uuid`/`nanoid` imports, and argless `new Date()`. Comments are stripped before scanning, and a self-check asserts the scanner still catches a planted violation, so it cannot silently pass by matching nothing.

**Consequences.** Two refinements fell out of building it. `new Date(ms)` with an explicit argument is deterministic and is allowed — only the argless form reads the wall clock. And the modules that *document* the rule were being flagged for naming the banned constructs, which is why comments are stripped.

**Note.** The same gate caught the first real violation immediately: `npm run check:branding` failed on `CLAUDE.md`, which named an employer while stating the no-employer rule. Reworded rather than exempted, since a file-level exemption would have hollowed out the portability guarantee in D-014.

---

## D-017 — Demo anchored to the send date, and re-anchorable in one place

**Status:** accepted · **Slice:** 1 · **Supersedes the epoch chosen in D-001**

**Context.** The fixed clock (D-001) buys determinism but fixes how "current" the data feels. A reviewer opening the prototype should see a trailing window that reads as recent, not as archival.

**Decision.** `DEMO_NOW` moved to `2026-09-14T09:00:00.000Z` — the Monday immediately before the intended send date. `RELAY_SEED` follows the same date (`20260914`) so the seed and the epoch cannot drift apart in a reader's mind.

Chosen over anchoring a week forward: a forward anchor would put seeded records in the future during rehearsal, which reads as a bug to the person demoing it. A recent-past anchor never does.

**Consequences.** Re-anchoring later is two lines — the constant in `src/domain/clock.ts` and the matching assertion in `tests/unit/determinism.test.ts`. Nothing else hard-codes a date: all seed data is authored as offsets through `isoOffset()`, and the test suite fails loudly if that stops being true. The procedure is documented in the `clock.ts` header.

**Open.** A fixed epoch still ages. If the process runs into a later interview loop, bump the constant and re-run `npm run verify`; the whole corpus shifts with it.

---

## D-018 — Scenario numbers come from the scorer, and the docs follow the code

**Status:** accepted · **Slice:** 2

**Context.** The planning docs quoted a VPN confidence of `0.86` and an expense failure reason of `below_threshold`. Those were written before the scorer existed — plausible-sounding placeholders, not computed values.

**Decision.** Build the scorer and the corpus first, compute the real outcomes, then correct the documentation to match. The actual values:

| Scenario | Confidence | Band | Failure | Self-resolves |
|---|---|---|---|---|
| VPN after password reset | `0.96` | high | none | yes |
| Expense policy exception | `0.10` | low | `no_results` | no |
| SSO login loop | `0.45` | low | `below_threshold` | no |

**Consequences.** Two of the three narrative beats got *better* for being computed rather than authored. The expense case fails with `no_results` rather than `below_threshold`, which is a stronger knowledge-gap story: nothing in the corpus matches at all. And the SSO case turns out to be the most interesting of the three — two plausible-looking articles come back, neither covers `post_password_reset`, one is past its review window, the raw score lands at `0.69`, and then the identity-access ceiling pulls it to exactly `0.45`. That is a far better illustration of layered failure than the flat cap originally scripted.

**Standing rule.** When a document and the implementation disagree about a number, the implementation is right by construction and the document is corrected. Anything else reintroduces exactly the drift between claim and computation that this prototype argues against (ADR D-005).

**Also fixed here.** The codebase had drifted between UK and US spelling (`enrolment`/`licence`/`normalised`). Swept to US throughout, since the audience is a US employer. This surfaced a latent bug: `IntentKey` declared `benefits_enrollment` while the intent catalogue declared `benefits_enrolment`, which the compiler caught only once the two files were read together.

---

## D-019 — The recurring issue is absent from background demand

**Status:** accepted · **Slice:** 1

**Context.** The background generator drew intents from a weighted demand spec that included `sso_login_loop`. Because SSO always fails the answer threshold, every one of those conversations escalated. The first seed run produced **21 SSO cases spread across 60 days** alongside the 4 hand-authored narrative cases.

That is a broken demo. A recurring-issue cluster is only meaningful if the pattern is *new*. Twenty-one cases spread over two months is steady state, and an agent noticing five of them would be noticing nothing.

**Decision.** `sso_login_loop` is removed from the background demand spec entirely. The only login-loop cases in the system are the four authored in `narrative.ts`, all inside the last six days, plus the fifth the employee creates during the demo. The rising Access & Identity trend is carried by `mfa_device_change` instead, which is in the same category but carries different concept tags and so cannot pollute the cluster signature.

**Consequences.** Clustering now has exactly five members across five distinct employees, and time-to-detection is a real number. The seed test asserts all four narrative preconditions — count, distinct employees, the seven-day window, and identical signatures — so this cannot silently regress.

**How it was caught.** By probing the generated corpus rather than trusting the generator. Worth noting: nothing about the code was wrong. The generator did exactly what its spec said; the spec encoded a story that contradicted the one the demo tells. That class of bug is invisible to typechecking and to unit tests written against the same wrong assumption.

**Volume note.** The corpus is larger than the ~400 events planned: 153 conversations, 65 cases, 1,373 events. Left as-is, because the maintainability concern behind that target was about *authored* records, and all of this is generated from a ten-line spec. Density makes the charts credible.

---

## D-020 — Displayed rationale components reconcile exactly to the displayed score

**Status:** accepted · **Slice:** 2

**Context.** The confidence breakdown showed four components at three decimals. For the VPN answer they summed to `0.955` against a headline of `0.96`; for the SSO answer, five components summed to `0.46` against `0.45`. The underlying arithmetic was correct — `rationaleTotal` equals the confidence exactly, and a unit test asserts it — but *what a reader sees* did not add up.

In a product whose central argument is that the explanation is the computation, a breakdown that visibly fails to reconcile is the worst available detail to get wrong. A reviewer who checks the arithmetic and finds it off by a rounding unit has been handed a reason to distrust everything else on the page.

**Decision.** `reconciledContributions()` applies largest-remainder apportionment: floor each component at the display precision, then distribute the leftover units to whichever components lost most to flooring. The displayed parts now always sum to the displayed total, and no component moves by more than one unit in the last shown place.

**Rejected.** Loosening the test tolerance, which would have hidden the discrepancy rather than fixed it. Also rejected: displaying more decimals, which does not solve the problem for any specific precision and makes the panel harder to read.

---

## D-021 — An unrecognized question is capped, not merely scored lower

**Status:** accepted · **Slice:** 2

**Context.** Free text that matched no intent fell back to the nearest seeded topic with `specificity: 0.3`. Because specificity carries only 0.10 weight, the nonsense input "what is the capital of anywhere at all" produced **0.89, high confidence** against the VPN sources. The end-to-end test caught it.

The bug was conceptual, not numeric. Coverage is measured against the concepts of the intent we *guessed*. If the guess is wrong, high coverage is measuring the wrong question entirely, and no amount of reweighting a 0.10 term fixes that.

**Decision.** `questionUnderstood: false` applies a hard ceiling of `0.40`, alongside the sensitive-domain ceiling, and adds a "Question not recognized" line to the rationale. Not understanding the question is now a first-class reason to withhold confidence, on the same footing as the topic being escalation-sensitive.

**Consequences.** The two ceilings compose — the effective ceiling is the lower of the two — so the mechanism generalizes if more reasons to withhold are added later.

---

## D-022 — The conversation column is proportional, not fixed

**Status:** accepted · **Slice:** 2

**Context.** The visual direction forbids the chat surface dominating. The column was built at a fixed `max-w-[640px]`, which looked correct in isolation. Measured at 1440px, once the 232px rail is subtracted, it left the conversation at 640px and the evidence region at 568 — chat was the *wider* of the two, the exact inversion the direction rules out.

**Decision.** `w-[46%] min-w-[360px] max-w-[560px]`. Evidence is the larger region at every supported width, asserted in the end-to-end test at both 1440 and 1024.

**Note.** This was invisible in review. The screenshot read as evidence-dominant because that column is denser and more content-rich, and it took a bounding-box assertion to show the layout said otherwise. Worth remembering: "looks right" and "is right" diverge most reliably in layout.

---

## D-023 — The weekday calculation was wrong for sixty days of history

**Status:** accepted · **Slice:** 3

**Context.** The generator skips weekends. `isWeekend` computed the day index as `(7 - daysAgo % 7) % 7`, which classifies the demo present — a Monday — as a Sunday. The generator had therefore been skipping the wrong two days for the entire history, and produced **no same-day work at all**.

The visible symptom was elsewhere: the queue showed 12 open cases and 12 breached SLAs, with no case ever on track. That reads as broken data and makes the SLA column carry no information.

**Decision.** The demo present is weekday index 1, so counting back N days lands on `((1 - N) mod 7 + 7) mod 7`. Generation now runs down to and including day zero.

**Related fixes made in the same pass.** Three separate causes were compounding:

1. **Hour offsets were being read as offsets from the demo present.** `isoOffset({ days: -2, hours: 9 })` is not "two days ago at 9am" — with a 09:00 anchor it is the previous evening at 18:00. Added `atHour(daysAgo, hour)` to `clock.ts` so seed data can be authored in working-day terms, which is how it was always meant to read.
2. **The demo present moved to 17:00.** With a 09:00 anchor there is no working day behind "now", so same-day cases were impossible even after the weekend fix. A Monday late afternoon leaves a full day of activity behind it.
3. **Old cases lingered open.** 15% of cases older than three days never closed, and every one of them was long past its target. Close probability is now 0.97 beyond five days, tapering to 0.25 for the last two.

**Result.** 7 open cases of 55, split 5 breached / 1 at risk / 1 on track — all three states reachable, which is the point of showing the column.

**Worth noting.** None of these were caught by typechecking, lint, or 125 unit tests, all of which were green throughout. They surfaced from reading a screenshot of the queue and asking why every row said the same thing.

---

## D-024 — "Open only" is a view mode, not a filter constraint

**Status:** accepted · **Slice:** 3

**Context.** The queue opens with resolved and closed cases hidden. Because that was implemented as a filter, a freshly loaded page advertised "Clear 1" before the user had filtered anything, and pressing Clear *widened* the result set from 7 rows to 55 — the opposite of what clearing a filter should do.

**Decision.** `openOnly` is excluded from the active-filter count, and Clear restores `DEFAULT_FILTERS` (the state the queue opens in) rather than `EMPTY_FILTERS` (no constraints at all). The distinction is between what the user chose and what the view is.

---

## D-025 — Search flattens internal identifier spelling

**Status:** accepted · **Slice:** 3

**Context.** Concept tags are snake_case (`login_loop`). An agent typing "login loop" into the queue search got zero results, because the search compared against the raw tag.

**Decision.** Underscores are flattened on both sides of the comparison. Internal spelling is an implementation detail and has no business shaping what a person is allowed to search for.

---

## D-026 — Escalation carries the whole cluster, not the case you happened to open

**Status:** accepted · **Slice:** 4

**Context.** Escalating a case that belongs to a recognized cluster raises the question of what to link: the one case, or all of them.

**Decision.** All of them. `escalateToEngineering` resolves the seed case's cluster and links every member.

**Rationale.** Escalating one member of a known pattern and leaving the rest behind recreates exactly the fragmentation the cluster exists to undo — four cases would still be sitting in the queue looking unrelated, and the affected-user count on the issue would understate the problem by 75%. The button label changes to "Escalate cluster to engineering" so the wider action is never a surprise.

---

## D-027 — `in_progress` on an issue does not move the linked cases

**Status:** accepted · **Slice:** 4

**Context.** The propagation table maps each issue status onto a case status. The obvious mapping gives every issue status a case-side effect.

**Decision.** `in_progress` maps to `null` — no case status change, only a drafted update.

**Rationale.** Engineering working on a fix does not change what the support side is waiting for; the cases are still waiting on engineering. Churning case status for internal engineering activity would fill every audit history with transitions that carry no information, and the audit history is only useful while every line in it means something.

---

## D-028 — Propagation is previewed by the function that performs it

**Status:** accepted · **Slice:** 4

**Context.** A status change on an issue can move four support cases and draft four employee updates. That is a large blast radius for a dropdown.

**Decision.** `planPropagation()` computes the plan without applying it. The UI renders that plan as a preview with Apply and Cancel, and `applyPropagation()` executes the same plan.

**Consequences.** The preview cannot drift from the behavior, because there is one function and one plan. Cancelling is genuinely inert, which an end-to-end test asserts.

**And the drafts stay unsent.** Propagation tells the *support side* what changed. Telling the *employee* is a separate act a person performs and the log records. Four drafts are created; `case.update_sent` is written only on an explicit send (ADR D-006).

---

## D-029 — A failed search is not automatically a knowledge gap

**Status:** accepted · **Slice:** 5 · **The most consequential product call in this slice**

**Context.** The obvious implementation of a knowledge-gap view counts failed searches per topic and ranks them. Running it produced this:

| Topic | Failures | |
|---|---|---|
| `mfa_device_change` | 18 | top of the list |
| `expense_policy_exception` | 15 | |
| `sso_login_loop` | 4 | |

MFA leads — and **KB-0127 covers every concept that question needs**. It fails only because identity and access is escalation-sensitive and gets ceiling-capped. Handing that list to a product manager sends someone off to commission an article that already exists, and buries the actual finding: a policy gate is generating 18 support requests.

**Decision.** Failed searches split into two populations that imply opposite actions:

- **Content gap** — nothing retrieved, only stale sources, or a measurable coverage shortfall. *Write or refresh the article.*
- **Policy gate** — an answer exists, but the topic routes to a person by design. *Revisit the policy, or make the handoff cheaper. An article changes nothing.*

`kb.gap_flagged` is recorded only for content gaps. The failed-search table shows both, labelled.

**Consequences.** MFA disappears from Knowledge Gaps despite being the most frequent failure, which is the correct and initially surprising result. The remaining gaps — expense-policy exceptions and the SSO post-reset case — are ones the corpus genuinely cannot answer.

**Also fixed here.** Gap flagging originally ran inside the background generator, so it never saw the hand-authored SSO cases. It now runs as a final pass over the whole corpus, because a gap is a property of the corpus rather than of one generation step.

---

## D-030 — Metrics read the live demo clock, not the fixed epoch

**Status:** accepted · **Slice:** 5

**Context.** `applyFilters` bounded its range at `DEMO_NOW_MS`. Runtime events are stamped at `DEMO_NOW + clockOffsetMs`, so **every event the demo itself produced was read as future-dated and dropped.** Product Intelligence would have shown a static snapshot that never responded to anything a reviewer did.

**Decision.** The metrics view computes `nowMs` as `DEMO_NOW_MS + clockOffsetMs`.

**Consequences.** The page now reflects in-session work, which is the entire claim it makes. An end-to-end test runs a conversation through Employee Help and asserts demand increments by exactly one; another forms a cluster in the Agent Workspace and asserts it appears with its time to detection.

**Worth noting.** The unit tests were green throughout, because they compute metrics over the seeded log where every event predates the epoch. Only an end-to-end test that *did something first* could catch this.

---

## D-031 — Chart design: single series, direct labels, validated contrast

**Status:** accepted · **Slice:** 5

**Context.** The first pass coloured category bars by escalation rate — accent for 100%, neutral otherwise.

**Decision.** Three corrections, each from a rule rather than taste:

1. **No colour-only status encoding.** The escalation rate is now direct-labelled at the end of each bar. The old version was unreadable for a colourblind viewer and invisible in print, and the label carries more information than the hue did.
2. **Contrast validated, not eyeballed.** The bar fill measured 2.25:1 against the panel surface, below the 3:1 floor for a non-text mark. Replaced with one that measures 4.30:1. Every status colour was checked the same way; all pass AA for text.
3. **No entrance animation.** The design direction limits motion to state change, and Recharts' mount animation re-runs on every container re-measure — which left both plots blank in a full-page capture while the DOM reported marks present.

**Metric tiles regrouped.** Nine equally weighted tiles is a wall of numbers that tells a reader nothing about how to read it. They are now grouped into the three questions the page answers — demand and deflection, answer quality, systemic signal — which states the argument rather than leaving it to be inferred.

---

## D-032 — Selection is pinned the moment the opportunity panel is used

**Status:** accepted · **Slice:** 6

**Context.** With no row explicitly chosen, the detail panel fell back to the top-ranked opportunity. Since editing an input re-ranks the table, adjusting effort could silently swap the panel to a different opportunity — the person editing would look up and find themselves changing something else.

**Decision.** Any interaction with the panel pins the selection. Creating an opportunity from an engineering issue deep-links to that specific id rather than landing on whatever ranks first.

**How it was caught.** A browser script that edited an input and then asserted the score had changed. It had not — because the panel had moved on. Neither typechecking nor a unit test on `computePriority` could see this; the function was correct throughout.

---

## D-033 — Route focus moves on navigation, never on mount

**Status:** accepted · **Slice:** 7 · **Release-blocking accessibility bug**

**Context.** The shell moves focus to the workspace region on route change so keyboard users are not left in the navigation. Implemented as an effect on `pathname`, it also fired on first load — so focus landed inside `<main>` before the user had done anything, and **the very first Tab went to page content, making the skip link and the entire navigation rail unreachable by keyboard.**

**Decision.** The effect compares the previous pathname and returns when it has not changed.

**Why not a boolean "is first render" guard.** That was the first attempt and it did not work: React StrictMode invokes effects twice in development, so the first invocation flipped the flag and the second focused anyway. Comparing the previous value is immune to double-invocation.

**How it was caught.** A test asserting the skip link is the first tab stop, then a script that printed the first four tab stops and the active element on load. The reported `activeElement` was `MAIN`, which made the cause obvious — and would have been invisible to any test that focused elements directly instead of tabbing to them.

---

## D-034 — The branding gate does not understand negation, deliberately

**Status:** accepted · **Slice:** 7

**Context.** The gate failed on the README's own disclaimer — a sentence stating that the prototype has no live link to the named vendors. A denial, matched as a claim.

(This entry originally quoted that sentence verbatim and tripped the gate a second time, which is the rule working rather than a flaw in it.)

**Decision.** Reword the denial rather than teach the pattern about negation.

**Rationale.** A negation-aware regex is a regex that can be talked out of firing. The failure mode that matters here is a real integration claim slipping through, not a disclaimer being inconvenienced. A strict gate plus occasional rewording is the correct trade, and the reasoning is recorded in the script so the next person does not "fix" it.

---

## D-035 — The open conversation survives a refresh, and that required a real control

**Status:** accepted · **Slice:** 7

**Context.** Testing the production build revealed that refreshing mid-demo dropped the reviewer back to the scenario launcher. The conversation data persisted; the pointer to it did not, so the record existed but nothing showed it.

**Decision.** The active conversation is persisted under its own `sessionStorage` key, deliberately *not* folded into `RelayState` — it is a UI pointer, and putting it inside the state object would place it inside the hash the Reset-Demo guarantee is asserted against.

**The consequence that mattered more than the fix.** With reload no longer clearing the conversation, there was suddenly no way to ask a second question. Reload had been serving as an accidental "new conversation" button. A **New question** control now exists, which the surface should have had regardless.

**And it introduced a hydration bug.** The restored pointer is invisible to the server, so the header button and the answer panel rendered different trees on each side — React error #418 in a production build. Fixed by gating every data-dependent branch on hydration rather than only the transcript. Worth noting: the dev server showed this as a recoverable warning; only the production build made it an error, and only a test that reloaded mid-flow exercised it at all.

---

## D-036 — List links are not prefetched

**Status:** accepted · **Slice:** 7

**Context.** A queue of a dozen rows fired a dozen RSC prefetch requests on render, most cancelled immediately. The aborted requests filled the console, which is where real errors are supposed to be visible.

**Decision.** `prefetch={false}` on every high-cardinality list link — queue rows, issue rows, similar cases, linked cases.

**Consequence.** The production console is now completely clean across the full narrative at both viewports, which is what makes a console error meaningful when one does appear.
