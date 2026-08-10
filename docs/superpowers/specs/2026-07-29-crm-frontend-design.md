# CRM v1 Frontend — Design

Date: 2026-07-29
Status: approved
Sources: `spec.md` (scope, source of truth), `design.md` (visual system), `Aidenai methodology.md` (stage content)

---

## 1. Scope

Frontend only. Three screens from spec.md §4: Dashboard, Pipeline Board, Account Explorer.
No backend. Data comes from a seeded in-memory store behind a typed repository module.

**Built:**
- Dashboard — metric strip, high-priority deals, pipeline health, recent activity
- Pipeline Board — Direct/Partner tabs, dynamic stage columns, drag-and-drop
- Account Explorer — Account → Lead → Deal tree with roll-ups and search
- Right-side drawer as the only detail/edit surface
- Excel export per screen

**Not built (deliberate cuts):**
- Settings → Pipelines admin UI (spec §6.3) — out of the agreed three-screen scope
- Exit-criteria gating on stage advancement (spec §6.4)
- Per-rep deal counts (R11)
- Everything in spec §8

## 2. Stack

Vite + React + TypeScript + Tailwind v4.

design.md's `@theme` block is copied verbatim into `src/styles/theme.css` and is the
single source of style truth. No literal hex values in component files.

```
src/
  styles/theme.css          design.md @theme block, verbatim
  types/domain.ts           Account, Lead, Deal, Activity, PipelineTemplate, Stage
  data/fixtures/*.ts        seeded data
  data/repository.ts        typed async data access — the backend swap point
  data/store.tsx            in-memory store + React context, session-scoped
  lib/health.ts             deal health derivation (pure)
  lib/rollup.ts             account/lead roll-up math (pure)
  lib/export.ts             Excel export
  components/ui/            Button, Badge, Card, Drawer, Tabs, Input, Select
  components/layout/        AppShell, TopNav
  components/drawers/       DealDrawer, LeadDrawer, AccountDrawer, ActivityLogForm
  screens/Dashboard/
  screens/Pipeline/
  screens/Accounts/
```

`repository.ts` is the only module aware of where data lives. Replacing it with HTTP
calls is the entire backend integration.

## 3. Domain model

Kept flat per R10.

- `Account` — top-level, name = direct customer name (R1)
- `Lead` — `accountId`, `businessUnit`, `ownerId` (R2)
- `Deal` — `accountId`, optional `leadId`, `pipelineTemplateId`, `stageId`, `value`,
  `currency`, `expectedCloseDate`, `ownerId`, optional `partnerId`.
  Partner-led deals carry both `partnerId` and `accountId` on the same record (R8).
- `Activity` — polymorphic `subjectType: 'account' | 'lead' | 'deal'` + `subjectId`.
  One shape logs against all three levels (R4) without three relationship types.
- `PipelineTemplate` — `name`, `type`, ordered `stages[]`
- `Stage` — `name`, `probability`, `color`, `position`, plus nullable
  `entryCriteria`, `exitCriteria`, `keyActivities`, `deliverables`

Stage criteria fields are **populated from `Aidenai methodology.md` but never rendered
in v1**, per spec §6.2. They exist so the deferred methodology-driven pipeline needs no
schema migration.

Board columns render from the active template's stages. No stage list is hardcoded
anywhere in the UI.

### Seeded pipeline templates

**Direct Customer** — the six real AidenAI stages with their probabilities:

| # | Stage | Probability |
|---|---|---|
| 1 | Prospecting | 5% |
| 2 | Discover & Qualify | 15% |
| 3 | Solution Alignment & Competitive Strategy | 30% |
| 4 | Technical Validation & ROI Diagnostic | 55% |
| 5 | Proposal, Negotiation & Close | 75% |
| 6 | Deploy & Develop | 100% |

**Partner** — Identify → Onboarding → Enabled → Co-Sell Pipeline → Joint Proposal → Closed.
Includes the onboarding stage required by R7.

## 4. Screens

### Dashboard
Action surface, not a report. Metric strip (open pipeline value, advanced-stage count,
closing this week, needs attention), high-priority deals list with health coding,
pipeline health by stage, recent activity feed. Every row opens a drawer.

### Pipeline Board
Direct / Partner tabs (R6). Columns from the active template, each with a count and
probability. Drag-and-drop between columns via `@dnd-kit` — chosen over native HTML5
drag because it is keyboard-accessible. Partner cards show Partner alongside Customer (R8).

