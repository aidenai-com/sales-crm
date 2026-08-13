import type { Activity, Deal, Id, PipelineTemplate, Snapshot, Stage } from '@/types/domain'
import { pipelines } from './fixtures/pipelines'
import { accounts, activities, deals, leads, people } from './fixtures/records'

/**
 * NO LONGER WIRED TO THE APP.
 *
 * The store now talks to the FastAPI backend through `src/api/`. This module survives as
 * test scaffolding: the pure-logic suites (health derivation, roll-ups, export shaping)
 * need a deterministic snapshot to run against, and this provides one without a database.
 *
 * Its own tests (`repository.test.ts`, `pipelines.test.ts`) now describe behaviour that
 * lives in Python — `app/services/pipelines.py` and `app/services/health.py`. They still
 * document the intended rules, but the authoritative implementation is server-side and
 * needs its own pytest coverage.
 */

let snapshot: Snapshot = seed()

function seed(): Snapshot {
  return {
    people: [...people],
    accounts: [...accounts],
    leads: [...leads],
<<<<<<< Updated upstream
=======
    // The seeded repository has no contacts or roles. It backs the fixture-driven tests, which
    // predate both and assert nothing about them; an empty list is the honest starting state.
    contacts: [],
    contactRoles: [],
    // Likewise no champion gaps: the gate needs deal contacts, and this fixture has none.
    championGaps: [],
>>>>>>> Stashed changes
    deals: deals.map((d) => ({ ...d })),
    activities: activities.map((a) => ({ ...a })),
    // Deep-copied: templates are editable now, so the fixture must not be mutated.
    pipelines: pipelines.map((p) => ({ ...p, stages: p.stages.map((s) => ({ ...s })) })),
  }
}

let nextId = 1000
function newId(prefix: string): Id {
  nextId += 1
  return `${prefix}-${nextId}`
}

export function getSnapshot(): Snapshot {
  return snapshot
}

/** Test seam: restores fixture state. */
export function resetSnapshot(): void {
  snapshot = seed()
  nextId = 1000
}

export interface MoveDealResult {
  moved: boolean
}

/**
 * Moves a deal to a new stage and logs the change as an activity.
 *
 * v1 advancement is a plain manual move — no exit-criteria gating, per spec 6.4, even
 * though the stage records carry the criteria.
 */
export function moveDealToStage(dealId: Id, stageId: Id): MoveDealResult {
  const deal = snapshot.deals.find((d) => d.id === dealId)
  if (!deal || deal.stageId === stageId) return { moved: false }

  const stage = snapshot.pipelines
    .flatMap((p) => p.stages)
    .find((s) => s.id === stageId)
  if (!stage) return { moved: false }

  // A deal belongs to exactly one pipeline template; refuse cross-pipeline moves.
  const owningPipeline = snapshot.pipelines.find((p) => p.stages.some((s) => s.id === stageId))
  if (!owningPipeline || owningPipeline.id !== deal.pipelineTemplateId) return { moved: false }

  snapshot = {
    ...snapshot,
    deals: snapshot.deals.map((d) => (d.id === dealId ? { ...d, stageId } : d)),
    activities: [
      {
        id: newId('act'),
        subjectType: 'deal',
        subjectId: dealId,
        kind: 'stage-change',
        summary: `Moved to ${stage.name}.`,
        authorId: deal.ownerId,
        occurredAt: new Date().toISOString(),
      },
      ...snapshot.activities,
    ],
  }
  return { moved: true }
}

export type DealPatch = Partial<
  Pick<Deal, 'name' | 'value' | 'currency' | 'expectedCloseDate' | 'ownerId' | 'stageId' | 'partnerId' | 'leadId'>
>

export function updateDeal(dealId: Id, patch: DealPatch): void {
  snapshot = {
    ...snapshot,
    deals: snapshot.deals.map((d) => (d.id === dealId ? { ...d, ...patch } : d)),
  }
}

export function updateAccount(accountId: Id, patch: Partial<Pick<Snapshot['accounts'][number], 'name' | 'industry' | 'ownerId'>>): void {
  snapshot = {
    ...snapshot,
    accounts: snapshot.accounts.map((a) => (a.id === accountId ? { ...a, ...patch } : a)),
  }
}

