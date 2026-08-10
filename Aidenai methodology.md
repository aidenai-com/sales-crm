# AidenAI Sales Process — Methodology Reference

Extracted in full from `AidenAI_Sales_Process_Steps.pptx`. This is the source-of-truth
detail behind the `entry_criteria` / `exit_criteria` / `key_activities` / `deliverables`
schema fields described in `PRODUCT_SPEC.md` Section 6.2. Those fields are stored but
**not enforced or surfaced in v1 UI** — this file exists so the full methodology content
survives independently of the original deck, for whenever the deferred
"methodology-driven pipeline" phase gets built.

Stage advancement in the source methodology is **earned by exit criteria, not calendar
time** — noted here for completeness; v1 explicitly does not enforce this (see spec
Section 6.4).

---

## Stage 01 — Prospecting
**Tag:** Foundation · Pre-pipeline · Probability 5% · Identify

**Entry criteria (start):**
- Fits a personalized ICP vertical — vertical applicability to at least one AidenAI product confirmed before outreach
- Identifiable pain and trigger signal present — a specific business problem, regulatory pressure, operational gap, or strategic initiative a product in the portfolio can plausibly address
- Reachable decision-maker mapped — at least one relevant exec or budget-holder identified (CXO, VP, Director level), confirmed via LinkedIn, referral, or partner network
- Budget cycle known or estimable — active planning cycle, known programme, or funding/growth event signaling spend authority is accessible
- Account logged in CRM with ICP score

**Key activities:**
- Build ICP scorecard: legacy scale, transformation mandate, tech debt, AI maturity, competitive pressure
- Map each account to a motion: modernization / AI agents / AI Centre of Innovation
- Research objectives, board strategy, investor-day AI commitments, annual report
- Identify partner paths (Accenture, Deloitte, NTT, HCL, Virtusa) for warm intros
- Map three personas: CXO (business), Arch VP (technical), Eng Director (features)
- Prioritize 15 Tier-1 (direct) + 30 Tier-2 (partner-assisted) accounts

**Deliverables:**
- Territory Account Map — tiered with fit score and primary motion
- Account Profile one-pager — objectives, stack, personas, partners, deal size
- Outreach Hypothesis per account — initiative → capability → outcome

**Exit criteria (advance):**
- Partner co-sell path flagged — named SI or channel partner contact logged for partner-assisted accounts before advancing to Stage 2
- ICP applicability confirmed, not assumed — rep has validated vertical fit and a specific pain signal; firmographic match alone is not sufficient
- Territory plan approved in CRM — at least 15 Tier-1 accounts scored, tiered, assigned, with product motion and fit rationale logged
- Outreach hypothesis written per Tier-1 account
- At least one engagement signal received — email reply, LinkedIn response, or meeting acceptance

---

## Stage 02 — Discover & Qualify
**Tag:** Q1: Why do anything? · Probability 15% · Qualify

**Entry criteria (start):**
- First meeting secured with Director+ in tech / digital transformation
- Stage-1 hypothesis validated by internal contact or partner intro
- No active NDA block or competitive exclusion
- Account research done — AE can speak to initiatives pre-call

**Key activities:**
- Run the 30-question discovery framework — woven into conversation, never read as a list
- Map stated objectives to AidenAI initiative areas before any product talk
- Capture as-is state in the customer's own words: maintenance cost, FTE burden, failed attempts, tech-debt percentage
- Surface unrecognized pain: show 10x velocity / 40–60% delivery benchmark
- Build stakeholder map: budget owner, evaluator, internal champion
- Begin MEDDIC: confirm Metrics + Identified Pain; identify Economic Buyer + Champion
- Funding test: "no budget" means no line item, not no money — find the funded initiative
- Identify the coach: who is most energized and forthcoming with intel?

**Deliverables:**
- Discovery Notes — verbatim exec pain captured in CRM, in their words, not marketing language
- Qualification Scorecard — MEDDIC M, I, P populated at minimum to advance
- Stakeholder Map v1 — Economic Buyer targeted, champions named, at least one coach confirmed
- Go/No-Go recommendation with rationale and deal-size range

