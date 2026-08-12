import type { Account, Activity, Deal, Health, Lead, PipelineTemplate, Snapshot, Stage } from '@/types/domain'
import { dealHealthDetail, rollUpHealth, type HealthDetail } from './health'

/**
 * Whether deals in this stage still count as open pipeline.
 *
 * Read from `stage.kind`, never inferred from probability: a Closed Lost stage sits at
 * 0% and would otherwise be counted as open, inflating pipeline value and the
 * needs-attention count.
 */
export function isOpenStage(stage: Stage): boolean {
  return stage.kind === 'open'
}

/** Stages at or above this probability are "advanced" for dashboard reporting (R5). */
export const ADVANCED_STAGE_THRESHOLD = 55

export function stageIndex(pipelines: PipelineTemplate[]): Map<string, Stage> {
  const index = new Map<string, Stage>()
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) index.set(stage.id, stage)
  }
  return index
}

/** A deal decorated with everything the UI needs to render it without further lookups. */
export interface DealView {
  deal: Deal
  account: Account
  lead: Lead | null
  stage: Stage
  pipeline: PipelineTemplate
  ownerName: string
  health: Health
  /** Why it has that health — `overdue` and `stalled` are both at-risk, for different reasons. */
  healthDetail: HealthDetail
  isOpen: boolean
}

export function buildDealViews(snapshot: Snapshot, now: number = Date.now()): DealView[] {
  const stages = stageIndex(snapshot.pipelines)
  const accountsById = new Map(snapshot.accounts.map((a) => [a.id, a]))
  const leadsById = new Map(snapshot.leads.map((l) => [l.id, l]))
  const peopleById = new Map(snapshot.people.map((p) => [p.id, p]))
  const pipelinesById = new Map(snapshot.pipelines.map((p) => [p.id, p]))

  const views: DealView[] = []
  for (const deal of snapshot.deals) {
    const account = accountsById.get(deal.accountId)
    const stage = stages.get(deal.stageId)
    const pipeline = pipelinesById.get(deal.pipelineTemplateId)
    // Skip rather than throw: a deal pointing at a missing account or stage is bad data,
    // not a reason to blank the whole screen.
    if (!account || !stage || !pipeline) continue

    const healthDetail = dealHealthDetail(deal, snapshot.activities, now)

    views.push({
      deal,
      account,
      lead: deal.leadId ? leadsById.get(deal.leadId) ?? null : null,
      stage,
      pipeline,
      ownerName: peopleById.get(deal.ownerId)?.name ?? 'Unassigned',
      health: healthDetail.health,
      healthDetail,
      isOpen: isOpenStage(stage),
    })
  }
  return views
}

export interface RollUp {
  openValue: number
  openCount: number
  health: Health
}

export function rollUp(views: DealView[]): RollUp {
  const open = views.filter((v) => v.isOpen)
  return {
    openValue: open.reduce((sum, v) => sum + v.deal.value, 0),
    openCount: open.length,
    health: rollUpHealth(open.map((v) => v.health)),
  }
}

export interface DashboardMetrics {
  openPipelineValue: number
  advancedStageCount: number
  closingThisWeekCount: number
  needsAttentionCount: number
}

export function dashboardMetrics(views: DealView[]): DashboardMetrics {
  const open = views.filter((v) => v.isOpen)
  return {
    openPipelineValue: open.reduce((sum, v) => sum + v.deal.value, 0),
    advancedStageCount: open.filter((v) => v.stage.probability >= ADVANCED_STAGE_THRESHOLD).length,
    closingThisWeekCount: open.filter((v) => v.health === 'closing-soon').length,
    needsAttentionCount: open.filter((v) => v.health === 'at-risk').length,
  }
}

/** Deals worth a rep's attention first: at-risk and closing-soon, largest value first. */
export function highPriorityDeals(views: DealView[], limit = 6): DealView[] {
  const rank: Record<Health, number> = { 'at-risk': 0, 'closing-soon': 1, healthy: 2 }
  return views
    .filter((v) => v.isOpen && v.health !== 'healthy')
    .sort((a, b) => rank[a.health] - rank[b.health] || b.deal.value - a.deal.value)
    .slice(0, limit)
}

export interface StageBucket {
  stage: Stage
  views: DealView[]
  value: number
}

/** Groups deals into the active pipeline's stages, in stage order (R5). */
export function bucketByStage(pipeline: PipelineTemplate, views: DealView[]): StageBucket[] {
  const ordered = [...pipeline.stages].sort((a, b) => a.position - b.position)
  return ordered.map((stage) => {
    const inStage = views.filter((v) => v.deal.stageId === stage.id)
    return {
      stage,
      views: inStage,
      value: inStage.reduce((sum, v) => sum + v.deal.value, 0),
    }
  })
}

export interface ActivityView {
  activity: Activity
  authorName: string
  subjectLabel: string
}

