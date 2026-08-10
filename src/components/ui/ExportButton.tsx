import { Button } from './Button'
import { downloadWorkbook, exportFilename, type Sheet } from '@/lib/export'

/**
 * Every list, board, and tree view carries this (R9). The label names the outcome,
 * and it exports what is currently on screen.
 */
export function ExportButton({
  sheets,
  filenameBase,
  label = 'Download to Excel',
}: {
  sheets: Sheet[]
  filenameBase: string
  label?: string
}) {
  const rowCount = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={rowCount === 0}
      onClick={() => {
        void downloadWorkbook(sheets, exportFilename(filenameBase))
      }}
      title={rowCount === 0 ? 'Nothing to export in this view' : `Exports ${rowCount} rows`}
    >
      <svg viewBox="0 0 20 20" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </Button>
  )
}
