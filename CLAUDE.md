# CLAUDE.md — Relay Support Intelligence

Operating instructions for any agent session working in this repository.

## What this is

A **portfolio prototype**, not a product. It exists to demonstrate senior product
judgment about internal employee-support platforms: conversational intake,
source-grounded self-service, context-preserving escalation, agent productivity,
recurring-issue detection, engineering handoff, and evidence-based prioritization.

Fictional product name: **Relay Support Intelligence**. Everything in it is synthetic.

## Non-negotiable rules

1. **No real-company references.** No real-employer names, logos,
   internal terminology, screenshots, employee identities, or implied affiliation.
   The parent directory name is incidental and must never leak into code, copy,
   commits, metadata, or docs. Grep gate: `npm run check:branding`.
2. **All data is synthetic.** A persistent "Synthetic demo data" marker is rendered
   in the app shell at every viewport. Never remove it.
3. **No real integrations.** No Slack/Zendesk/Jira APIs, no database, no auth, no
   telemetry. UI may be *inspired by* those tools; it must never claim to be
   connected to them. Copy says "Slack-style intake"; asserting a live link to any
   named vendor is forbidden and is caught by the branding gate.
4. **Determinism is a feature.** Same seed + same interactions => byte-identical
   state. Consequences, enforced by lint rules and tests:
   - No `Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()`,
     `nanoid`, or `uuid` anywhere under `src/domain/**` or `src/data/**`.
   - Time comes from `DEMO_NOW` + the deterministic clock in `src/domain/clock.ts`.
   - IDs come from `src/domain/ids.ts` counter factories, reset on demo reset.
   - Randomness comes from the seeded PRNG in `src/data/prng.ts` (mulberry32).
5. **No unrecorded action claims.** The assistant/UI may only state that something
   happened if a corresponding event exists in the event log. Action sentences are
   *formatted from events*, never authored as free text. See
   `src/domain/trust/actionClaims.ts` and ADR D-006.
6. **Every KPI is derived.** No hard-coded totals, percentages, or chart series.
   Each metric is a pure function over `RelayEvent[]` in `src/domain/metrics/**`
   and carries a machine-readable definition surfaced as a tooltip.
7. **Escalation-sensitive domains** (security, identity/access, employee relations,
   policy exceptions, compensation, legal) are capped at low confidence and routed
   to a human. This is enforced in the retrieval scorer, not in copy.
8. **No hidden chain-of-thought.** Show concise user-facing rationale and evidence.

## Architecture in one paragraph

Next.js App Router + TypeScript strict. The route layer is a thin shell; all four
workspaces are client components sharing one Zustand store hydrated from a pure
`buildInitialState(seed)`. Domain logic (retrieval scoring, case creation,
clustering, status propagation, metrics, prioritization) lives in `src/domain/**`
as pure, framework-free, unit-tested functions. React only renders and dispatches.
Recharts renders series that are computed in `src/domain/metrics/**`, never in
components.

## Working loop (required for every slice)

```
1. Read the relevant files and docs/IMPLEMENTATION_PLAN.md checklist
2. State the slice plan in chat before editing
3. Write/update tests first (Vitest for domain, Playwright for workflow)
4. Implement the minimum complete solution
5. npm run test:unit -- <focused path>
6. npm run typecheck && npm run lint && npm run check:branding
7. npm run e2e -- <focused spec>
8. Screenshot at 1440x900 and 1024x768; review both
9. Append to docs/DECISIONS.md; tick docs/IMPLEMENTATION_PLAN.md
10. Report: what passed, what remains, deliberate deviations
```

Never mark a slice done with a failing typecheck, lint, unit test, e2e test, or
production build.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server on :3000 |
| `npm run build` | Production build (must pass before any slice is "done") |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run lint` | ESLint incl. determinism + branding rules |
| `npm run test:unit` | Vitest domain/metric tests |
| `npm run e2e` | Playwright workflow tests |
| `npm run check:branding` | Fails on forbidden brand strings |
| `npm run verify` | typecheck + lint + branding + unit + build |

## Directory contract

- `src/app/**` — routing, layout, server shell only. No business logic.
- `src/domain/**` — pure TypeScript. No React, no browser APIs, no imports from `src/app` or `src/components`.
- `src/data/**` — synthetic seed authoring + deterministic generator. No React.
- `src/store/**` — Zustand store, actions, selectors. Only place that mutates state.
- `src/components/**` — presentational + composed UI. Reads via selectors, writes via actions.
- `src/lib/ai/**` — the optional provider interface. `DeterministicProvider` is the default and the only one exercised by tests or the demo.

## Style

Calm enterprise operations console: near-black graphite canvas, warm neutral
foregrounds, one indigo accent. Tabular numerals and right-aligned figures.
Thin borders, modest radii, restrained shadows, minimal motion. Four visual
registers must stay distinguishable: **operational state**, **AI recommendation**,
**human decision**, **supporting evidence**. See `docs/PRD.md` §9 and
`src/app/globals.css` tokens. Do not introduce gradients, glass, glow, sparkle
iconography, or oversized hero cards.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
