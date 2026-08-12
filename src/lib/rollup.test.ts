import { describe, expect, it } from 'vitest'
import { getSnapshot, resetSnapshot } from '@/data/repository'
import {
  bucketByStage,
  buildDealViews,
  buildTree,
  dashboardMetrics,
  filterTree,
  highPriorityDeals,
  rollUp,
} from './rollup'

function snapshot() {
  resetSnapshot()
  return getSnapshot()
}

describe('buildDealViews', () => {
  it('decorates every seeded deal', () => {
    const snap = snapshot()
    expect(buildDealViews(snap)).toHaveLength(snap.deals.length)
  })

  it('resolves the customer on every deal', () => {
    // Was "resolves the partner on partner-led deals". A deal has no partner field: who else is involved
    // is expressed by the people attached to it, which a `DealView` does not carry — the deal page fetches
    // them per deal. So the only company a view resolves is the customer.
    const views = buildDealViews(snapshot())
    expect(views.length).toBeGreaterThan(0)
    for (const view of views) {
      expect(view.account.id).toBe(view.deal.accountId)
    }
  })

  it('skips deals whose account or stage is missing rather than throwing', () => {
    const snap = snapshot()
    const broken = {
      ...snap,
      deals: [...snap.deals, { ...snap.deals[0], id: 'deal-broken', accountId: 'acc-missing' }],
    }
    expect(buildDealViews(broken)).toHaveLength(snap.deals.length)
  })

  it('takes open/closed from stage kind, not from probability', () => {
    const views = buildDealViews(snapshot())
    for (const view of views) {
      expect(view.isOpen).toBe(view.stage.kind === 'open')
    }
  })

  it('treats a 0% Closed Lost stage as closed, not open', () => {
    // The regression this guards: inferring openness from `probability < 100` counted
    // lost deals as open pipeline, inflating value and the needs-attention count.
    const views = buildDealViews(snapshot())
    const lost = views.filter((v) => v.stage.kind === 'lost')

    expect(lost.length).toBeGreaterThan(0)
    for (const view of lost) {
      expect(view.stage.probability).toBe(0)
      expect(view.isOpen).toBe(false)
    }
  })
})

describe('dashboardMetrics', () => {
  it('counts only open deals in the pipeline value', () => {
    const views = buildDealViews(snapshot())
    const metrics = dashboardMetrics(views)
    const expected = views.filter((v) => v.isOpen).reduce((sum, v) => sum + v.deal.value, 0)
    expect(metrics.openPipelineValue).toBe(expected)
  })

  it('counts advanced-stage deals at 55% probability and above (R5)', () => {
    const views = buildDealViews(snapshot())
    const metrics = dashboardMetrics(views)
    const expected = views.filter((v) => v.isOpen && v.stage.probability >= 55).length
    expect(metrics.advancedStageCount).toBe(expected)
  })

  it('never counts a closed deal as needing attention', () => {
    const views = buildDealViews(snapshot())
    const metrics = dashboardMetrics(views)
    const closedAtRisk = views.filter((v) => !v.isOpen && v.health === 'at-risk')
    expect(closedAtRisk.length).toBeGreaterThan(0)
    expect(metrics.needsAttentionCount).toBe(views.filter((v) => v.isOpen && v.health === 'at-risk').length)
  })
})

describe('highPriorityDeals', () => {
  it('excludes healthy deals and puts at-risk before closing-soon', () => {
    const views = buildDealViews(snapshot())
    const priority = highPriorityDeals(views, 20)
    expect(priority.every((v) => v.health !== 'healthy')).toBe(true)
    expect(priority.every((v) => v.isOpen)).toBe(true)

    const firstClosingSoon = priority.findIndex((v) => v.health === 'closing-soon')
    const lastAtRisk = priority.map((v) => v.health).lastIndexOf('at-risk')
    if (firstClosingSoon !== -1 && lastAtRisk !== -1) {
      expect(lastAtRisk).toBeLessThan(firstClosingSoon)
    }
  })

  it('sorts by value inside a health band', () => {
    const views = buildDealViews(snapshot())
    const atRisk = highPriorityDeals(views, 20).filter((v) => v.health === 'at-risk')
    for (let i = 1; i < atRisk.length; i += 1) {
      expect(atRisk[i - 1].deal.value).toBeGreaterThanOrEqual(atRisk[i].deal.value)
    }
  })

  it('respects the limit', () => {
    expect(highPriorityDeals(buildDealViews(snapshot()), 2)).toHaveLength(2)
  })
})

