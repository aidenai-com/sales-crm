import { beforeEach, describe, expect, it } from 'vitest'
import {
  addStage,
  createTemplate,
  deleteStage,
  duplicateTemplate,
  getSnapshot,
  reassignDeals,
  reorderStage,
  resetSnapshot,
  updateStage,
  updateTemplate,
} from './repository'

beforeEach(() => {
  resetSnapshot()
})

function direct() {
  return getSnapshot().pipelines.find((p) => p.id === 'pipe-direct')!
}

function positions() {
  return direct()
    .stages.slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => s.name)
}

describe('fixtures are not mutated', () => {
  it('resetSnapshot restores stage edits', () => {
    updateStage('pipe-direct', 'stage-d1', { name: 'Renamed' })
    expect(direct().stages.find((s) => s.id === 'stage-d1')?.name).toBe('Renamed')

    resetSnapshot()
    expect(direct().stages.find((s) => s.id === 'stage-d1')?.name).toBe('Prospecting')
  })
})

describe('updateTemplate', () => {
  it('renames a pipeline', () => {
    updateTemplate('pipe-direct', { name: 'Enterprise Direct' })
    expect(direct().name).toBe('Enterprise Direct')
  })
})

describe('updateStage', () => {
  it('patches only the named fields', () => {
    updateStage('pipe-direct', 'stage-d2', { probability: 22, color: '#0b3558' })
    const stage = direct().stages.find((s) => s.id === 'stage-d2')!
    expect(stage.probability).toBe(22)
    expect(stage.color).toBe('#0b3558')
    expect(stage.name).toBe('Discover & Qualify')
  })

  it('can change a stage kind, which changes what counts as open', () => {
    updateStage('pipe-direct', 'stage-d1', { kind: 'lost' })
    expect(direct().stages.find((s) => s.id === 'stage-d1')?.kind).toBe('lost')
  })

  it('sets and clears a deal limit', () => {
    updateStage('pipe-direct', 'stage-d1', { wipLimit: 5 })
    expect(direct().stages.find((s) => s.id === 'stage-d1')?.wipLimit).toBe(5)
    updateStage('pipe-direct', 'stage-d1', { wipLimit: null })
    expect(direct().stages.find((s) => s.id === 'stage-d1')?.wipLimit).toBeNull()
  })
})

describe('addStage', () => {
  it('inserts before the terminal stages so Closed Won stays last', () => {
    addStage('pipe-direct', 'Security Review')
    const names = positions()
    expect(names).toContain('Security Review')
    expect(names.indexOf('Security Review')).toBeLessThan(names.indexOf('Deploy & Develop'))
    expect(names[names.length - 1]).toBe('Closed Lost')
  })

  it('keeps positions contiguous from 1', () => {
    addStage('pipe-direct')
    const sorted = direct().stages.map((s) => s.position).sort((a, b) => a - b)
    expect(sorted).toEqual(Array.from({ length: sorted.length }, (_, i) => i + 1))
  })

  it('returns null for an unknown pipeline', () => {
    expect(addStage('pipe-nope')).toBeNull()
  })
})

