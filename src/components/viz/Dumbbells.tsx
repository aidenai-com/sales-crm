import { cn } from '@/lib/cn'

/**
 * Two values per row on one line, with the distance between them as the reading.
 *
 * This replaces a pair of stacked bars per person. Stacked bars put the two measures on separate lines, so
 * comparing them means comparing lengths that do not share a starting edge — the eye is bad at that. A
 * dumbbell puts both on one axis: the gap *is* the difference, and its direction says which is larger
 * without reading a number.
 *
 * It also handles gracefully the case stacked bars make awkward: somebody whose closed-won exceeds their
 * open pipeline. The won dot simply sits to the right of the open one, and the row still reads correctly —
 * whereas two bars would just be two lengths with no cue that the order had flipped.
 *
 * Only honest for two **independent** measures. Open pipeline and closed-won qualify: money banked is not a
 * fraction of money in play. A part against its whole would be a lie here, the same lie the weighted-value
 * nesting used to tell.
 */

export interface Dumbbell {
  key: string
  label: string
  /** Under the label — the counts the dots cannot carry. */
  meta: string
  primary: number
  primaryDisplay: string
  secondary: number
  secondaryDisplay: string
  selectable?: boolean
}

export function Dumbbells({
  rows,
  primaryLabel,
  secondaryLabel,
  onSelect,
  selectHint,
}: {
  rows: Dumbbell[]
  primaryLabel: string
  secondaryLabel: string
  onSelect?: (key: string) => void
  selectHint?: string
}) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.primary, row.secondary]))

  return (
    <div>
      <ul className="flex flex-wrap items-center gap-16 pb-16">
        <li className="flex items-center gap-8">
          <span aria-hidden className="size-8 shrink-0 rounded-full bg-viz-1" />
          <span className="text-caption text-slate-gray">{primaryLabel}</span>
        </li>
        <li className="flex items-center gap-8">
          <span aria-hidden className="size-8 shrink-0 rounded-full bg-viz-won" />
          <span className="text-caption text-slate-gray">{secondaryLabel}</span>
        </li>
      </ul>

      <ol className="divide-y divide-hairline">
        {rows.map((row) => {
          const clickable = onSelect !== undefined && row.selectable !== false
          const primaryPercent = (row.primary / max) * 100
          const secondaryPercent = (row.secondary / max) * 100

          const body = (
            <>
              <span className="min-w-0">
                <span className="block truncate text-body-sm font-semibold text-ink-navy">{row.label}</span>
                <span className="block text-caption text-mist-gray tabular-nums">{row.meta}</span>
              </span>

              <span className="relative block h-24 min-w-0">
                {/* The full scale, so rows are comparable with each other and not only within themselves. */}
                <span aria-hidden className="absolute top-[11px] right-0 left-0 h-[2px] rounded-full bg-viz-track" />
                {/* The span between the two values — the quantity the component exists to show. */}
                <span
                  aria-hidden
                  className="absolute top-[11px] h-[2px] rounded-full bg-hairline"
                  style={{
                    left: `${Math.min(primaryPercent, secondaryPercent)}%`,
                    width: `${Math.abs(primaryPercent - secondaryPercent)}%`,
                  }}
                />
                {/* Won drawn first, so a tie leaves the open dot on top — open pipeline is the ranking
                    measure, and it should not be the one that disappears. */}
                <Dot percent={secondaryPercent} fill="bg-viz-won" title={`${secondaryLabel} ${row.secondaryDisplay}`} />
                <Dot percent={primaryPercent} fill="bg-viz-1" title={`${primaryLabel} ${row.primaryDisplay}`} />
              </span>

              <span className="text-right">
                <span className="block text-body-sm font-semibold text-ink-navy tabular-nums">
                  {row.primaryDisplay}
                </span>
                <span className="block text-caption text-mist-gray tabular-nums">{row.secondaryDisplay}</span>
              </span>
            </>
          )

          const shell =
            'grid w-full grid-cols-[minmax(88px,1fr)_minmax(0,3fr)_auto] items-center gap-12 px-8 py-12 text-left'

          return (
            <li key={row.key} className="-mx-8">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(row.key)}
                  aria-label={selectHint ? `${row.label} — ${selectHint}` : row.label}
                  className={cn(
                    shell,
                    'cursor-pointer rounded-lg transition-colors duration-(--duration-hover) ease-ui hover:bg-cloud',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue',
                  )}
                >
                  {body}
                </button>
              ) : (
                <div className={shell}>{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Dot({ percent, fill, title }: { percent: number; fill: string; title: string }) {
  return (
    <span
      title={title}
      className={cn(
        // A surface ring, so two dots that land close together still read as two marks rather than a blob.
        'absolute top-[5px] -ml-[7px] block size-[14px] rounded-full border-2 border-paper',
        fill,
      )}
      style={{ left: `${percent}%` }}
    />
  )
}
