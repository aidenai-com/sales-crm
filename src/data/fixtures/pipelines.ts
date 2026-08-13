import type { Deliverable, PipelineTemplate, Stage, StageKind } from '@/types/domain'

/**
 * Two seeded pipeline templates, satisfying R6 (two separate pipelines, each with its
 * own stages) and R7 (the partner pipeline includes an onboarding stage).
 *
 * The Direct Customer template is the real AidenAI six-stage process, transcribed from
 * `Aidenai methodology.md` including probabilities. Each template also carries a
 * Closed Lost stage — the builder lets admins add these, and they are the reason
 * `Stage.kind` exists rather than inferring status from probability.
 *
 * Deliverables are written here as plain strings and normalised into `Deliverable` rows on
 * export. They became identified rows when they became checkable — see `types/domain.ts` —
 * but the seed content is prose, and prose reads better as a list of sentences than as a
 * list of objects each repeating an id nobody wrote by hand.
 */

/** Mist grey through to deep cobalt, so a board reads as a progression left to right. */
const RAMP = ['#a6bbd1', '#7ba7d0', '#4a90e2', '#0099ff', '#006bff', '#004eba'] as const
const LOST_COLOR = '#c8324f'

/** Stages with no methodology content yet; the builder is where an admin fills these in. */
function plainStage(
  id: string,
  name: string,
  shortName: string,
  probability: number,
  position: number,
  color: string,
  kind: StageKind = 'open',
): Stage {
  return {
    id,
    name,
    shortName,
    probability,
    color,
    kind,
    position,
    wipLimit: null,
    expectedDays: kind === 'open' ? 21 : null,
    championRequired: false,
    isChampionGate: false,
    entryCriteria: null,
    exitCriteria: null,
    keyActivities: null,
    deliverables: [],
  }
}

/**
 * The seed shape, before deliverables are given ids. `plainStage` already returns real
 * `Deliverable[]`, so both spellings are accepted here and `withDeliverableIds` settles it.
 */
type RawStage = Omit<Stage, 'deliverables'> & {
  deliverables?: string[] | Deliverable[] | null
}
type RawPipeline = Omit<PipelineTemplate, 'stages'> & { stages: RawStage[] }

/**
 * Deterministic ids, derived from the stage and the position: `stage-d1-deliv-2`.
 *
 * Deterministic rather than random because the seeded store is recreated on every reload,
 * and a checkmark recorded against a random id would point at nothing the next time the page
 * was opened.
 */
function withDeliverableIds(stage: RawStage): Stage {
  const raw = stage.deliverables ?? []
  return {
    ...stage,
    deliverables: raw.map((entry, index) =>
      typeof entry === 'string'
        ? { id: `${stage.id}-deliv-${index + 1}`, text: entry, position: index + 1 }
        : entry,
    ),
  }
}

