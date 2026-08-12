// Type-only so the library itself stays out of the initial bundle.
import type * as XLSX from 'xlsx'
import type { ActivityView, DealView } from './rollup'
import { fullDate } from './format'
import { HEALTH_LABEL } from './health'

/**
 * Excel export (R9).
 *
 * Scope decision: every export writes the CURRENT VIEW as rendered — it respects the
 * active pipeline tab, search text, and filters. spec.md Section 5 leaves full-export
 * vs. filtered-view open; this is the assumed answer and is easy to widen later by
 * passing unfiltered views in.
 */

export type Row = Record<string, string | number>

export function dealRows(views: DealView[]): Row[] {
  return views.map((v) => ({
    Account: v.account.name,
    Opportunity: v.deal.name,
    'Business unit': v.lead?.businessUnit ?? '',
    Pipeline: v.pipeline.name,
    Stage: v.stage.name,
    'Probability %': v.stage.probability,
    // The header names the unit, so a spreadsheet opened months later is unambiguous.
    // Everything is USD; there is no per-row currency column to vary.
    'Value (USD)': v.deal.value,
    'Expected close': fullDate(v.deal.expectedCloseDate),
    Owner: v.ownerName,
    Status: HEALTH_LABEL[v.health],
  }))
}

export function activityRows(views: ActivityView[]): Row[] {
  return views.map((v) => ({
    Date: fullDate(v.activity.occurredAt),
    Type: v.activity.kind,
    'Logged against': v.activity.subjectType,
    Subject: v.subjectLabel,
    Summary: v.activity.summary,
    Author: v.authorName,
  }))
}

export interface Sheet {
  name: string
  rows: Row[]
}

/** Widths sized to content so the file is readable the moment it opens. */
function columnWidths(rows: Row[]): Array<{ wch: number }> {
  if (rows.length === 0) return []
  return Object.keys(rows[0]).map((key) => {
    const longest = rows.reduce((max, row) => Math.max(max, String(row[key] ?? '').length), key.length)
    return { wch: Math.min(Math.max(longest + 2, 10), 48) }
  })
}

/** Builds the workbook. Separated from the download so it can be unit-tested. */
export function buildWorkbook(sheets: Sheet[], lib: typeof XLSX): XLSX.WorkBook {
  const workbook = lib.utils.book_new()
  for (const sheet of sheets) {
    const worksheet = lib.utils.json_to_sheet(sheet.rows)
    worksheet['!cols'] = columnWidths(sheet.rows)
    // Excel caps sheet names at 31 characters.
    lib.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31))
  }
  return workbook
}

/**
 * SheetJS is by far the largest dependency here and it is only needed the moment
 * someone exports, so it is loaded on demand rather than in the initial bundle.
 */
export async function downloadWorkbook(sheets: Sheet[], filename: string): Promise<void> {
  const lib = await import('xlsx')
  lib.writeFile(buildWorkbook(sheets, lib), filename)
}

/** Timestamped filename so repeated exports don't overwrite each other. */
export function exportFilename(base: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${base}-${stamp}.xlsx`
}
