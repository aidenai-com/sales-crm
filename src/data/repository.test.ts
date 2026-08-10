import { beforeEach, describe, expect, it } from 'vitest'
import { getSnapshot, logActivity, moveDealToStage, resetSnapshot, updateDeal } from './repository'

beforeEach(() => {
  resetSnapshot()
})

describe('moveDealToStage', () => {
  it('moves a deal within its own pipeline', () => {
    expect(moveDealToStage('deal-11', 'stage-d3')).toEqual({ moved: true })
    expect(getSnapshot().deals.find((d) => d.id === 'deal-11')?.stageId).toBe('stage-d3')
  })

  it('logs the move as an activity so the change is traceable', () => {
    const before = getSnapshot().activities.length
    moveDealToStage('deal-11', 'stage-d3')
    const after = getSnapshot().activities
    expect(after).toHaveLength(before + 1)
    expect(after[0].kind).toBe('stage-change')
    expect(after[0].subjectId).toBe('deal-11')
    expect(after[0].summary).toContain('Solution Alignment')
  })

  it('refuses a move across pipelines — a deal belongs to exactly one template', () => {
    // deal-11 is on the direct pipeline; stage-p3 belongs to the partner pipeline.
    expect(moveDealToStage('deal-11', 'stage-p3')).toEqual({ moved: false })
    expect(getSnapshot().deals.find((d) => d.id === 'deal-11')?.stageId).toBe('stage-d1')
  })

  it('is a no-op when the deal is already in that stage', () => {
    const before = getSnapshot().activities.length
    expect(moveDealToStage('deal-11', 'stage-d1')).toEqual({ moved: false })
    expect(getSnapshot().activities).toHaveLength(before)
  })

  it('refuses an unknown stage or deal', () => {
    expect(moveDealToStage('deal-11', 'stage-nope')).toEqual({ moved: false })
    expect(moveDealToStage('deal-nope', 'stage-d3')).toEqual({ moved: false })
  })

  it('does not gate on exit criteria — v1 advancement is a plain manual move (spec 6.4)', () => {
    // Jump from stage 1 straight to stage 6, skipping every criterion in between.
    expect(moveDealToStage('deal-11', 'stage-d6')).toEqual({ moved: true })
  })
})

describe('updateDeal', () => {
  it('patches only the named fields', () => {
    updateDeal('deal-11', { value: 999_000 })
    const deal = getSnapshot().deals.find((d) => d.id === 'deal-11')!
    expect(deal.value).toBe(999_000)
    expect(deal.name).toBe('Claims Automation Discovery')
  })

  it('leaves other deals untouched', () => {
    const other = getSnapshot().deals.find((d) => d.id === 'deal-1')!.value
    updateDeal('deal-11', { value: 1 })
    expect(getSnapshot().deals.find((d) => d.id === 'deal-1')?.value).toBe(other)
  })
})

describe('logActivity', () => {
  it('logs against an account, a lead, and a deal (R4)', () => {
    logActivity({ subjectType: 'account', subjectId: 'acc-jpmc', kind: 'note', summary: 'A', authorId: 'per-1' })
    logActivity({ subjectType: 'lead', subjectId: 'lead-jpmc-1', kind: 'call', summary: 'B', authorId: 'per-1' })
    logActivity({ subjectType: 'deal', subjectId: 'deal-1', kind: 'email', summary: 'C', authorId: 'per-1' })

    const summaries = getSnapshot().activities.slice(0, 3).map((a) => a.summary)
    expect(summaries).toEqual(['C', 'B', 'A'])
  })

  it('puts the newest activity first and gives it a unique id', () => {
    const first = logActivity({
      subjectType: 'deal',
      subjectId: 'deal-1',
      kind: 'note',
      summary: 'First',
      authorId: 'per-1',
    })
    const second = logActivity({
      subjectType: 'deal',
      subjectId: 'deal-1',
      kind: 'note',
      summary: 'Second',
      authorId: 'per-1',
    })
    expect(first.id).not.toBe(second.id)
    expect(getSnapshot().activities[0].id).toBe(second.id)
  })
})

describe('resetSnapshot', () => {
  it('restores fixture state', () => {
    updateDeal('deal-11', { value: 1 })
    resetSnapshot()
    expect(getSnapshot().deals.find((d) => d.id === 'deal-11')?.value).toBe(640_000)
  })
})