describe('reorderStage', () => {
  it('moves a stage to a new index and renumbers the rest', () => {
    reorderStage('pipe-direct', 'stage-d5', 0)
    expect(positions()[0]).toBe('Proposal, Negotiation & Close')
    expect(direct().stages.map((s) => s.position).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('clamps an out-of-range index instead of losing the stage', () => {
    reorderStage('pipe-direct', 'stage-d1', 99)
    expect(positions()[positions().length - 1]).toBe('Prospecting')
    expect(direct().stages).toHaveLength(7)
  })

  it('ignores an unknown stage', () => {
    const before = positions()
    reorderStage('pipe-direct', 'stage-nope', 0)
    expect(positions()).toEqual(before)
  })
})

describe('deleteStage', () => {
  it('refuses while deals still occupy the stage, reporting how many', () => {
    const occupied = getSnapshot().deals.filter((d) => d.stageId === 'stage-d5').length
    expect(occupied).toBeGreaterThan(0)

    expect(deleteStage('pipe-direct', 'stage-d5')).toEqual({
      deleted: false,
      reason: 'has-deals',
      dealCount: occupied,
    })
    expect(direct().stages.some((s) => s.id === 'stage-d5')).toBe(true)
  })

  it('deletes an empty stage and renumbers', () => {
    const stage = addStage('pipe-direct', 'Temporary')!
    expect(deleteStage('pipe-direct', stage.id)).toEqual({ deleted: true })
    expect(direct().stages.some((s) => s.id === stage.id)).toBe(false)
    expect(direct().stages.map((s) => s.position).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('reports not-found for an unknown stage', () => {
    expect(deleteStage('pipe-direct', 'stage-nope')).toEqual({ deleted: false, reason: 'not-found' })
  })

  it('never leaves a pipeline with no stages', () => {
    const template = createTemplate('Solo')
    // Empty the new template down to its last stage.
    for (const stage of template.stages.slice(1)) deleteStage(template.id, stage.id)

    const remaining = getSnapshot().pipelines.find((p) => p.id === template.id)!
    expect(remaining.stages).toHaveLength(1)
    expect(deleteStage(template.id, remaining.stages[0].id)).toEqual({
      deleted: false,
      reason: 'last-stage',
    })
  })
})

describe('reassignDeals', () => {
  it('moves every deal out of a stage so it can then be deleted', () => {
    const moving = getSnapshot().deals.filter((d) => d.stageId === 'stage-d5').length

    expect(reassignDeals('stage-d5', 'stage-d4')).toEqual({ reassigned: moving })
    expect(getSnapshot().deals.filter((d) => d.stageId === 'stage-d5')).toHaveLength(0)
    expect(deleteStage('pipe-direct', 'stage-d5')).toEqual({ deleted: true })
  })

  it('logs the reassignment against each deal', () => {
    const before = getSnapshot().activities.length
    const { reassigned } = reassignDeals('stage-d5', 'stage-d4')

    expect(getSnapshot().activities).toHaveLength(before + reassigned)
    expect(getSnapshot().activities[0].summary).toContain('Technical Validation')
  })

  it('refuses to fling deals into another pipeline’s stage', () => {
    expect(reassignDeals('stage-d5', 'stage-p3')).toEqual({ reassigned: 0 })
    expect(getSnapshot().deals.filter((d) => d.stageId === 'stage-d5').length).toBeGreaterThan(0)
  })

  it('is a no-op for the same stage', () => {
    expect(reassignDeals('stage-d5', 'stage-d5')).toEqual({ reassigned: 0 })
  })
})

describe('duplicateTemplate', () => {
  it('copies stages with fresh ids so the templates never share records', () => {
    const copy = duplicateTemplate('pipe-direct', 'Direct copy')!

    expect(copy.name).toBe('Direct copy')
    expect(copy.stages).toHaveLength(direct().stages.length)

    const originalIds = new Set(direct().stages.map((s) => s.id))
    expect(copy.stages.every((s) => !originalIds.has(s.id))).toBe(true)

    // Editing the copy must not touch the original.
    updateStage(copy.id, copy.stages[0].id, { name: 'Changed' })
    expect(direct().stages[0].name).toBe('Prospecting')
  })

  it('preserves methodology content on the copy', () => {
    const copy = duplicateTemplate('pipe-direct', 'Direct copy')!
    expect(copy.stages[0].entryCriteria).not.toBeNull()
  })

  it('returns null for an unknown pipeline', () => {
    expect(duplicateTemplate('pipe-nope', 'x')).toBeNull()
  })
})

describe('createTemplate', () => {
  it('starts with an open stage plus won and lost outcomes', () => {
    const template = createTemplate('Reseller')

    expect(template.stages.map((s) => s.kind)).toEqual(['open', 'won', 'lost'])
    expect(template.stages.map((s) => s.position)).toEqual([1, 2, 3])
  })

  it('adds the template to the snapshot so boards can render it immediately', () => {
    const template = createTemplate('Reseller')
    expect(getSnapshot().pipelines.some((p) => p.id === template.id)).toBe(true)
  })
})
