import type { Ageing } from '@/types/domain'
import { cn } from '@/lib/cn'

/**
 * Days spent against days allowed — a bar that can exceed its own track.
 *
 * **The overflow is the whole idea.** Every other bar in this application is a share of something and stops
 * at the end of its track. This one is a ratio that can pass 100%, and when it does it keeps going into a
 * marked overrun zone in the risk colour. "Three months in a stage the process gives three weeks" stops
 * being two numbers to compare and becomes a shape you cannot miss, which is exactly the failure the
 * requirement is about: a deal quietly sitting still while nothing on screen changes colour.
 *
 * The track is drawn to 100% and the overrun extends past a hairline marker, so the eye reads *how far past*
 * rather than only *past*. A bar simply capped at full would make ten days over and a hundred look alike.
 *
 * `basis` is printed alongside because the two measures are different claims. Measured from a logged move,
 * this is time in the current stage. With no move ever recorded, it is time since the deal was created
 * against everything the process allows up to here — still true, but about the deal rather than the stage,
 * and the label says so instead of letting a reader assume the sharper reading.
 */

export function AgeingBar({
  ageing,
  stageName,
  size = 'md',
}: {
  ageing: Ageing
  /** Named in the spoken label, so a screen reader gets "96 of 45 days in Validate". */
  stageName?: string
  size?: 'sm' | 'md'
}) {
  const { daysUsed, daysExpected, daysOver, daysLeft, basis } = ageing

  // Nothing to judge against. Shown as a plain count rather than a bar with an invented denominator.
  if (daysExpected === null || daysExpected <= 0) {
    return (
      <span className="text-caption text-slate-gray tabular-nums">
        {daysUsed}d in stage · no expectation set
      </span>
    )
  }

  const over = daysOver > 0
  // Within the allowance the fill is its true share. Past it, the bar is redrawn as
  // allowance-plus-overrun, both scaled so the pair fits: the overrun keeps a visible length however far it
  // has run, and the allowance stays legible behind it rather than being squeezed to nothing.
  const usedShare = Math.min((daysUsed / daysExpected) * 100, 100)
  const overShare = over ? Math.min((daysOver / daysExpected) * 100, 100) : 0
  const scale = over ? 100 / (100 + overShare) : 1

  const height = size === 'sm' ? 'h-[6px]' : 'h-8'

  const spoken = over
    ? `${daysUsed} days${stageName ? ` in ${stageName}` : ''}, ${daysExpected} expected — ${daysOver} over`
    : `${daysUsed} of ${daysExpected} days${stageName ? ` in ${stageName}` : ''}, ${daysLeft} left`

  return (
    <span className="block">
      <span
        role="img"
        aria-label={spoken}
        className={cn('relative flex w-full overflow-hidden rounded-[3px] bg-viz-track', height)}
      >
        <span
          className={cn(
            'block transition-[width] duration-300 ease-ui motion-reduce:transition-none',
            over ? 'bg-slate-gray' : 'bg-viz-1',
          )}
          style={{ width: `${usedShare * scale}%` }}
        />
        {over && (
          <>
            {/* The allowance line. Where the bar *should* have ended, kept visible so the overrun is
                measured against something rather than just being long. */}
            <span aria-hidden className="block w-px shrink-0 bg-paper" />
            <span
              className="block bg-risk transition-[width] duration-300 ease-ui motion-reduce:transition-none"
              style={{ width: `${overShare * scale}%` }}
            />
          </>
        )}
      </span>

      <span className="mt-[2px] flex flex-wrap items-baseline gap-x-8 text-caption tabular-nums">
        <span className={cn('font-semibold', over ? 'text-risk' : 'text-slate-gray')}>
          {over ? `${daysOver}d over` : `${daysLeft}d left`}
        </span>
        <span className="text-mist-gray">
          {daysUsed} of {daysExpected}d
          {/* Stated, not implied. A cycle-based figure is a claim about the deal, not the stage. */}
          {basis === 'cycle' && ' · whole cycle, no move logged'}
        </span>
      </span>
    </span>
  )
}