export function updateLead(leadId: Id, patch: Partial<Pick<Snapshot['leads'][number], 'businessUnit' | 'ownerId'>>): void {
  snapshot = {
    ...snapshot,
    leads: snapshot.leads.map((l) => (l.id === leadId ? { ...l, ...patch } : l)),
  }
}

export type NewActivity = Pick<Activity, 'subjectType' | 'subjectId' | 'kind' | 'summary' | 'authorId'>

// --- Pipeline template administration (spec Section 6.3) ---------------------
//
// Admin-only in principle; there is no auth layer in v1, so these are simply not
// reachable from rep-facing screens.

function withPipeline(pipelineId: Id, update: (pipeline: PipelineTemplate) => PipelineTemplate): void {
  snapshot = {
    ...snapshot,
    pipelines: snapshot.pipelines.map((p) => (p.id === pipelineId ? update(p) : p)),
  }
}

/** Renumbers positions to 1..n so ordering never develops gaps or ties. */
function renumber(stages: Stage[]): Stage[] {
  return stages
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((stage, index) => ({ ...stage, position: index + 1 }))
}

export function updateTemplate(pipelineId: Id, patch: Partial<Pick<PipelineTemplate, 'name'>>): void {
  withPipeline(pipelineId, (pipeline) => ({ ...pipeline, ...patch }))
}

/**
 * Duplicating a template is the supported way to add a new pipeline type (spec 6.3).
 * Stages are copied with fresh ids so the two templates never share stage records.
 */
export function duplicateTemplate(pipelineId: Id, name: string): PipelineTemplate | null {
  const source = snapshot.pipelines.find((p) => p.id === pipelineId)
  if (!source) return null

  const copy: PipelineTemplate = {
    id: newId('pipe'),
    name,
<<<<<<< Updated upstream
    tracksPartner: source.tracksPartner,
=======
    // The gate comes across with the stages. A copy that dropped it would be a different process.
    championGatePosition: source.championGatePosition,
>>>>>>> Stashed changes
    stages: source.stages.map((stage) => ({ ...stage, id: newId('stage') })),
  }
  snapshot = { ...snapshot, pipelines: [...snapshot.pipelines, copy] }
  return copy
}

export function createTemplate(name: string, tracksPartner: boolean): PipelineTemplate {
  const template: PipelineTemplate = {
    id: newId('pipe'),
    name,
<<<<<<< Updated upstream
    tracksPartner,
=======
    // Ungated: the offline path has no wizard to ask, and inventing a gate that cannot be moved later is
    // worse than leaving one unset.
    championGatePosition: null,
>>>>>>> Stashed changes
    // A brand-new pipeline still needs somewhere for deals to land and to finish.
    stages: [
      blankStage('New stage', 10, 1, '#a6bbd1', 'open'),
      blankStage('Closed Won', 100, 2, '#004eba', 'won'),
      blankStage('Closed Lost', 0, 3, '#c8324f', 'lost'),
    ],
  }
  snapshot = { ...snapshot, pipelines: [...snapshot.pipelines, template] }
  return template
}

function blankStage(
  name: string,
  probability: number,
  position: number,
  color: string,
  kind: Stage['kind'],
): Stage {
  return {
    id: newId('stage'),
    name,
    shortName: name,
    probability,
<<<<<<< Updated upstream
=======
    expectedDays: kind === 'open' ? 21 : null,
    championRequired: false,
    isChampionGate: false,
>>>>>>> Stashed changes
    color,
    kind,
    position,
    wipLimit: null,
    entryCriteria: null,
    exitCriteria: null,
    keyActivities: null,
    // Empty, not null: a new stage has no deliverables yet, and a list is always a list.
    // An admin adds them in Settings → Pipelines.
    deliverables: [],
  }
}

/** Appends a stage before the terminal stages, which is nearly always what is meant. */
export function addStage(pipelineId: Id, name = 'New stage'): Stage | null {
  const pipeline = snapshot.pipelines.find((p) => p.id === pipelineId)
  if (!pipeline) return null

  const lastOpen = pipeline.stages.filter((s) => s.kind === 'open').length
  const stage = blankStage(name, 10, lastOpen + 1, '#4a90e2', 'open')

  withPipeline(pipelineId, (p) => ({
    ...p,
    stages: renumber([
      ...p.stages.map((s) => (s.position > lastOpen ? { ...s, position: s.position + 1 } : s)),
      stage,
    ]),
  }))
  return stage
}