**Exit criteria (advance):**
- Exec sponsor confirmed (VP+) with an initiative AidenAI directly addresses
- Pain documented in the prospect's own words in CRM
- MEDDIC M, I, P populated; Economic Buyer partial; Decision process and Champion in progress
- Budget pathway confirmed — transformation budget, AI CAPEX, or board program
- Prospect committed to a next step — briefing, architecture session, or workshop

---

## Stage 03 — Solution Alignment & Competitive Strategy
**Tag:** Q2: Why AidenAI? · Probability 30% · Develop

**Entry criteria (start):**
- Stage-2 exit met: funded pain, exec sponsor named, budget pathway
- Champion identified and tested — has taken at least one internal action for the seller
- Competitive landscape known — incumbent, build bias, competing priorities
- AidenAI Solutions Architect / Solutions Engineer assigned and briefed

**Key activities:**
- Deliver an executive briefing: their language → capability → quantified outcome, not a demo
- Build a unique value proposition anchored in the prospect's own language, objectives, initiatives
- Introduce AiDAP 2.0 with named proof points: 40–60% acceleration, 10x velocity
- Set a competitive strategy per competitor: Direct / Divide / Develop / Defend
- Run a buying-criteria campaign — shape the definition of a "great AI builder" before any RFP
- Champion validation: ask for an exec intro or org chart to test whether the champion delivers
- Lay competitive traps: embed differentiators into the prospect's evaluation criteria
- Begin Technical Validation Exercise (TVE) planning: POC scope, success criteria, resources, timeline, mutual commitment

**Deliverables:**
- Unique Value Proposition doc — initiative → capability → quantified outcome, one page, prospect's language
- Competitive Strategy memo — chosen play per competitor with rationale
- Champion Development Plan — commitments, next ask, escalation path
- TVE Plan draft — scope, criteria, timeline, both-side resources, go/no-go gates
- Mutual Action Plan v1 — steps, owners, dates, signed by AE and champion

**Exit criteria (advance):**
- Value proposition accepted in writing by Economic Buyer / sponsor
- AidenAI strengths embedded in evaluation criteria pre-RFP
- Full MEDDIC populated — all six elements with named individuals or status
- Champion confirmed by an action test — unprompted internal action taken
- TVE scope agreed in writing, start date confirmed
- No competitor has exclusive Economic Buyer / decision-maker access

---

## Stage 04 — Technical Validation & ROI Diagnostic
**Tag:** Q2 → Q3 Bridge · Probability 55% · Validate

**Entry criteria (start):**
- TVE Plan approved and signed by both teams
- AidenAI delivery team (SA / SE / lead) assigned, briefed, available
- POC success metrics documented and mutually agreed before work starts
- Economic Buyer aware of POC investment and aligned on post-POC decision timeline

**Key activities:**
- Run the POC on the prospect's real codebase via AiDAP 2.0 — no synthetic demos
- Document before/after state in the customer's own metrics: story points, deploy time, FTE hours, defects
- Build ROI in parallel: hard savings (FTE, infrastructure, maintenance) plus soft value
- Produce three ROI scenarios: conservative, realistic, aggressive
- Set competitive traps: embed criteria into the summary that competitors can't match
- RFP rule: if an uninfluenced RFP arrives, escalate to the Economic Buyer; compete or disqualify
- Get formal technical sign-off from Director / VP Architecture (a gate, not optional)
- Preview deployment: Phase-1 landing, Phase-2 expansion, full-environment ROI

**Deliverables:**
- POC Results Report — green/amber/red scorecard, narrative, metrics versus baseline
- ROI Diagnostic — three-scenario model, hard/soft breakout, payback period
- Technical Validation Summary in business language, for the Economic Buyer
- Preliminary Deployment Plan — Phase 1–3 scope, investment, timeline, KPIs
- Competitive Differentiation Summary — where rivals can't match, Economic-Buyer-ready

