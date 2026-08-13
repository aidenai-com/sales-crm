import { cn } from '@/lib/cn'

/**
 * Columns for this period with the previous one drawn behind them.
 *
 * The comparison used to live only in a caption — "$8.4M, up from $5.1M last quarter" — which puts the
 * arithmetic in the reader's head. Drawing the prior period as an outline behind each column puts it where
 * the eye already is, and makes a per-bucket comparison possible rather than only a total one: "March was
 * our month last year too" is a different finding from "we created more last year".
 *
 * The outline is an outline rather than a second solid bar because it is **reference, not a series**. Two
 * solid bars per bucket would read as two things being measured; a ghost behind reads as "against this".
 *
 * An empty prior period is drawn as a hairline on the baseline rather than omitted, and the panel says so in
 * words. Nothing there is a real fact — a flat line that looks like a measured zero is worse than an
 * absence somebody can see.
 */

export interface GhostColumn {
  key: string
  label: string
  value: number
  valueDisplay: string
  count: number
  /** The same position in the previous window. Zero when there was nothing, or nothing recorded. */
  priorValue: number
  selectable?: boolean
}

const HEIGHT = 168
const PAD = 8

export function GhostColumns({
  columns,
  priorLabel,
  hasPrior,
  onSelect,
  selectedKey,
  selectHint,
}: {
  columns: GhostColumn[]
  /** What the outline is — "last quarter". Named so the ghost is never an unexplained shape. */
  priorLabel: string
  /** False when the previous window holds nothing, which changes the copy rather than hiding the outline. */
  hasPrior: boolean
  onSelect?: (key: string) => void
  selectedKey?: string | null
  selectHint?: string
}) {
  const max = Math.max(1, ...columns.flatMap((column) => [column.value, column.priorValue]))
  const width = Math.max(columns.length * 48, 320)
  const step = (width - PAD * 2) / Math.max(columns.length, 1)

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block h-auto w-full min-w-[320px]"
          role="img"
          aria-label={`Value created per bucket, against ${priorLabel}.`}
        >
          {columns.map((column, index) => {
            const height = (column.value / max) * (HEIGHT - PAD * 2)
            const priorHeight = (column.priorValue / max) * (HEIGHT - PAD * 2)
            const selected = selectedKey === column.key

            return (
              <g key={column.key}>
                {/* The ghost, wider than the solid column so it reads as the thing behind. */}
                {column.priorValue > 0 ? (
                  <rect
                    x={PAD + step * index + step * 0.16}
                    y={HEIGHT - PAD - priorHeight}
                    width={step * 0.68}
                    height={Math.max(priorHeight, 1)}
                    rx={3}
                    fill="none"
                    strokeWidth={1}
                    className="stroke-mist-gray"
                  />
                ) : (
                  <rect
                    x={PAD + step * index + step * 0.16}
                    y={HEIGHT - PAD - 1}
                    width={step * 0.68}
                    height={1}
                    className="fill-mist-gray"
                  />
                )}

                {column.value > 0 && (
                  <rect
                    x={PAD + step * index + step * 0.26}
                    y={HEIGHT - PAD - height}
                    width={step * 0.48}
                    height={Math.max(height, 2)}
                    rx={3}
                    className={cn(
                      'fill-viz-1 transition-opacity duration-(--duration-hover) ease-ui',
                      selectedKey && !selected && 'opacity-45',
                    )}
                  />
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <ul className="flex min-w-full gap-8 border-t border-hairline pt-8">
        {columns.map((column) => {
          const clickable = onSelect !== undefined && column.selectable !== false
          const cell = (
            <>
              <span
                className={cn(
                  'block truncate text-caption font-semibold',
                  selectedKey === column.key ? 'text-signal-blue' : 'text-ink-navy',
                )}
              >
                {column.label}
              </span>
              <span className="block text-caption text-mist-gray tabular-nums">
                {column.value > 0 ? column.valueDisplay : '—'}
              </span>
              {clickable && (
                <span aria-hidden="true" className="block text-caption text-mist-gray">
                  ›
                </span>
              )}
            </>
          )

          return (
            <li key={column.key} className="min-w-[40px] flex-1">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(column.key)}
                  aria-label={selectHint ? `${column.label} — ${selectHint}` : column.label}
                  className={cn(
                    'w-full rounded-lg px-[2px] py-[2px] text-center',
                    'transition-colors duration-(--duration-hover) ease-ui hover:bg-cloud',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue',
                    selectedKey === column.key && 'bg-badge-fill',
                  )}
                >
                  {cell}
                </button>
              ) : (
                <div className="px-[2px] py-[2px] text-center opacity-60">{cell}</div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="mt-16 flex items-center gap-8 text-caption text-slate-gray">
        <span aria-hidden className="block h-8 w-16 shrink-0 rounded-[2px] border border-mist-gray" />
        {hasPrior
          ? `The outline is ${priorLabel}, bucket for bucket.`
          : `Nothing was created ${priorLabel}, so the outline sits on the baseline — an absence, not a measured zero.`}
      </p>
    </div>
  )
}