### Account Explorer
Expand/collapse tree, Account → Lead → Deal (R3). Each node shows a rolled-up health
badge and open deal value. Search filters across all three levels. Tree expansion state
survives drawer open/close.

## 5. Cross-cutting decisions

**Drawer only.** One `Drawer` primitive, three content components. Never a route change
for detail views, per spec §7.1.

**Health is derived, not stored.** `at risk` if expected close date has passed or no
activity in 21 days; `closing soon` if close date is within 7 days; otherwise `healthy`.
One pure function in `lib/health.ts`.

**Visual density.** design.md is applied literally as directed: 50–80px headings,
24px card radii, 1200px centered max-width, comfortable padding. The board's stage
strip scrolls horizontally inside the 1200px container rather than widening it.
Noted trade-off: six stages inside 1200px yields narrow columns.

**Excel export.** One "Download to Excel" action per screen, exporting the current view
as rendered — respecting the active pipeline tab, search text, and expansion state.
This resolves spec §5's open question by assumption, not by confirmation.

## 6. Testing

Vitest on the pure logic where correctness matters: health derivation, roll-up math,
export row shaping, store mutations. Component render coverage is not a goal.

## 7. Revision — 2026-07-30

Second pass, after the first build was reviewed.

### Stage schema (breaking fix)

`Stage` gained `color`, `kind: 'open' | 'won' | 'lost'`, and `wipLimit`.

`kind` replaces an inference bug: openness was derived from `probability < 100`, which
would have counted a 0% Closed Lost stage as open pipeline the moment the builder let an
admin create one. Both templates now carry a Closed Lost stage, and two fixture deals sit
in one, so the regression is covered by tests rather than by reasoning.

### Pipeline builder (Settings → Pipelines)

Linear stage editor, chosen over a node-graph canvas. A graph's value is enforcing
transitions, and spec §6.4 defers gating — so a graph would cost full modelling effort for
a capability v1 deliberately cuts. The linear model is a strict subset of a graph, so
upgrading later wastes nothing.

Templates moved from fixture constants into the mutable snapshot. Repository gained
`updateTemplate`, `createTemplate`, `duplicateTemplate`, `addStage`, `updateStage`,
`reorderStage`, `deleteStage`, `reassignDeals`.

`deleteStage` refuses while deals occupy the stage and returns the count, so the UI offers
reassign-then-delete (spec §6.3). `reassignDeals` refuses cross-pipeline targets and logs
an activity per moved deal.

### Routing

Hand-written History-API router (`src/app/router.tsx`), not react-router. The app needs
URLs, path params, deep links and back/forward, but has no loaders, actions, or nested
layouts. Every react-router 7.x release carried open high-severity advisories; the ~120
line router has none and covers what is used. `Link` renders a real anchor so
middle-click and copy-link behave normally.

Routes: `/`, `/pipeline`, `/deals`, `/deals/:dealId`, `/accounts`, `/settings/pipelines`.

### Pipeline Board

Three ways to act on a card, because dragging alone did not survive six stages at 1200px:

- **Move-to-stage menu** on every card — one click to any stage, no scrolling, and the
  only path that works without a pointer. This is the fix for the reported problem.
- **Collapsible columns**, plus "collapse empty" — pulls two distant stages adjacent.
- Drag retained for short moves.

Board width stayed at 1200px per the standing decision to apply design.md literally; the
stage strip still scrolls inside it.

### Deal pages

- `/deals/:dealId` — full view: stage rail (click to move), editable details, context,
  full activity history.
- `/deals` — consolidated index: sortable table of every deal across both pipelines,
  filters for pipeline/status/stage/open-only, and a proportional per-pipeline overview
  bar that doubles as a stage filter.
- The drawer **stays** the quick-edit surface (spec §7.1) and gained an "Open full view"
  link. Navigation was added alongside the drawer, not in place of it.

### Methodology playbook

The `entryCriteria` / `exitCriteria` / `keyActivities` / `deliverables` content is now
shown on the deal page as a **read-only, collapsed-by-default** stage playbook. This
revises §6.2's stored-not-surfaced stance: the data was already seeded and invisible, and
a rep reviewing a deal benefits from seeing what the stage asks for. Nothing is enforced,
so §6.4's deferral of gating still holds.

## 8. Open items inherited from spec.md

- Deal field list beyond those seeded — confirm before backend build
- Partner-becomes-customer handling: new Account vs. flag on existing record
- Excel export scope: assumed current-view, awaiting confirmation