**Exit criteria (advance):**
- POC declared successful by the technical buyer in writing
- ROI ranges presented and accepted by Economic Buyer / finance reviewer
- No open technical, security, compliance, or architecture blockers
- Decision timeline and target close date mutually agreed
- AidenAI named preferred vendor or final-two shortlist

---

## Stage 05 — Proposal, Negotiation & Close
**Tag:** Q3: Why now? · 75% Propose → 90% Commit · Probability 75% · Propose

**Entry criteria (start):**
- Stage-4 exit met: POC success, ROI accepted, preferred or final-two status
- Full decision process mapped: approvers, procurement, legal, signature authority
- Funding confirmed this cycle or committed next quarter
- Champion driving urgency and sharing intel on priorities and blockers

**Key activities:**
- Build a three-option proposal: Phase-1 land, Phase-2 expand, full environment, with ROI at each
- Always show the full-environment scenario to get ahead of procurement's ask
- Anchor every commercial conversation on accepted ROI (current cost → future cost; cost of delay per month)
- Never negotiate terms before scope is locked — scope creep kills the economics
- Build the "why now" case: competitor AI launch, board deadline, expiring contract, compliance date
- Equip the champion with a talk track and a one-page ROI summary to run approvals solo
- Work procurement and legal in parallel: security, MSA, SOW, DPA
- Pair every concession with a reciprocal commitment — timeline, scope, reference, or term
- Confirm Phase-1 success criteria and Customer Success handoff before signature

**Deliverables:**
- Formal Proposal — three options (land / expand / full) with pricing and ROI for each
- Executive Summary one-pager for the champion — ROI, urgency, risk of inaction, credentials
- Negotiation Log — concessions, reciprocal commitments, structure rationale
- Signed MSA and SOW, or written commitment to sign by a date
- Kickoff Readiness Checklist — Customer Success lead, delivery briefed, sponsor intros scheduled

**Exit criteria (advance):**
- Signed contract or purchase order received
- Kickoff date confirmed on both calendars
- Phase-1 success metrics documented in the signed SOW
- Sponsor introduced to AidenAI Customer Success and Delivery lead
- Reference and case-study rights secured in the contract (Everest, HFS)

---

## Stage 06 — Deploy & Develop (Land, Expand, Renew)
**Tag:** Post-sale growth · Probability 100% · Closed Won

**Entry criteria (start):**
- Closed-won: signed contract, kickoff date in calendar
- Delivery team assigned; Customer Success lead introduced to exec sponsor
- Phase-1 success metrics documented and agreed in the SOW

**Key activities:**
- Exec check-ins at Day 30 and Day 60 — metrics on track, escalation path clear
- Document Phase-1 outcomes in the customer's own metrics to build the Phase-2 case
- Identify Phase-2 expansion: adjacent business unit, use case, or geography
- Expand principle: Phase-2 discovery starts at Phase-1 kickoff, not at completion
- Develop a new champion for expansion — the Phase-1 champion may not own Phase-2 budget
- Protect the base: flag renewal risks — budget, leadership change, competitor re-entry
- Leverage success for analyst and media coverage — Everest, HFS, Gartner case studies
- Build a referral path — which peer organization faces the same challenge?

**Deliverables:**
- Phase-1 Success Report — before/after, ROI actuals versus forecast, executive narrative
- Expansion Account Plan — Phase 2–3 scope, budget path, new champion, timeline
- Renewal Forecast in CRM — with risk score and mitigation
- Customer Reference Agreement — signed, ready for analyst relations
- Internal Case Study — submitted to marketing (Everest, HFS, enablement)

**Exit criteria (advance / renewal cycle):**
- Phase-1 metrics achieved and documented with customer sign-off
- Phase-2 opportunity qualified to Stage 2+ and logged in CRM pipeline
- Renewal committed, or active 90 days before expiry
- Customer willing to act as a reference
- Account Net Revenue Retention on track to 115% or higher