export type StagePatch = Partial<
  Pick<Stage, 'name' | 'shortName' | 'probability' | 'color' | 'kind' | 'wipLimit'>
>

export function updateStage(pipelineId: Id, stageId: Id, patch: StagePatch): void {
  withPipeline(pipelineId, (pipeline) => ({
    ...pipeline,
    stages: pipeline.stages.map((s) => (s.id === stageId ? { ...s, ...patch } : s)),
  }))
}

/** Moves a stage to a new zero-based index, renumbering the rest. */
export function reorderStage(pipelineId: Id, stageId: Id, toIndex: number): void {
  withPipeline(pipelineId, (pipeline) => {
    const ordered = pipeline.stages.slice().sort((a, b) => a.position - b.position)
    const from = ordered.findIndex((s) => s.id === stageId)
    if (from === -1) return pipeline

    const clamped = Math.max(0, Math.min(toIndex, ordered.length - 1))
    const [moved] = ordered.splice(from, 1)
    ordered.splice(clamped, 0, moved)

    return { ...pipeline, stages: renumber(ordered.map((s, i) => ({ ...s, position: i + 1 }))) }
  })
}

export type DeleteStageResult =
  | { deleted: true }
  | { deleted: false; reason: 'not-found' }
  | { deleted: false; reason: 'last-stage' }
  | { deleted: false; reason: 'has-deals'; dealCount: number }

/**
 * Deleting a stage that still holds deals is refused, not silently orphaning them
 * (spec 6.3). The caller gets the count so it can offer to reassign first.
 */
export function deleteStage(pipelineId: Id, stageId: Id): DeleteStageResult {
  const pipeline = snapshot.pipelines.find((p) => p.id === pipelineId)
  if (!pipeline || !pipeline.stages.some((s) => s.id === stageId)) {
    return { deleted: false, reason: 'not-found' }
  }
  if (pipeline.stages.length === 1) return { deleted: false, reason: 'last-stage' }

  const dealCount = snapshot.deals.filter((d) => d.stageId === stageId).length
  if (dealCount > 0) return { deleted: false, reason: 'has-deals', dealCount }

  withPipeline(pipelineId, (p) => ({
    ...p,
    stages: renumber(p.stages.filter((s) => s.id !== stageId)),
  }))
  return { deleted: true }
}

/** Bulk-moves every deal out of one stage, so the stage can then be deleted. */
export function reassignDeals(fromStageId: Id, toStageId: Id): { reassigned: number } {
  const owning = snapshot.pipelines.find((p) => p.stages.some((s) => s.id === fromStageId))
  const target = owning?.stages.find((s) => s.id === toStageId)
  // Refuse to fling deals into another pipeline's stage.
  if (!owning || !target || fromStageId === toStageId) return { reassigned: 0 }

  const affected = snapshot.deals.filter((d) => d.stageId === fromStageId)
  if (affected.length === 0) return { reassigned: 0 }

  snapshot = {
    ...snapshot,
    deals: snapshot.deals.map((d) => (d.stageId === fromStageId ? { ...d, stageId: toStageId } : d)),
    activities: [
      ...affected.map((deal) => ({
        id: newId('act'),
        subjectType: 'deal' as const,
        subjectId: deal.id,
        kind: 'stage-change' as const,
        summary: `Reassigned to ${target.name} during pipeline changes.`,
        authorId: deal.ownerId,
        occurredAt: new Date().toISOString(),
      })),
      ...snapshot.activities,
    ],
  }
  return { reassigned: affected.length }
}

/** Logs an activity against an account, lead, or deal (R4). */
export function logActivity(input: NewActivity): Activity {
  const activity: Activity = {
    ...input,
    id: newId('act'),
    occurredAt: new Date().toISOString(),
  }
  snapshot = { ...snapshot, activities: [activity, ...snapshot.activities] }
  return activity
}
