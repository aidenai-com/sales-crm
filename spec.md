# Enterprise Sales CRM — Product Spec (v1)

Reconciles: `CRM_Business_Requirements_v0_1` (BRD, source of truth for scope/priority),
`Application Vision` doc (UX philosophy), and `AidenAI Sales Process Steps` deck
(reference sales methodology, informs schema but not v1 enforcement).

---

## 1. Objective

Replace Excel-based deal tracking with a simple internal CRM that gives:
- A clear pipeline view (deal counts by stage, visibility into advanced-stage deals)
- Coverage of both Direct Customer and Partner motions
- Activity logging against accounts, leads, and deals

**Explicit constraint (BRD R10):** keep the underlying model simple. This is not
a Salesforce competitor. Where the Vision doc's UX ambition and the BRD's "simple
database" instruction could conflict, BRD scope wins; Vision doc governs *how*
the in-scope features feel, not how many features exist.

---

## 2. Data Hierarchy

Three levels, top-down, drill-down/drop-down navigation (not flat tables):

| Level | Definition | Example |
|---|---|---|
| Account | Top-level entity. Direct customer's name. | Bank of America, JPMC |
| Lead | Sits under an account. One account → multiple leads, each distinguished by business unit/function, each with an owner. | BofA – Wealth & Asset Management; BofA – Compliance |
| Deal | Opportunity tracked through pipeline stages, rolls up to account. | AI Modernization, Fraud Detection |

---

## 3. Requirements (from BRD, priority preserved)

| ID | Requirement | Priority |
|---|---|---|
| R1 | Account is top-level record; account name = direct customer name | Must have |
| R2 | Account supports multiple leads, each tied to business unit/function + owner | Must have |
| R3 | Hierarchical drill-down view: account → leads → deals | Must have |
| R4 | Activity logging against account, lead, or deal | Must have |
| R5 | Pipeline view: deal counts by stage, clear visibility of advanced-stage deals | Must have |
| R6 | Two separate pipelines: Direct Customer and Partner, each with own stages | Must have |
| R7 | Partner pipeline includes onboarding stage; post-onboarding partner enters GTM motion | Must have |
| R8 | Partner-led deals carry both Partner field and Customer field on same record | Must have |
| R9 | Any view downloadable to Excel | Must have |
| R10 | Keep underlying model simple; avoid over-engineering entity relationships | Constraint |
| R11 | Deal counts per person/rep | Later phase (explicitly deprioritized) |

**Open questions, still unresolved — confirm before backend build:**
- Exact Direct Customer pipeline stage names (BRD references a "stages of deal pipeline" doc shared separately)
- Deal fields beyond stage/owner: value, currency, expected close date — confirm full list
- When a partner becomes a customer: new Account record, or flag existing partner record?
- Excel export: full data export or current filtered view only?

---

## 4. Scope — Three Core Screens (V1)

### 4.1 Dashboard
**Purpose:** action surface, not a reporting surface. Answers: what needs attention,
what changed, what's closing soon.

Sections:
- Summary metric strip (open pipeline value, advanced-stage count, closing-this-week count, needs-attention count)
- High priority deals list — status-coded (healthy / closing soon / at risk), click → right-side drawer
- Pipeline health — count per stage, current pipeline
- Recent activity feed
- My accounts (deferred to post-v1 polish if time-constrained; not a Must-have)

