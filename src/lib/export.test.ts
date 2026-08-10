import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { getSnapshot, resetSnapshot } from '@/data/repository'
import { buildActivityViews, buildDealViews } from './rollup'
import { activityRows, buildWorkbook, dealRows, exportFilename } from './export'

function snapshot() {
  resetSnapshot()
  return getSnapshot()
}

describe('dealRows', () => {
  it('emits one row per view with a stable column set', () => {
    const views = buildDealViews(snapshot())
    const rows = dealRows(views)
    expect(rows).toHaveLength(views.length)
    expect(Object.keys(rows[0])).toEqual([
      'Account',
      'Partner',
      'Opportunity',
      'Business unit',
      'Pipeline',
      'Stage',
      'Probability %',
      // The header names the unit; there is no Currency column, because everything is USD
      // and a per-row currency would advertise a flexibility the database refuses to store.
      'Value (USD)',
      'Expected close',
      'Owner',
      'Status',
    ])
  })

  it('carries both Partner and Account on partner-led rows (R8)', () => {
    const views = buildDealViews(snapshot())
    const row = dealRows(views).find((r) => r.Opportunity === 'Wealth Data Platform (co-sell)')!
    expect(row.Account).toBe('Bank of America')
    expect(row.Partner).toBe('Accenture')
  })

  it('leaves Partner blank on direct deals rather than writing a placeholder', () => {
    const views = buildDealViews(snapshot())
    const row = dealRows(views).find((r) => r.Opportunity === 'Mainframe COBOL Refactor')!
    expect(row.Partner).toBe('')
  })

  it('writes value as a number so Excel can sum it', () => {
    const rows = dealRows(buildDealViews(snapshot()))
    expect(typeof rows[0]['Value (USD)']).toBe('number')
    expect(typeof rows[0]['Probability %']).toBe('number')
  })

  it('exports only the views it is given — the current view, not the whole database', () => {
    const views = buildDealViews(snapshot())
    const partnerOnly = views.filter((v) => v.pipeline.tracksPartner)
    const rows = dealRows(partnerOnly)
    expect(rows).toHaveLength(partnerOnly.length)
    expect(rows.every((r) => r.Pipeline === 'Partner Co-Sell')).toBe(true)
  })

  it('returns an empty array for no views', () => {
    expect(dealRows([])).toEqual([])
  })
})

describe('activityRows', () => {
  it('records which level each activity was logged against', () => {
    const rows = activityRows(buildActivityViews(snapshot()))
    const levels = new Set(rows.map((r) => r['Logged against']))
    expect(levels).toContain('deal')
    expect(levels).toContain('account')
    expect(levels).toContain('lead')
  })
})

describe('buildWorkbook', () => {
  it('round-trips rows through a real worksheet', () => {
    const rows = dealRows(buildDealViews(snapshot()))
    const workbook = buildWorkbook([{ name: 'Deals', rows }], XLSX)
    expect(workbook.SheetNames).toEqual(['Deals'])

    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Deals)
    expect(parsed).toHaveLength(rows.length)
    expect(parsed[0].Opportunity).toBe(rows[0].Opportunity)
  })

  it('truncates sheet names to Excel’s 31-character limit', () => {
    const workbook = buildWorkbook(
      [{ name: 'A name that is far too long for Excel to accept', rows: [] }],
      XLSX,
    )
    expect(workbook.SheetNames[0]).toHaveLength(31)
  })

  it('handles an empty sheet without throwing', () => {
    expect(() => buildWorkbook([{ name: 'Empty', rows: [] }], XLSX)).not.toThrow()
  })

  it('sizes columns to the widest cell, capped', () => {
    const workbook = buildWorkbook([{ name: 'S', rows: [{ Short: 'a', Long: 'x'.repeat(200) }] }], XLSX)
    const cols = workbook.Sheets.S['!cols']!
    expect(cols[0].wch).toBe(10)
    expect(cols[1].wch).toBe(48)
  })
})

describe('exportFilename', () => {
  it('appends a date stamp and the xlsx extension', () => {
    expect(exportFilename('pipeline-direct')).toMatch(/^pipeline-direct-\d{4}-\d{2}-\d{2}\.xlsx$/)
  })
})
