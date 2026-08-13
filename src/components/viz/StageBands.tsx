import { cn } from '@/lib/cn'

/**
 * A pipeline's stages as centred bands, ordered top to bottom.
 *
 * **The taper is the point.** A stage's value is drawn as a centred bar, so the pipeline reads as a shape
 * that narrows or widens down the page — which is the one thing equal-width columns cannot show, because
 * they only vary in height. On a real book this pays for itself immediately: a pipeline carrying more value
 * in its last stage than in the three behind it is thin at the front, and a column chart of the same five
 * numbers makes that invisible.
 *
 * **It is not a conversion funnel, and the copy never says it is.** These are deals resting in stages right
 * now, not a cohort that flowed through them, so nothing here measures drop-off between stages. Most CRMs
 * draw this shape and quietly claim conversion they never recorded; the heading says "where value is
 * sitting" for that reason.
 *
 * Ordered vertically rather than horizontally because stage names are long and the order is meaningful:
 * reading down a column is how a process is read, and it leaves room for the name, the progression
 * percentage, the count and the value on one line without truncation.
 */

export interface StageBand {
  key: string
  label: string
  /** Under the name — the progression percentage, which nothing multiplies by. */
  meta: string
  value: number
  valueDisplay: string
  count: number
  /** False leaves the band visible but inert: an empty stage is information, and drilling it returns none. */
  selectable?: boolean
  /**
   * True when the stage holds at least one deal past its allowance.
   *
   * Drawn as a risk-coloured cap on the end of the bar rather than by recolouring the whole thing: the bar's
   * length is value and its colour should stay the value colour, or a big healthy stage and a small stuck one
   * would be indistinguishable at a glance. The cap says "something in here has stopped" without claiming
   * the whole stage has.
   */
  alert?: boolean
}

export function StageBands({
  bands,
  onSelect,
  selectHint,
}: {
  bands: StageBand[]
  onSelect?: (key: string) => void
  selectHint?: string
}) {
  const max = Math.max(1, ...bands.map((band) => band.value))

  return (
    <ol className="flex flex-col gap-[3px]">
      {bands.map((band) => {
        const clickable = onSelect !== undefined && band.selectable !== false
        const share = Math.max((band.value / max) * 100, band.value > 0 ? 3 : 1)

        const body = (
          <>
            <span className="min-w-0">
              <span className="block truncate text-body-sm font-semibold text-ink-navy">{band.label}</span>
              <span className="block text-caption text-mist-gray">{band.meta}</span>
            </span>

            {/* Centred, so the column of bars forms a silhouette. */}
            <span className="flex min-w-0 justify-center">
              <span
                className={cn(
                  'relative block h-24 overflow-hidden rounded-md bg-viz-1',
                  'transition-[width] duration-300 ease-ui motion-reduce:transition-none',
                  band.value === 0 && 'bg-viz-track',
                )}
                style={{ width: `${share}%` }}
              >
                {band.alert && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 right-0 w-[6px] bg-risk"
                  />
                )}
              </span>
            </span>

            <span className="text-right">
              <span className="block text-body-sm font-semibold text-ink-navy tabular-nums">
                {band.valueDisplay}
              </span>
              <span className="block text-caption text-mist-gray tabular-nums">
                {band.count} {band.count === 1 ? 'deal' : 'deals'}
              </span>
            </span>
          </>
        )

        const shell =
          'grid w-full grid-cols-[minmax(72px,1fr)_minmax(0,3fr)_auto] items-center gap-12 rounded-lg px-8 py-[6px] text-left'

        return (
          <li key={band.key}>
            {clickable ? (
              <button
                type="button"
                onClick={() => onSelect?.(band.key)}
                aria-label={selectHint ? `${band.label} — ${selectHint}` : band.label}
                className={cn(
                  shell,
                  'cursor-pointer transition-colors duration-(--duration-hover) ease-ui hover:bg-cloud',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue',
                )}
              >
                {body}
              </button>
            ) : (
              // Dimmed rather than hidden: an empty stage is exactly the gap a reader opened a funnel to
              // find, and closing the gap up would hide it.
              <div className={cn(shell, 'opacity-60')}>{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
