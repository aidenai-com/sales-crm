import { useState } from 'react'
import { cn } from '@/lib/cn'
import { SERIES_FILL, type SeriesSlot } from './primitives'

/**
 * Grouped columns over time — the forecast, and only the forecast.
 *
 * The category here is a close month, and a reader expects time to run left to right. Every
 * other breakdown on this screen is named categories and uses horizontal rows instead.
 *
 * Never *stacked*: weighted value is the same money multiplied by a probability, so stacking
 * would draw a total that is the sum of a figure and a discounted copy of itself, which is not
 * a quantity anyone should read off a chart.
 *
 * `nested` is not stacking, and is the default here. The outer column's height stays open
 * value, and the weighted column is drawn inside it — so no false total appears, and the
 * relationship the reader sees is the true one: this fraction of that. `grouped` remains for
 * two genuinely independent measures, where neither contains the other.
 */

export interface Column {
  key: string
  label: string
  /** Under the axis label — the deal count, which the bar heights do not carry. */
  meta?: string
  values: Array<{ slot: SeriesSlot; label: string; value: number; display: string }>
}

interface Point {
  x: number
  y: number
  column: Column
}

const PLOT_HEIGHT = 180

/**
 * One column whose height is the containing value, with its part drawn inside.
 *
 * The inner column is narrower and shares the baseline, so the two read as one measurement
 * with a portion marked rather than as two adjacent quantities. Both stay in the same series
 * hue at two opacities — a second hue would say "different thing", and it is the same money.
 */
function NestedColumn({ column, max }: { column: Column; max: number }) {
  const outer = column.values[0]
  const inner = column.values[1]
  if (!outer) return null

  const outerPercent = Math.max((outer.value / max) * 100, 1)
  const innerPercent = outer.value > 0 && inner ? (inner.value / outer.value) * 100 : 0

  return (
    <div
      className="flex w-24 items-end justify-center rounded-t-md bg-viz-1/35"
      style={{ height: `${outerPercent}%` }}
    >
      <div
        className="w-16 rounded-t-[3px] bg-viz-1"
        style={{ height: `${innerPercent}%` }}
      />
    </div>
  )
}

export function ColumnChart({
  columns,
  valueLabel,
  mode = 'grouped',
}: {
  columns: Column[]
  valueLabel: string
  /** `nested` expects exactly two values per column: the container first, its part second. */
  mode?: 'grouped' | 'nested'
}) {
  const [hover, setHover] = useState<Point | null>(null)

  // Nested columns are measured against the containing value alone. Including the inner value
  // in the scale would be measuring the same money twice.
  const max = Math.max(
    1,
    ...columns.flatMap((column) =>
      mode === 'nested' ? [column.values[0]?.value ?? 0] : column.values.map((v) => v.value),
    ),
  )

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-8">
        <ul
          className="flex min-w-full items-end gap-16"
          style={{ height: PLOT_HEIGHT }}
          // The baseline is the only rule drawn. Gridlines across a six-column chart whose
          // exact values are one hover or one table-toggle away are decoration.
        >
          {columns.map((column) => (
            <li
              key={column.key}
              onMouseMove={(event) => setHover({ x: event.clientX, y: event.clientY, column })}
              onMouseLeave={() => setHover(null)}
              className="flex h-full min-w-[56px] flex-1 flex-col justify-end rounded-lg px-8 pt-8 transition-colors duration-hover ease-ui hover:bg-cloud"
            >
              <div className="flex h-full items-end justify-center gap-[2px]">
                {mode === 'nested' ? (
                  <NestedColumn column={column} max={max} />
                ) : (
                  column.values.map((value) => (
                    <div
                      key={value.slot}
                      className={cn('w-16 rounded-t-md', SERIES_FILL[value.slot])}
                      // A zero month still gets a hairline of fill, so an empty month reads as
                      // "nothing closes here" rather than as a gap in the chart.
                      style={{ height: `${Math.max((value.value / max) * 100, 1)}%` }}
                    />
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>

        <ul className="flex min-w-full items-start gap-16 border-t border-hairline pt-8">
          {columns.map((column) => (
            <li key={column.key} className="min-w-[56px] flex-1 px-8 text-center">
              <span className="block text-caption font-semibold text-ink-navy">{column.label}</span>
              {column.meta && <span className="block text-caption text-mist-gray">{column.meta}</span>}
            </li>
          ))}
        </ul>
      </div>

      {hover && (
        <div
          role="presentation"

          className="pointer-events-none fixed z-50 min-w-[180px] rounded-xl border border-hairline bg-paper p-16 shadow-sm-2"
          style={{ left: hover.x + 16, top: hover.y + 16 }}
        >
          <p className="text-body-sm font-semibold text-ink-navy">{hover.column.label}</p>
          <p className="mt-[2px] text-caption text-mist-gray">{valueLabel}</p>
          <ul className="mt-8 space-y-[2px]">
            {hover.column.values.map((value) => (
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
      )}
    </div>
  )
}