const seededPipelines: RawPipeline[] = [
  {
    id: 'pipe-direct',
    name: 'AidenAI Direct',
    championGatePosition: 2,
    stages: [
      {
        id: 'stage-d1',
        name: 'Prospecting',
        shortName: 'Prospecting',
        probability: 5,
        color: RAMP[0],
        kind: 'open',
        position: 1,
        wipLimit: null,
        expectedDays: 21,
        championRequired: false,
        isChampionGate: false,
        entryCriteria: [
          'Fits a personalized ICP vertical',
          'Identifiable pain and trigger signal present',
          'Reachable decision-maker mapped',
          'Budget cycle known or estimable',
          'Account logged in CRM with ICP score',
        ],
        keyActivities: [
          'Build ICP scorecard: legacy scale, transformation mandate, tech debt, AI maturity',
          'Map each account to a motion: modernization / AI agents / AI Centre of Innovation',
          'Research objectives, board strategy, investor-day AI commitments',
          'Identify partner paths for warm intros',
          'Map three personas: CXO, Arch VP, Eng Director',
          'Prioritize 15 Tier-1 direct and 30 Tier-2 partner-assisted accounts',
        ],
        deliverables: [
          'Territory Account Map, tiered with fit score and primary motion',
          'Account Profile one-pager',
          'Outreach Hypothesis per account',
        ],
        exitCriteria: [
          'Partner co-sell path flagged',
          'ICP applicability confirmed, not assumed',
          'Territory plan approved in CRM',
          'Outreach hypothesis written per Tier-1 account',
          'At least one engagement signal received',
        ],
      },
      {
        id: 'stage-d2',
        name: 'Discover & Qualify',
        shortName: 'Qualify',
        probability: 15,
        color: RAMP[1],
        kind: 'open',
        position: 2,
        wipLimit: null,
        expectedDays: 21,
        championRequired: false,
        isChampionGate: false,
        entryCriteria: [
          'First meeting secured with Director+ in tech / digital transformation',
          'Stage-1 hypothesis validated by internal contact or partner intro',
          'No active NDA block or competitive exclusion',
          'Account research done, AE can speak to initiatives pre-call',
        ],
        keyActivities: [
          'Run the 30-question discovery framework, woven into conversation',
          'Map stated objectives to AidenAI initiative areas before any product talk',
          "Capture as-is state in the customer's own words",
          'Surface unrecognized pain with the 40-60% delivery benchmark',
          'Build stakeholder map: budget owner, evaluator, internal champion',
          'Begin MEDDIC: confirm Metrics and Identified Pain',
          'Funding test: find the funded initiative',
          'Identify the coach',
        ],
        deliverables: [
          'Discovery Notes, verbatim exec pain captured in CRM',
          'Qualification Scorecard with MEDDIC M, I, P populated',
          'Stakeholder Map v1',
          'Go/No-Go recommendation with deal-size range',
        ],
        exitCriteria: [
          'Exec sponsor confirmed (VP+) with an initiative AidenAI directly addresses',
          "Pain documented in the prospect's own words in CRM",
          'MEDDIC M, I, P populated; Economic Buyer partial',
          'Budget pathway confirmed',
          'Prospect committed to a next step',
        ],
      },
      {
        id: 'stage-d3',
        name: 'Solution Alignment & Competitive Strategy',
        shortName: 'Develop',
        probability: 30,
        color: RAMP[2],
        kind: 'open',
        position: 3,
        wipLimit: null,
        expectedDays: 21,
        championRequired: false,
        isChampionGate: false,
        entryCriteria: [
          'Stage-2 exit met: funded pain, exec sponsor named, budget pathway',
          'Champion identified and tested',
          'Competitive landscape known',
          'Solutions Architect assigned and briefed',
        ],
        keyActivities: [
          'Deliver an executive briefing, not a demo',
          "Build a unique value proposition in the prospect's own language",
          'Introduce AiDAP 2.0 with named proof points',
          'Set a competitive strategy per competitor: Direct / Divide / Develop / Defend',
          'Run a buying-criteria campaign before any RFP',
          'Champion validation via an exec intro or org chart ask',
          'Begin Technical Validation Exercise planning',
        ],
        deliverables: [
          'Unique Value Proposition doc',
          'Competitive Strategy memo',
          'Champion Development Plan',
          'TVE Plan draft',
          'Mutual Action Plan v1',
        ],
        exitCriteria: [
          'Value proposition accepted in writing by Economic Buyer',
          'AidenAI strengths embedded in evaluation criteria pre-RFP',
          'Full MEDDIC populated',
          'Champion confirmed by an action test',
          'TVE scope agreed in writing, start date confirmed',
          'No competitor has exclusive Economic Buyer access',
        ],
      },
      {
        id: 'stage-d4',
        name: 'Technical Validation & ROI Diagnostic',
        shortName: 'Validate',
        probability: 55,
        color: RAMP[3],
        kind: 'open',
        position: 4,
        wipLimit: null,
        expectedDays: 21,
        championRequired: false,
        isChampionGate: false,
        entryCriteria: [
          'TVE Plan approved and signed by both teams',
          'Delivery team assigned, briefed, available',
          'POC success metrics documented and mutually agreed before work starts',
          'Economic Buyer aligned on post-POC decision timeline',
        ],
        keyActivities: [
          "Run the POC on the prospect's real codebase via AiDAP 2.0",
          "Document before/after state in the customer's own metrics",
          'Build ROI in parallel: hard savings plus soft value',
          'Produce three ROI scenarios: conservative, realistic, aggressive',
          'Escalate any uninfluenced RFP to the Economic Buyer',
          'Get formal technical sign-off from Director / VP Architecture',
          'Preview deployment phases',
        ],
        deliverables: [
          'POC Results Report with green/amber/red scorecard',
          'ROI Diagnostic, three-scenario model',
          'Technical Validation Summary in business language',
          'Preliminary Deployment Plan, Phase 1-3',
          'Competitive Differentiation Summary',
        ],
        exitCriteria: [
          'POC declared successful by the technical buyer in writing',
          'ROI ranges presented and accepted by Economic Buyer',
          'No open technical, security, compliance, or architecture blockers',
          'Decision timeline and target close date mutually agreed',
          'AidenAI named preferred vendor or final-two shortlist',
        ],
      },
      {
        id: 'stage-d5',
        name: 'Proposal, Negotiation & Close',
        shortName: 'Propose',
        probability: 75,
        color: RAMP[4],
        kind: 'open',
        position: 5,
        wipLimit: null,
        expectedDays: 21,
        championRequired: false,
        isChampionGate: false,
        entryCriteria: [
          'Stage-4 exit met: POC success, ROI accepted, preferred status',
          'Full decision process mapped',
          'Funding confirmed this cycle or committed next quarter',
          'Champion driving urgency and sharing intel',
        ],
        keyActivities: [
          'Build a three-option proposal: land, expand, full environment',
          "Always show the full-environment scenario ahead of procurement's ask",
          'Anchor every commercial conversation on accepted ROI',
          'Never negotiate terms before scope is locked',
          'Build the "why now" case',
          'Equip the champion with a talk track and one-page ROI summary',
          'Work procurement and legal in parallel',
          'Pair every concession with a reciprocal commitment',
          'Confirm Customer Success handoff before signature',
        ],
        deliverables: [
          'Formal Proposal with three options and ROI for each',
          'Executive Summary one-pager for the champion',
          'Negotiation Log',
          'Signed MSA and SOW, or written commitment to sign by a date',
          'Kickoff Readiness Checklist',
        ],
        exitCriteria: [
          'Signed contract or purchase order received',
          'Kickoff date confirmed on both calendars',
          'Phase-1 success metrics documented in the signed SOW',
          'Sponsor introduced to Customer Success and Delivery lead',
          'Reference and case-study rights secured in the contract',
        ],
      },
      {
        id: 'stage-d6',
        name: 'Deploy & Develop',
        shortName: 'Closed Won',
        probability: 100,
        color: RAMP[5],
        kind: 'won',
        position: 6,
        wipLimit: null,
        expectedDays: 21,
        championRequired: false,
        isChampionGate: false,
        entryCriteria: [
          'Closed-won: signed contract, kickoff date in calendar',
          'Delivery team assigned; Customer Success lead introduced to exec sponsor',
          'Phase-1 success metrics documented and agreed in the SOW',
        ],
        keyActivities: [
          'Exec check-ins at Day 30 and Day 60',
          "Document Phase-1 outcomes in the customer's own metrics",
          'Identify Phase-2 expansion: adjacent business unit, use case, or geography',
          'Start Phase-2 discovery at Phase-1 kickoff, not at completion',
          'Develop a new champion for expansion',
          'Flag renewal risks: budget, leadership change, competitor re-entry',
          'Leverage success for analyst and media coverage',
          'Build a referral path',
        ],
        deliverables: [
          'Phase-1 Success Report',
          'Expansion Account Plan',
          'Renewal Forecast in CRM with risk score',
          'Customer Reference Agreement',
          'Internal Case Study',
        ],
        exitCriteria: [
          'Phase-1 metrics achieved and documented with customer sign-off',
          'Phase-2 opportunity qualified to Stage 2+ and logged in CRM pipeline',
          'Renewal committed, or active 90 days before expiry',
          'Customer willing to act as a reference',
          'Account Net Revenue Retention on track to 115% or higher',
        ],
      },
      plainStage('stage-d7', 'Closed Lost', 'Closed Lost', 0, 7, LOST_COLOR, 'lost'),
    ],
  },
  {
    id: 'pipe-partner',
    name: 'Partner Co-Sell',
    championGatePosition: 2,
    stages: [
      plainStage('stage-p1', 'Identify', 'Identify', 5, 1, RAMP[0]),
      // R7: the partner pipeline includes an onboarding stage. Post-onboarding, the
      // partner enters the GTM motion represented by the Co-Sell stage onward.
      plainStage('stage-p2', 'Onboarding', 'Onboarding', 15, 2, RAMP[1]),
      plainStage('stage-p3', 'Enabled', 'Enabled', 30, 3, RAMP[2]),
      plainStage('stage-p4', 'Co-Sell Pipeline', 'Co-Sell', 50, 4, RAMP[3]),
      plainStage('stage-p5', 'Joint Proposal', 'Joint Proposal', 75, 5, RAMP[4]),
      plainStage('stage-p6', 'Closed Won', 'Closed Won', 100, 6, RAMP[5], 'won'),
      plainStage('stage-p7', 'Closed Lost', 'Closed Lost', 0, 7, LOST_COLOR, 'lost'),
    ],
  },
]

export const pipelines: PipelineTemplate[] = seededPipelines.map((pipeline) => ({
  ...pipeline,
  stages: pipeline.stages.map(withDeliverableIds),
}))
