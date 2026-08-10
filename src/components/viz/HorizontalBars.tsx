import { useState } from 'react'
import { cn } from '@/lib/cn'
import { SERIES_FILL, type SeriesSlot } from './primitives'

/**
 * Grouped horizontal bars: one row per category, one bar per series.
 *
 * Horizontal rather than vertical because the categories here are names — stages, owners,
 * partners — and a name reads along a row without being rotated or truncated to fit a tick.
 * Vertical columns are kept for the forecast, where the category is time and the reader
 * expects it to run left to right.
 *
 * Rows are sorted by the caller, not here. The order is meaningful in every case this is
 * used (funnel order, largest-first) and re-sorting inside the component would silently
 * override it.
 */

export interface BarRow {
  key: string
  label: string
  /** Shown at the end of the label line — the one figure worth reading without hovering. */
  primaryLabel: string
  /** Small print under the label, for context the bars do not carry (probability, counts). */
  meta?: string
  values: Array<{ slot: SeriesSlot; label: string; value: number; display: string }>
}

interface Point {
  x: number
  y: number
  row: BarRow
}

export function HorizontalBars({ rows, valueLabel }: { rows: BarRow[]; valueLabel: string }) {
  const [hover, setHover] = useState<Point | null>(null)

  // One scale across every row and both series, so a bar's length means the same thing
  // wherever it appears. A per-row scale would make every category look equally full.
  const max = Math.max(1, ...rows.flatMap((row) => row.values.map((value) => value.value)))

  return (
    <div className="relative">
      <ul className="space-y-24">
        {rows.map((row) => (
          <li
            key={row.key}
            // The hit target is the whole row, not the bar: a stage holding $0 draws a bar
            // of zero width, and a tooltip you cannot reach is worse than none.
            onMouseMove={(event) => setHover({ x: event.clientX, y: event.clientY, row })}
            onMouseLeave={() => setHover(null)}
            className="-mx-8 rounded-lg px-8 py-8 transition-colors duration-hover ease-ui hover:bg-cloud"
          >
            <div className="flex items-baseline justify-between gap-16">
              <span className="min-w-0 truncate text-body-sm font-semibold text-ink-navy">
                {row.label}
              </span>
              <span className="shrink-0 text-body-sm font-semibold text-ink-navy tabular-nums">
                {row.primaryLabel}
              </span>
            </div>

            {/* 2px between the two fills, so adjacent series never bleed into one mark. */}
            <div className="mt-8 space-y-[2px]">
              {row.values.map((value) => (
                <div key={value.slot} className="h-8 rounded-full bg-viz-track">
                  <div
                    className={cn('h-full rounded-r-md', SERIES_FILL[value.slot])}
                    style={{ width: `${(value.value / max) * 100}%` }}
                  />
                </div>
              ))}
            </div>

            {row.meta && <p className="mt-8 text-caption text-mist-gray">{row.meta}</p>}
          </li>
        ))}
      </ul>

      {hover && <Tooltip point={hover} valueLabel={valueLabel} />}
    </div>
  )
}

/**
 * Fixed positioning, offset from the cursor.
 *
 * Fixed rather than absolute because the chart sits inside a card with its own overflow and
 * stacking context, and a tooltip clipped by the panel it belongs to is a tooltip that
 * disappears on the bottom row. Pointer events are off, so it can never eat the hover that
 * is keeping it open.
 */
function Tooltip({ point, valueLabel }: { point: Point; valueLabel: string }) {
  return (
    <div
      role="presentation"
      className="pointer-events-none fixed z-50 min-w-[180px] rounded-xl border border-hairline bg-paper p-16 shadow-sm-2"
      style={{ left: point.x + 16, top: point.y + 16 }}
    >
      <p className="text-body-sm font-semibold text-ink-navy">{point.row.label}</p>
      <p className="mt-[2px] text-caption text-mist-gray">{valueLabel}</p>
      <ul className="mt-8 space-y-[2px]">
        {point.row.values.map((value) => (
          <li key={value.slot} className="flex items-center justify-between gap-24">
            <span className="flex items-center gap-8">
              <span
                aria-hidden
                className={cn('h-8 w-8 shrink-0 rounded-full', SERIES_FILL[value.slot])}
              />
              <span className="text-caption text-slate-gray">{value.label}</span>
            </span>
            <span className="text-caption font-semibold text-ink-navy tabular-nums">
              {value.display}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
