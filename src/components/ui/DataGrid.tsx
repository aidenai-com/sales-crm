import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The table for a working list: dense, scannable, and quiet.
 *
 * Distinct from `DataTable` in the viz primitives, which exists to print a handful of summary rows under a
 * chart. This one is for lists somebody scrolls and acts on — hundreds of rows, a sticky header, rows that
 * expand in place, and an action column that does not drift.
 *
 * Three choices worth stating, because each is the opposite of the obvious one.
 *
 * **No zebra striping.** Alternating fills are a crutch for rows that are too tall and too loosely aligned.
 * A hairline rule and honest vertical rhythm read cleaner and survive the dark theme, where a 4% tint is
 * either invisible or muddy.
 *
 * **The header is Pebble, not Paper.** It reads as a rail the content hangs from rather than a first row of
 * data, which matters when it sticks: a white sticky header floating over white rows dissolves the moment
 * anything scrolls under it.
 *
 * **Rows carry their own expansion.** A modal for row detail loses the list you were reading, and this
 * detail is short — a timeline and a form. Expanding in place keeps the neighbours you were comparing
 * against on screen.
 */

export interface GridColumn {
  key: string
  label: string
  /** Right-aligns and applies `tabular-nums`. For counts and dates, never for names. */
  numeric?: boolean
  /** Extra width or alignment classes for both the header cell and its column's cells. */
  className?: string
  /** Hides the label but keeps it for screen readers — for an action column that needs no heading. */
  hideLabel?: boolean
}

export function DataGrid({
  columns,
  children,
  minWidth = 880,
  className,
}: {
  columns: GridColumn[]
  children: ReactNode
  /** Below this the grid scrolls sideways rather than crushing columns into unreadable slivers. */
  minWidth?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-2xl border border-hairline bg-paper shadow-sm',
        className,
      )}
    >
      <table className="w-full border-collapse" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-hairline bg-pebble">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-16 py-8 text-caption font-semibold tracking-wide text-slate-gray uppercase',
                  column.numeric ? 'text-right' : 'text-left',
                  column.className,
                )}
              >
                {column.hideLabel ? <span className="sr-only">{column.label}</span> : column.label}
              </th>
            ))}
          </tr>
        </thead>
        {children}
      </table>
    </div>
  )
}

/**
 * One row, plus its optional expansion.
 *
 * The expansion is a second `<tr>` rather than a nested table, so its cell spans the full width and the
 * columns above it stay aligned — a nested grid would introduce a second, disagreeing set of column widths
 * directly under the first.
 *
 * The control that expands a row belongs to the caller, in a cell, as a real button. A row-wide `onClick`
 * would swallow text selection and give a screen reader a clickable element with no name.
 */
export function GridRow({
  cells,
  expanded,
  detail,
  columnCount,
  accent,
}: {
  cells: ReactNode[]
  expanded?: boolean
  detail?: ReactNode
  columnCount: number
  /** A left edge in a token colour, for a row that needs to stand out in a scan. */
  accent?: string
}) {
  return (
    <tbody className={cn('border-b border-hairline last:border-0', expanded && 'bg-cloud')}>
      <tr
        // Clickable rows, but the row is not the control: each cell keeps its own buttons and links, and the
        // toggle is a real button in the last cell. A row-wide onClick would swallow text selection.
        className={cn('transition-colors duration-(--duration-hover) ease-ui', !expanded && 'hover:bg-cloud')}
      >
        {cells.map((cell, index) => (
          <td
            key={index}
            className={cn(
              'px-16 py-12 align-middle',
              // The accent is drawn as an inset border on the first cell rather than a wrapper element, so
              // it cannot disturb the row's alignment.
              index === 0 && accent && 'border-l-2',
            )}
            style={index === 0 && accent ? { borderLeftColor: accent } : undefined}
          >
            {cell}
          </td>
        ))}
      </tr>

      {expanded && detail && (
        <tr>
          <td colSpan={columnCount} className="px-16 pb-16">
            {detail}
          </td>
        </tr>
      )}
    </tbody>
  )
}
