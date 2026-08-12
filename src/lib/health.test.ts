import { describe, expect, it } from 'vitest'
import type { Activity, Deal } from '@/types/domain'
import { dealHealth, dealHealthDetail, lastActivityAt, reasonDetail, rollUpHealth } from './health'

const dayMs = 86_400_000
const NOW = new Date('2026-07-29T12:00:00.000Z').getTime()

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'deal-x',
    name: 'Test deal',
    accountId: 'acc-1',
    leadId: null,
    pipelineTemplateId: 'pipe-direct',
    stageId: 'stage-d3',
    value: 100_000,
    currency: 'USD',
    expectedCloseDate: new Date(NOW + 60 * dayMs).toISOString(),
    createdAt: new Date(NOW - 90 * dayMs).toISOString(),
    ownerId: 'per-1',
    ...overrides,
  }
}

/** An ISO date `days` from NOW; negative is in the past. */
function iso(days: number): string {
  return new Date(NOW + days * dayMs).toISOString()
}

function activity(daysAgo: number, dealId = 'deal-x'): Activity {
  return {
    id: `act-${daysAgo}`,
    subjectType: 'deal',
    subjectId: dealId,
    kind: 'call',
    summary: 'Touched',
    authorId: 'per-1',
    occurredAt: new Date(NOW - daysAgo * dayMs).toISOString(),
  }
}

describe('dealHealth', () => {
  it('is healthy when the close date is far out and it was touched recently', () => {
    expect(dealHealth(deal(), [activity(2)], NOW)).toBe('healthy')
  })

  it('is closing soon inside the seven-day window', () => {
    const d = deal({ expectedCloseDate: new Date(NOW + 3 * dayMs).toISOString() })
    expect(dealHealth(d, [activity(1)], NOW)).toBe('closing-soon')
  })

  it('treats the seven-day boundary as closing soon', () => {
    const d = deal({ expectedCloseDate: new Date(NOW + 7 * dayMs).toISOString() })
    expect(dealHealth(d, [activity(1)], NOW)).toBe('closing-soon')
  })

  it('is at risk once the close date has passed', () => {
    const d = deal({ expectedCloseDate: new Date(NOW - dayMs).toISOString() })
    expect(dealHealth(d, [activity(1)], NOW)).toBe('at-risk')
  })

  it('is at risk when untouched for longer than 21 days', () => {
    expect(dealHealth(deal(), [activity(22)], NOW)).toBe('at-risk')
  })

  it('is healthy at exactly 21 days since last touch', () => {
    expect(dealHealth(deal(), [activity(21)], NOW)).toBe('healthy')
  })

  it('is at risk when it has never been touched and was created long ago', () => {
    expect(dealHealth(deal(), [], NOW)).toBe('at-risk')
  })

  it('is healthy when freshly created with no activity yet', () => {
    // The regression this guards: a deal was at risk the instant it was created, because
    // "no activity" was read as "gone quiet". Creation is itself a touch.
    const fresh = deal({ createdAt: new Date(NOW - dayMs).toISOString() })
    expect(dealHealth(fresh, [], NOW)).toBe('healthy')
  })

  it('a freshly created deal closing this week is closing-soon, not at risk', () => {
    const fresh = deal({
      createdAt: new Date(NOW).toISOString(),
      expectedCloseDate: new Date(NOW + 3 * dayMs).toISOString(),
    })
    expect(dealHealth(fresh, [], NOW)).toBe('closing-soon')
  })

  it('activity still wins over creation date once it exists', () => {
    // Created long ago but touched yesterday: healthy.
    expect(dealHealth(deal(), [activity(1)], NOW)).toBe('healthy')
  })

  it('prefers at-risk over closing-soon when both apply', () => {
    const d = deal({ expectedCloseDate: new Date(NOW + 2 * dayMs).toISOString() })
    expect(dealHealth(d, [activity(40)], NOW)).toBe('at-risk')
  })

  it('ignores activity logged against other deals', () => {
    expect(dealHealth(deal(), [activity(1, 'deal-other')], NOW)).toBe('at-risk')
  })

  it('ignores activity logged against an account with a colliding id', () => {
    const accountActivity: Activity = { ...activity(1), subjectType: 'account', subjectId: 'deal-x' }
    expect(dealHealth(deal(), [accountActivity], NOW)).toBe('at-risk')
  })
})

describe('lastActivityAt', () => {
  it('returns the most recent timestamp, not the first found', () => {
    const result = lastActivityAt('deal-x', [activity(10), activity(2), activity(30)])
    expect(result).toBe(NOW - 2 * dayMs)
  })

  it('returns null when nothing matches', () => {
    expect(lastActivityAt('deal-x', [activity(1, 'deal-other')])).toBeNull()
  })
})

describe('rollUpHealth', () => {
  it('surfaces the worst child state', () => {
    expect(rollUpHealth(['healthy', 'closing-soon', 'at-risk'])).toBe('at-risk')
    expect(rollUpHealth(['healthy', 'closing-soon'])).toBe('closing-soon')
    expect(rollUpHealth(['healthy'])).toBe('healthy')
  })

  it('treats an empty set as healthy', () => {
    expect(rollUpHealth([])).toBe('healthy')
  })
})

describe('dealHealthDetail', () => {
  it('separates the two at-risk causes', () => {
    const overdue = dealHealthDetail(deal({ expectedCloseDate: iso(-9) }), [], NOW)
    expect(overdue.health).toBe('at-risk')
    expect(overdue.reason).toBe('overdue')
    expect(overdue.daysOverdue).toBe(9)

    const stalled = dealHealthDetail(deal({ createdAt: iso(-40) }), [activity(30)], NOW)
    expect(stalled.health).toBe('at-risk')
    expect(stalled.reason).toBe('stalled')
    expect(stalled.daysSinceTouch).toBe(30)
  })

  it('calls an overdue-and-stale deal overdue, matching the precedence rule', () => {
    // Both conditions hold. Overdue is checked first, and the label has to agree with
    // that ordering or the badge would contradict the filter.
    const detail = dealHealthDetail(deal({ expectedCloseDate: iso(-3), createdAt: iso(-90) }), [], NOW)
    expect(detail.reason).toBe('overdue')
  })

  it('reports on-track and closing-soon for the healthy cases', () => {
    expect(dealHealthDetail(deal(), [activity(1)], NOW).reason).toBe('on-track')
    expect(dealHealthDetail(deal({ expectedCloseDate: iso(3) }), [activity(1)], NOW).reason).toBe(
      'closing-soon',
    )
  })

  it('agrees with dealHealth in every case', () => {
    const cases = [
      deal(),
      deal({ expectedCloseDate: iso(-1) }),
      deal({ expectedCloseDate: iso(4) }),
      deal({ createdAt: iso(-60) }),
    ]
    for (const d of cases) {
      expect(dealHealthDetail(d, [], NOW).health).toBe(dealHealth(d, [], NOW))
    }
  })
})

describe('reasonDetail', () => {
  it('explains the cause in words, and gets singular days right', () => {
    expect(reasonDetail(dealHealthDetail(deal({ expectedCloseDate: iso(-1) }), [], NOW))).toBe(
      'Close date passed 1 day ago',
    )
    expect(reasonDetail(dealHealthDetail(deal({ createdAt: iso(-40) }), [activity(30)], NOW))).toBe(
      'No activity for 30 days',
    )
  })
})