export function buildActivityViews(snapshot: Snapshot): ActivityView[] {
  const peopleById = new Map(snapshot.people.map((p) => [p.id, p]))
  const accountsById = new Map(snapshot.accounts.map((a) => [a.id, a]))
  const leadsById = new Map(snapshot.leads.map((l) => [l.id, l]))
  const dealsById = new Map(snapshot.deals.map((d) => [d.id, d]))

  function label(subjectType: Activity['subjectType'], subjectId: string): string {
    if (subjectType === 'account') return accountsById.get(subjectId)?.name ?? 'Unknown account'
    if (subjectType === 'lead') {
      const lead = leadsById.get(subjectId)
      if (!lead) return 'Unknown lead'
      const account = accountsById.get(lead.accountId)
      return `${account?.name ?? 'Unknown'} — ${lead.businessUnit}`
    }
    return dealsById.get(subjectId)?.name ?? 'Unknown deal'
  }

  return [...snapshot.activities]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .map((activity) => ({
      activity,
      authorName: peopleById.get(activity.authorId)?.name ?? 'Unknown',
      subjectLabel: label(activity.subjectType, activity.subjectId),
    }))
}

// --- Account Explorer tree ---------------------------------------------------

export interface DealNode {
  kind: 'deal'
  id: string
  view: DealView
}

export interface LeadNode {
  kind: 'lead'
  id: string
  lead: Lead
  ownerName: string
  deals: DealNode[]
  rollUp: RollUp
}

export interface AccountNode {
  kind: 'account'
  id: string
  account: Account
  ownerName: string
  leads: LeadNode[]
  /** Deals that roll up to the account without sitting under a lead. */
  directDeals: DealNode[]
  rollUp: RollUp
}

/**
 * Builds the Account -> Lead -> Deal tree (R3).
 *
 * Every account appears at the top level: a partner shows through the people on a deal, not
 * deals via the Partner field, not as a customer node of its own. This keeps the tree
 * answering one question — who are our customers and what is in flight with them.
 */
export function buildTree(snapshot: Snapshot, views: DealView[]): AccountNode[] {
  const peopleById = new Map(snapshot.people.map((p) => [p.id, p]))
  const viewsByAccount = new Map<string, DealView[]>()
  for (const view of views) {
    const list = viewsByAccount.get(view.deal.accountId) ?? []
    list.push(view)
    viewsByAccount.set(view.deal.accountId, list)
  }

  // Every account appears. This used to drop ones flagged as partners; with the flag gone, an account
  // that has only ever been a partner simply shows with no deals of its own, which is true.
  return snapshot.accounts
    .map((account) => {
      const accountViews = viewsByAccount.get(account.id) ?? []
      const accountLeads = snapshot.leads.filter((l) => l.accountId === account.id)

      const leadNodes: LeadNode[] = accountLeads.map((lead) => {
        const leadViews = accountViews.filter((v) => v.deal.leadId === lead.id)
        return {
          kind: 'lead',
          id: lead.id,
          lead,
          // A business unit has no owner of its own; the account's is shown so every level of the
          // tree still names somebody accountable.
          ownerName: peopleById.get(account.ownerId)?.name ?? 'Unassigned',
          deals: leadViews.map((view) => ({ kind: 'deal', id: view.deal.id, view })),
          rollUp: rollUp(leadViews),
        }
      })

      const directViews = accountViews.filter((v) => v.deal.leadId === null)

      return {
        kind: 'account',
        id: account.id,
        account,
        ownerName: peopleById.get(account.ownerId)?.name ?? 'Unassigned',
        leads: leadNodes,
        directDeals: directViews.map((view) => ({ kind: 'deal', id: view.deal.id, view })),
        rollUp: rollUp(accountViews),
      }
    })
}

/**
 * Filters the tree by a free-text query across all three levels (spec 4.3).
 * A match at any level keeps that node's ancestors, so the hierarchy stays intact.
 */
export function filterTree(nodes: AccountNode[], query: string): AccountNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes

  const result: AccountNode[] = []
  for (const node of nodes) {
    const accountMatches =
      node.account.name.toLowerCase().includes(q) || node.account.industry.toLowerCase().includes(q)

    const matchesDeal = (d: DealNode) =>
      d.view.deal.name.toLowerCase().includes(q) ||
      d.view.stage.name.toLowerCase().includes(q) ||
      d.view.ownerName.toLowerCase().includes(q) ||
      false

    const leads = node.leads
      .map((lead) => {
        const leadMatches = lead.lead.businessUnit.toLowerCase().includes(q)
        const deals = accountMatches || leadMatches ? lead.deals : lead.deals.filter(matchesDeal)
        return { lead, leadMatches, deals }
      })
      .filter(({ leadMatches, deals }) => accountMatches || leadMatches || deals.length > 0)
      .map(({ lead, deals }) => ({ ...lead, deals }))

    const directDeals = accountMatches ? node.directDeals : node.directDeals.filter(matchesDeal)

    if (accountMatches || leads.length > 0 || directDeals.length > 0) {
      result.push({ ...node, leads, directDeals })
    }
  }
  return result
}