Every row/card is interactive — click opens a drawer, never a page navigation (per Vision doc's context-preservation principle).

### 4.2 Pipeline Board
**Purpose:** operational workspace, primary daily surface.

- **Pipeline switcher** (tabs): Direct Customer / Partner — satisfies R6. Board columns render dynamically from whichever Pipeline Template is active (see Section 6).
- Columns = stages of active template, each showing count.
- Deal card shows: customer, opportunity name, value, owner, health/status badge.
  - **Partner pipeline deal cards additionally show a Partner field alongside Customer** (R8).
- v1 interaction: drag-and-drop between columns, click card → drawer for quick edit.
- Filtering, search, and saved views: nice-to-have, not gating v1 ship.
- **Explicitly deferred:** exit-criteria gating on stage advancement (see Section 6.4).

### 4.3 Account Explorer
**Purpose:** replaces flat tables. Primary navigation is hierarchical, not tabular.

- Tree: Account → Lead → Deal, expand/collapse per node (R3).
- Each level shows a rolled-up health/status badge and open deal value.
- Search across accounts/leads/deals from the same view.
- Favorites / recently viewed: nice-to-have.
- Click any node → drawer for inline edit without losing tree state (context preservation).

### 4.4 Interaction Model (applies across all three screens)
Preferred: `Dashboard/Board/Explorer → click record → right-side drawer → edit → save → continue in place.`
Avoid: full navigation away from the workspace and back.

### 4.5 Navigation
Flat top-level nav only: Dashboard, Pipeline, Accounts, Search. No deep nesting.

---

## 5. Excel Export (R9)
Every list/board/tree view needs a "Download to Excel" action. Resolve open question
(full export vs. filtered view) before backend implementation — affects whether export
respects active filters/search state.

---

## 6. Pipeline Customization (new capability)

### 6.1 Why
BRD already requires two distinct pipelines (R6, R7) with different stages. The
AidenAI deck demonstrates a third possible pipeline shape — a methodology-driven
pipeline with per-stage probability, entry criteria, key activities, and deliverables,
not just a stage name. Rather than hardcode stage lists, the system defines pipelines
as data so new pipeline types can be added without a schema change or redesign.

### 6.2 Model
- **Pipeline Template**: name, type (Direct Customer / Partner / extensible), ordered list of Stages.
- **Stage**: name, probability %, color, position/order.
  - Additional **optional, nullable** fields on Stage for forward-compatibility with
    methodology-driven pipelines: `entry_criteria`, `exit_criteria`, `key_activities`,
    `deliverables` (text or JSON). **Not surfaced or enforced in v1 UI** — stored only
    so a future methodology-driven pipeline (e.g. modeled on the AidenAI 6-stage process)
    doesn't require a schema migration.
- **Deal**: belongs to exactly one Pipeline Template, sits in exactly one Stage.

### 6.3 Admin capabilities (admin-only — not end-user configurable in v1)
- Settings → Pipelines: list templates, each showing ordered stages.
- Add / rename / reorder / delete stage.
  - Deleting a stage with deals in it requires reassigning those deals first — no silent orphaning.
- Set probability % per stage.
- Duplicate a template (basis for adding a new pipeline type later).

### 6.4 v1 stage advancement
**Simple drag-and-drop / manual move.** No checklist or exit-criteria gating in v1,
even though the schema has room for it. This is a deliberate scope cut — the AidenAI
methodology ("stage advancement is earned by exit criteria, not by calendar time")
is a strong candidate for a later phase, not v1.

### 6.5 Explicitly deferred
- Exit-criteria gating before stage advancement
- Per-stage activities/deliverables checklists in rep-facing UI
- Per-user or per-view pipeline customization (end users cannot edit templates)

---

## 7. Design Principles (from Vision doc, govern feel of in-scope features only)
1. Never lose context — drawers/panels over navigation.
2. Prioritize workflow over feature count.
3. Information before decoration.
4. Progressive disclosure — reveal detail only when relevant.
5. Keyboard-first where practical (not gating v1).
6. Every component solves one problem.
7. Optimize for users spending 8 hours/day in the app — density matters, but density is not an excuse to add scope beyond Section 4.

---

## 8. Explicitly Out of Scope for V1
- Per-person/rep deal count breakdowns (R11 — later phase)
- Automation, forecasting, integrations, AI scoring
- Contacts, Activities-as-a-module, Tasks, Notes-as-a-module, Attachments, Calendar/Email integration, AI Insights, Forecasting, Reports (Vision doc's "Future Modules" list — architecture should not preclude these, but none are built now)
- Checklist-gated stage advancement
- End-user pipeline customization

---

## 9. Success Criteria
- Users understand the product with minimal training.
- Dashboard prioritizes work rather than displaying vanity metrics.
- Pipeline Board is the primary daily workspace for managing opportunities.
- Account Explorer is a genuine improvement over flat tables for navigating hierarchy.
- Users rarely lose context completing a task (drawer pattern holds up in practice).
- Common workflows (move a deal, log an activity, drill into an account) take only a few interactions.
- Adding a new pipeline type or stage does not require a redesign or schema migration.