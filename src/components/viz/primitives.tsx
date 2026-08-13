import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The pieces every chart on the Analytics screen is built from.
 *
 * There is no charting library here for the same reason there is no routing library: the
 * screen draws bars and columns from numbers that are already aggregated server-side. A
 * chart library would arrive with an SVG renderer, a scale system and a layout engine to
 * solve problems this screen does not have, and would bring its own colours — which are
 * the one thing here that is not a free choice (see the viz tokens in `theme.css`).
 *
 * Bars are divs wherever a bar is all that is needed: they reflow with the container for free, inherit the
 * theme tokens without a paint pass, and read to a screen reader as the list they actually are. SVG appears
 * only where geometry genuinely requires it — a cumulative line and an area need real coordinates, and a
 * ghosted outline needs a stroke. The rule is that the form decides, not the file.
 */

/** The two series slots, by role. Never index past these — a third series is not validated. */
export type SeriesSlot = 1 | 2

const SERIES_FILL: Record<SeriesSlot, string> = {
  1: 'bg-viz-1',
  2: 'bg-viz-2',
}

export interface Series {
  slot: SeriesSlot
  label: string
}

/**
 * Always present for two series, absent for one.
 *
 * A single-series chart names its series in the chart title, so a legend box would just be
 * a second copy of the heading. With two, identity is never left to colour alone: the
 * legend is the text channel that makes the fills mean something.
 */
export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null

  return (
    <ul className="flex flex-wrap items-center gap-16">
      {series.map((item) => (
        <li key={item.slot} className="flex items-center gap-8">
          <span
            aria-hidden
            className={cn('h-8 w-8 shrink-0 rounded-full', SERIES_FILL[item.slot])}
          />
          <span className="text-caption text-slate-gray">{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A single figure that needs no plot.
 *
 * The form heuristic's first question is whether the data is even a chart. One number with
 * no comparison inside it — total open value, a win rate — is a number; drawing it as a
 * one-bar chart would add a scale, an axis and a legend that carry nothing.
 */
export function StatTile({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-cloud px-16 py-16 sm:px-24">
      <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">{label}</p>
      <p
        className={cn(
          'mt-8 font-bold text-ink-navy tabular-nums',
          emphasis ? 'text-heading-sm' : 'text-subheading',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-8 text-caption text-slate-gray">{hint}</p>}
    </div>
  )
}

/**
 * The panel a chart lives in: heading, legend, the plot, and a table view behind a toggle.
 *
 * The table is not an afterthought — it is the accessibility contract. Every figure on this
 * screen is reachable as text, which is what makes it defensible to draw a bar whose exact
 * value a reader cannot measure off a chart, and what a screen reader gets instead of a
 * pile of divs.
 */
export function ChartPanel({
  title,
  subtitle,
  series = [],
  table,
  action,
  children,
}: {
  title: string
  subtitle?: string
  series?: Series[]
<<<<<<< Updated upstream
=======
  /**
   * A key that is not a list of series slots — a scale, a note about what the bars exclude.
   *
   * Most panels now pass neither this nor `series`: with weighted value gone each chart carries one
   * measure, and a legend box for a single colour is furniture. Takes precedence over `series`.
   */
  legend?: ReactNode
>>>>>>> Stashed changes
  table: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)

  return (
    // 16px of padding on a phone and 24px above it. A 24px inset each side of a 360px screen leaves 312px
    // for a chart, and the axis labels start colliding before the bars do.
    <section className="rounded-3xl border border-hairline bg-paper p-16 shadow-sm sm:p-24">
      <div className="flex flex-wrap items-start justify-between gap-16">
        <div className="min-w-0">
          <h2 className="text-body-lg font-semibold text-ink-navy">{title}</h2>
          {subtitle && <p className="mt-8 text-body-sm text-slate-gray">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-16">
          {action}
          <button
            type="button"
            onClick={() => setShowTable((open) => !open)}
            aria-expanded={showTable}
            className="rounded-lg px-8 py-[2px] text-caption font-semibold text-signal-blue hover:bg-pebble"
          >
            {showTable ? 'Show chart' : 'Show table'}
          </button>
        </div>
      </div>

      {series.length > 0 && (
        <div className="mt-16">
          <Legend series={series} />
        </div>
      )}

      <div className="mt-24">{showTable ? table : children}</div>
    </section>
  )
}

/** The table view's shell, so every chart's fallback reads the same way. */
export function DataTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Array<{ key: string; cells: ReactNode[] }>
}) {
  if (rows.length === 0) {
    return <p className="text-body-sm text-slate-gray">Nothing to show for these filters.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-body-sm">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={cn(
                  'border-b border-hairline pb-8 text-caption font-semibold tracking-wide text-slate-gray uppercase',
                  index === 0 ? 'text-left' : 'text-right',
                )}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    'border-b border-hairline py-8 last:border-0',
                    index === 0
                      ? 'pr-16 text-ink-navy'
                      : 'text-right tabular-nums text-slate-gray',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** No data is a state worth designing; an empty plot area is not. */
export function ChartEmpty({ message }: { message: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-hairline bg-cloud px-24 py-32 text-center text-body-sm text-slate-gray">
      {message}
    </p>
  )
}

export { SERIES_FILL }