describe('bucketByStage', () => {
  it('returns every stage in position order, including empty ones', () => {
    const snap = snapshot()
    const direct = snap.pipelines.find((p) => p.name === 'AidenAI Direct')!
    const views = buildDealViews(snap).filter((v) => v.pipeline.id === direct.id)
    const buckets = bucketByStage(direct, views)

    expect(buckets).toHaveLength(direct.stages.length)
    expect(buckets.map((b) => b.stage.position)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(buckets.reduce((sum, b) => sum + b.views.length, 0)).toBe(views.length)
  })

  it('seeds the six AidenAI stages with their published probabilities', () => {
    const direct = snapshot().pipelines.find((p) => p.name === 'AidenAI Direct')!
    const open = direct.stages.filter((s) => s.kind !== 'lost')
    expect(open.map((s) => s.probability)).toEqual([5, 15, 30, 55, 75, 100])
    expect(open.map((s) => s.name)).toEqual([
      'Prospecting',
      'Discover & Qualify',
      'Solution Alignment & Competitive Strategy',
      'Technical Validation & ROI Diagnostic',
      'Proposal, Negotiation & Close',
      'Deploy & Develop',
    ])
  })

  it('gives every stage a colour and exactly one won stage per pipeline', () => {
    for (const pipeline of snapshot().pipelines) {
      expect(pipeline.stages.every((s) => /^#[0-9a-f]{6}$/i.test(s.color))).toBe(true)
      expect(pipeline.stages.filter((s) => s.kind === 'won')).toHaveLength(1)
    }
  })

  it('includes an onboarding stage on the co-sell pipeline (R7)', () => {
    const coSell = snapshot().pipelines.find((p) => p.name === 'Partner Co-Sell')!
    expect(coSell.stages.map((s) => s.name)).toContain('Onboarding')
  })

  it('sums stage value from its own deals only', () => {
    const snap = snapshot()
    const direct = snap.pipelines.find((p) => p.name === 'AidenAI Direct')!
    const views = buildDealViews(snap).filter((v) => v.pipeline.id === direct.id)
    for (const bucket of bucketByStage(direct, views)) {
      expect(bucket.value).toBe(bucket.views.reduce((sum, v) => sum + v.deal.value, 0))
    }
  })
})

describe('rollUp', () => {
  it('ignores closed deals in value and count', () => {
    const views = buildDealViews(snapshot())
    const summary = rollUp(views)
    const open = views.filter((v) => v.isOpen)
    expect(summary.openCount).toBe(open.length)
    expect(summary.openValue).toBe(open.reduce((sum, v) => sum + v.deal.value, 0))
  })
})

describe('buildTree', () => {
  it('includes every account at the top level', () => {
    // Was "excludes partner accounts". Accounts no longer carry a partner flag — being a partner is a
    // property of a deal — so an account that has only ever been named as a partner still appears here,
    // with no deals of its own.
    const snap = snapshot()
    const tree = buildTree(snap, buildDealViews(snap))
    expect(tree).toHaveLength(snap.accounts.length)
  })

  it('places deals with no lead under the account directly', () => {
    const snap = snapshot()
    const tree = buildTree(snap, buildDealViews(snap))
    const pru = tree.find((n) => n.account.name === 'Prudential Financial')!
    expect(pru.directDeals.length).toBeGreaterThan(0)
    expect(pru.directDeals.every((d) => d.view.deal.leadId === null)).toBe(true)
  })

  it('rolls an account up over every deal beneath it, across both pipelines', () => {
    const snap = snapshot()
    const views = buildDealViews(snap)
    const tree = buildTree(snap, views)
    for (const node of tree) {
      const own = views.filter((v) => v.deal.accountId === node.account.id && v.isOpen)
      expect(node.rollUp.openCount).toBe(own.length)
      expect(node.rollUp.openValue).toBe(own.reduce((sum, v) => sum + v.deal.value, 0))
    }
  })
})

describe('filterTree', () => {
  it('returns everything for an empty query', () => {
    const snap = snapshot()
    const tree = buildTree(snap, buildDealViews(snap))
    expect(filterTree(tree, '   ')).toBe(tree)
  })

  it('keeps a whole account when the account name matches', () => {
    const snap = snapshot()
    const tree = buildTree(snap, buildDealViews(snap))
    const result = filterTree(tree, 'hsbc')
    expect(result).toHaveLength(1)
    const original = tree.find((n) => n.account.name === 'HSBC')!
    expect(result[0].leads).toHaveLength(original.leads.length)
  })

  it('keeps the ancestor chain when only a deal matches', () => {
    const snap = snapshot()
    const tree = buildTree(snap, buildDealViews(snap))
    const result = filterTree(tree, 'Mainframe COBOL')
    expect(result).toHaveLength(1)
    expect(result[0].account.name).toBe('JPMorgan Chase')
    const deals = result[0].leads.flatMap((l) => l.deals)
    expect(deals).toHaveLength(1)
    expect(deals[0].view.deal.name).toBe('Mainframe COBOL Refactor')
  })

  it('matches on business unit', () => {
    const snap = snapshot()
    const tree = buildTree(snap, buildDealViews(snap))
    const result = filterTree(tree, 'compliance')
    expect(result.length).toBeGreaterThan(0)
  })

  it('matches deals by customer name', () => {
    // Was "matches deals by partner name". Searching by partner is gone with the column: who else is
    // involved lives in a deal's contacts, which the tree does not carry, so matching on it would need a
    // fetch per keystroke. Dropped deliberately rather than faked — see the note in `filterTree`.
    const snap = snapshot()
    const tree = buildTree(snap, buildDealViews(snap))
    const result = filterTree(tree, 'jpmorgan')
    const matched = result.flatMap((n) => [...n.leads.flatMap((l) => l.deals), ...n.directDeals])
    expect(matched.length).toBeGreaterThan(0)
    expect(matched.every((d) => d.view.account.name === 'JPMorgan Chase')).toBe(true)
  })

  it('returns nothing for a query that matches nothing', () => {
    const snap = snapshot()
    const tree = buildTree(snap, buildDealViews(snap))
    expect(filterTree(tree, 'zzzzz')).toHaveLength(0)
  })
})
